"""Code mode UTCP client extension that adds Python code execution capabilities.

This module extends the base UtcpClient to provide Python code execution
functionality, allowing execution of Python code that can directly call
registered tools as functions.

Key Features:
    - Python code execution with tool access
    - Automatic Python type hint generation from JSON schemas
    - Console output capture
    - Tool introspection capabilities
    - Safe execution environment with timeout support
    - Code sandboxing using RestrictedPython
    - Import restrictions (safe modules only)
    - Limited builtins for security
    - Comprehensive security logging
    - Tool call integration within same process
"""
from typing import Dict, Any, List, Optional, Union, TYPE_CHECKING
import logging
import asyncio
import urllib.request
import urllib.error
import json
from RestrictedPython import compile_restricted
from RestrictedPython.Guards import safe_globals
from RestrictedPython.PrintCollector import PrintCollector

from utcp.utcp_client import UtcpClient
from utcp.data.utcp_client_config import UtcpClientConfig
from utcp.data.tool import Tool, JsonSchema

if TYPE_CHECKING:
    from utcp.implementations.utcp_client_implementation import UtcpClientImplementation

logger = logging.getLogger(__name__)


class CodeModeUtcpClient(UtcpClient):
    """REQUIRED
    Code mode UTCP client that extends UtcpClient with Python code execution capabilities.
    
    This client allows executing Python code that can directly call registered tools
    as functions. It provides automatic type hint generation from JSON schemas and
    a secure execution environment with comprehensive safety measures.
    
    Security Features:
        - Code sandboxing via RestrictedPython compilation
        - Restricted imports (safe modules only)
        - Limited builtins (no exec/eval/open/file operations)
        - Safe globals from RestrictedPython
        - Print output collection and capture
        - Comprehensive security logging
        - Timeout enforcement with asyncio
        - Tool calls execute in same process with full access
    
    This implementation uses RestrictedPython for secure code execution
    while maintaining tool call functionality in LLM environments.
    """

    AGENT_PROMPT_TEMPLATE = """
## UTCP CodeMode Tool Usage Guide

You have access to a CodeModeUtcpClient that allows you to execute Python code with access to registered tools. Follow this workflow:

### 1. Tool Discovery Phase
**Always start by discovering available tools:**
- Tools are organized by manual namespace (e.g., `manual_name.tool_name`)
- Use hierarchical access patterns: `manual.tool(param=value)`
- Multiple manuals can contain tools with the same name - namespaces prevent conflicts

### 2. Interface Introspection
**Understand tool contracts before using them:**
- Access `__interfaces` to see all available Python type definitions
- Use `__get_tool_interface('manual.tool')` to get specific tool interfaces
- Interfaces show required inputs, expected outputs, and descriptions
- Look for "Access as: manual.tool(args)" comments for usage patterns

### 3. Code Execution Guidelines
**When writing code for `call_tool_chain`:**
- Use `manual.tool(param=value)` syntax for all tool calls (synchronous - no await needed!)
- Tools are regular functions that block until completion
- You have access to standard Python globals: `print`, `json`, `math`, `datetime`, etc.
- All print output is automatically captured and returned
- Build properly structured input objects based on interface definitions
- Handle errors appropriately with try/except blocks
- Chain tool calls by using results from previous calls
- Use `return value` to return a result from code execution

### 4. Best Practices
- **Discover first, code second**: Always explore available tools before writing execution code
- **Respect namespaces**: Use full `manual.tool` names to avoid conflicts
- **Parse interfaces**: Use interface information to construct proper input objects
- **Error handling**: Wrap tool calls in try/except for robustness
- **Data flow**: Chain tools by passing outputs as inputs to subsequent tools
- **Return values**: Use `return your_value` to return a value from code execution

### 5. Available Runtime Context
- `__interfaces`: String containing all Python type definitions
- `__get_tool_interface(tool_name)`: Function to get specific tool interface
- All registered tools as `manual.tool` synchronous functions
- Standard Python built-ins for data processing

Remember: Always discover and understand available tools before attempting to use them in code execution.
""".strip()

    def __init__(self, base_client: 'UtcpClient'):
        """Initialize the CodeModeUtcpClient.
        
        Args:
            base_client: The base UtcpClient to wrap
        """
        self._base_client = base_client
        self._tool_function_cache: Dict[str, str] = {}
        
    @classmethod
    async def create(
        cls,
        root_dir: Optional[str] = None,
        config: Optional[Union[str, Dict[str, Any], UtcpClientConfig]] = None,
    ) -> 'CodeModeUtcpClient':
        """Create a new CodeModeUtcpClient instance.

        This creates a regular UtcpClient first and then wraps it with
        CodeModeUtcpClient functionality.

        Args:
            root_dir: The root directory for the client to resolve relative paths from
            config: The configuration for the client. Can be a file path, a URL
                     (http/https) pointing to a JSON config in a bucket, a dict,
                     or a UtcpClientConfig object.

        Returns:
            A new CodeModeUtcpClient instance
        """
        if isinstance(config, str) and (config.startswith('http://') or config.startswith('https://')):

            def _fetch_config(url: str) -> dict:
                class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
                    def redirect_request(self, req, fp, code, msg, headers, newurl):
                        raise urllib.error.HTTPError(
                            req.full_url, code,
                            f"Redirects are not allowed when loading config: {msg}",
                            headers, fp,
                        )

                opener = urllib.request.build_opener(_NoRedirectHandler)
                request = urllib.request.Request(url)
                with opener.open(request, timeout=10) as response:
                    return json.loads(response.read().decode('utf-8'))

            url = config
            try:
                config = await asyncio.to_thread(_fetch_config, url)
            except Exception as e:
                raise RuntimeError(f"Failed to load configuration from URL {url}") from e

        # Import here to avoid circular import
        from utcp.implementations.utcp_client_implementation import UtcpClientImplementation  # noqa: F811

        # Create the base client
        base_client = await UtcpClientImplementation.create(root_dir, config)
        return cls(base_client)

    def _sanitize_identifier(self, name: str) -> str:
        """Sanitize an identifier to be a valid Python identifier.
        
        Replaces any non-alphanumeric character (except underscore) with underscore
        and ensures the first character is not a number.
        
        Args:
            name: The name to sanitize
            
        Returns:
            Sanitized identifier
        """
        import re
        sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name)
        if sanitized and sanitized[0].isdigit():
            sanitized = '_' + sanitized
        return sanitized

    def tool_to_python_interface(self, tool: Tool) -> str:
        """REQUIRED
        Convert a Tool object into a Python type hint interface string.
        
        This generates the function signature and type hints that can be used
        in Python code.
        
        Args:
            tool: The Tool object to convert
            
        Returns:
            Python type hint interface as a string
        """
        if tool.name in self._tool_function_cache:
            return self._tool_function_cache[tool.name]

        # Generate hierarchical interface structure
        interface_content: str
        access_pattern: str
        
        if '.' in tool.name:
            manual_name, *tool_parts = tool.name.split('.')
            sanitized_manual_name = self._sanitize_identifier(manual_name)
            tool_name = '_'.join(self._sanitize_identifier(part) for part in tool_parts)
            access_pattern = f"{sanitized_manual_name}.{tool_name}"
            
            # Generate TypedDict classes within namespace
            input_class_content = self._json_schema_to_typed_dict_content(tool.inputs)
            output_class_content = self._json_schema_to_typed_dict_content(tool.outputs)
            
            interface_content = f"""
# Namespace: {sanitized_manual_name}
class {tool_name}Input(TypedDict):
{input_class_content}

class {tool_name}Output(TypedDict):
{output_class_content}"""
        else:
            # No manual namespace, generate flat interfaces
            sanitized_tool_name = self._sanitize_identifier(tool.name)
            access_pattern = f"{sanitized_tool_name}"
            input_type = self._json_schema_to_python_type(tool.inputs, f"{sanitized_tool_name}Input")
            output_type = self._json_schema_to_python_type(tool.outputs, f"{sanitized_tool_name}Output")
            interface_content = f"{input_type}\n\n{output_type}"
            
        interface_string = f"""{interface_content}

# {tool.description}
# Tags: {', '.join(tool.tags)}
# Access as: {access_pattern}(args)
"""

        self._tool_function_cache[tool.name] = interface_string
        return interface_string

    async def get_all_tools_python_interfaces(self) -> str:
        """REQUIRED
        Convert all registered tools to Python type hint definitions.
        
        This provides the complete type definitions for all available tools.
        
        Returns:
            A complete Python type hint definition string
        """
        tools = await self.get_tools()
        interfaces = [self.tool_to_python_interface(tool) for tool in tools]
        
        return f"""# Auto-generated Python interfaces for UTCP tools
from typing import TypedDict, Any, List, Dict, Optional, Union
import asyncio

{chr(10).join(interfaces)}"""

    async def call_tool_chain(self, code: str, timeout: int = 30) -> Dict[str, Any]:
        """REQUIRED
        Execute Python code with access to registered tools and capture console output.
        
        The code can call tools directly as async functions and has access to
        standard Python globals.
        
        Args:
            code: Python code to execute
            timeout: Optional timeout in seconds (default: 30)
            
        Returns:
            Dict containing both the execution result and captured console logs
        """
        # Security logging
        code_hash = hash(code) & 0x7fffffff  # Positive hash for logging
        logger.info(f"Code execution requested (hash: {code_hash}, timeout: {timeout}s)")
        
        tools = await self.get_tools()
        tool_names = [tool.name for tool in tools]
        logger.info(f"Available tools for execution: {tool_names}")
        
        # Create logs list for output capture
        logs: List[str] = []
        
        try:
            # Execute with timeout using RestrictedPython
            result = await self._run_with_restricted_python(code, tools, logs, timeout)
            return {"result": result, "logs": logs}
        except Exception as error:
            error_msg = f"Code execution failed: {error}"
            logs.append(f"[ERROR] {error_msg}")
            logger.warning(f"Code execution failed: {error}")
            return {"result": None, "logs": logs}

    async def _run_with_restricted_python(self, code: str, tools: List[Tool], logs: List[str], timeout: int) -> Any:
        """Run code with timeout support using RestrictedPython for secure execution.
        
        Args:
            code: Python code to execute
            tools: Available tools for the execution context
            logs: List to capture print output
            timeout: Timeout in seconds
            
        Returns:
            Execution result
        """
        # Wrap user code in a function so return statements work
        # Indent the user code to be inside the function
        indented_code = '\n'.join('    ' + line if line.strip() else '' for line in code.split('\n'))
        wrapped_code = f"""def user_code_function():
{indented_code}
"""
        
        # Compile code with RestrictedPython for security
        compile_result = compile_restricted(wrapped_code, '<string>', 'exec')
        
        # Check for compilation errors
        if hasattr(compile_result, 'errors') and compile_result.errors:
            error_msg = f"RestrictedPython compilation errors: {compile_result.errors}"
            logger.warning(error_msg)
            raise RuntimeError(error_msg)
        
        # Get the compiled code object
        if hasattr(compile_result, 'code'):
            compiled_code = compile_result.code
        else:
            # Fallback: compile_result might be the code object itself
            compiled_code = compile_result
        
        # Create execution context with tools and security restrictions
        context = await self._create_execution_context(tools, logs)
        
        # Execute with timeout
        try:
            result = await asyncio.wait_for(
                self._execute_restricted_code(compiled_code, context, logs),
                timeout=timeout
            )
            logger.info("Code execution completed successfully")
            return result
        except asyncio.TimeoutError:
            error_msg = f"Code execution timed out after {timeout} seconds"
            logger.warning(error_msg)
            raise TimeoutError(error_msg)
        except Exception as e:
            logger.warning(f"Code execution failed: {e}")
            raise RuntimeError(f"Code execution failed: {e}")
    
    async def _execute_restricted_code(self, compiled_code, context: Dict[str, Any], logs: Optional[List[str]] = None) -> Any:
        """Execute the compiled restricted code in the given context.
        
        The code is wrapped in a function, so return statements work naturally.
        
        Args:
            compiled_code: Compiled RestrictedPython code object
            context: Execution context dictionary
            logs: Optional list to capture print output
            
        Returns:
            Execution result from the function's return statement or None
        """
        # Execute the compiled code (defines the user_code_function)
        exec(compiled_code, context)
        
        # Call the user function in a thread executor so we can interrupt it with timeout
        # This is necessary because synchronous code can't be interrupted by asyncio.wait_for()
        user_function = context.get('user_code_function')
        if user_function and callable(user_function):
            import concurrent.futures
            loop = asyncio.get_event_loop()
            
            # Run the user function in a thread pool executor
            # This allows us to interrupt long-running synchronous code
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = loop.run_in_executor(executor, user_function)
                result = await future
        elif 'result' in context:
            # Fallback: check if user set 'result' variable (for backwards compatibility)
            result = context['result']
        else:
            result = None
        
        # Extract print output from the shared PrintCollector
        if logs is not None:
            print_collector = context.get('__shared_print_collector__')
            if print_collector:
                # Call the PrintCollector to get accumulated output
                output = print_collector()
                if output:
                    logs.append(output.strip())
        
        return result

    def _create_restricted_import(self):
        """Create a restricted import function that only allows safe modules.
        
        Note: 'time' module is included for timing functionality, though time.sleep()
        can bypass async timeouts since it's a blocking call.
        """
        SAFE_MODULES = {
            'json', 'math', 'asyncio', 'datetime', 'time', 're', 'typing',
            'collections', 'itertools', 'functools', 'operator', 'uuid'
        }
        
        def restricted_import(name, *args, **kwargs):
            if name in SAFE_MODULES:
                return __import__(name, *args, **kwargs)
            raise ImportError(f"Import of '{name}' is not allowed in code execution context")
        
        return restricted_import

    async def _create_execution_context(self, tools: List[Tool], logs: Optional[List[str]] = None) -> Dict[str, Any]:
        """Create a secure execution context for running Python code.
        
        This context includes tool functions and safe Python globals with
        RestrictedPython security restrictions.
        
        Args:
            tools: Array of tools to make available
            logs: Optional array to capture print output
            
        Returns:
            Secure execution context dictionary
        """
        # Start with RestrictedPython's safe globals
        context: Dict[str, Any] = safe_globals.copy()
        
        # Create restricted import before updating builtins
        restricted_import = self._create_restricted_import()
        
        # Ensure common builtins are available in __builtins__
        # RestrictedPython's safe_globals might be missing some common functions
        if '__builtins__' in context and isinstance(context['__builtins__'], dict):
            context['__builtins__'].update({
                'max': max,
                'min': min,
                'sum': sum,
                'abs': abs,
                'round': round,
                'sorted': sorted,
                'reversed': reversed,
                'enumerate': enumerate,
                'zip': zip,
                'filter': filter,
                'map': map,
                '__import__': restricted_import,  # Add restricted import to builtins
            })
        
        # Add safe modules
        context.update({
            'json': __import__('json'),
            'asyncio': __import__('asyncio'),
            'math': __import__('math'),
            'datetime': __import__('datetime'),
            'time': __import__('time'),
            're': __import__('re'),
            
            # Add Python interface definitions for reference
            '__interfaces': await self.get_all_tools_python_interfaces(),
            '__get_tool_interface': lambda tool_name: (
                self.tool_to_python_interface(tool)
                if (tool := next((t for t in tools if t.name == tool_name), None))
                else None
            ),
            
            # Also add __import__ to context root for compatibility
            '__import__': restricted_import,
        })
        
        # Set up print collector for output capture
        # RestrictedPython transforms print statements to use _print_() factory
        # We create a shared instance that we can access after execution
        shared_print_collector = PrintCollector()
        
        def print_factory(_getattr=None):
            """Factory that returns our shared PrintCollector instance.
            
            Args:
                _getattr: Optional getattr function (RestrictedPython passes this)
            """
            return shared_print_collector
        
        context['_print_'] = print_factory
        context['_print'] = shared_print_collector  # Also set without trailing underscore
        context['_getattr_'] = getattr
        
        # Store reference to access logs after execution
        context['__shared_print_collector__'] = shared_print_collector

        # Add tool functions to context organized by manual name (fix closure bug)
        def make_tool_function(tool_name_ref: str):
            """Create a tool function with proper closure to avoid late binding issues.
            
            The function is synchronous but internally blocks on async tool calls,
            making it easier for LLM-generated code to use without async/await.
            """
            def tool_function(args: Dict[str, Any] = None, **kwargs):
                if args is None:
                    args = kwargs
                try:
                    # Security logging for tool calls
                    logger.info(f"Tool call: {tool_name_ref} with args: {list(args.keys()) if args else 'none'}")
                    
                    # Block on the async call - this makes the tool function synchronous
                    # We need to get the current event loop or create one
                    try:
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            # If we're already in an async context, we need to use run_coroutine_threadsafe
                            # or create a new event loop in a thread. For simplicity, we'll use asyncio.run
                            # which creates a new event loop
                            import concurrent.futures
                            with concurrent.futures.ThreadPoolExecutor() as executor:
                                future = executor.submit(asyncio.run, self.call_tool(tool_name_ref, args))
                                result = future.result()
                        else:
                            result = loop.run_until_complete(self.call_tool(tool_name_ref, args))
                    except RuntimeError:
                        # No event loop, create one
                        result = asyncio.run(self.call_tool(tool_name_ref, args))
                    
                    logger.info(f"Tool call {tool_name_ref} completed successfully")
                    return result
                except Exception as error:
                    logger.warning(f"Tool call {tool_name_ref} failed: {error}")
                    raise RuntimeError(f"Error calling tool '{tool_name_ref}': {error}")
            return tool_function
        
        for tool in tools:
            if '.' in tool.name:
                manual_name, *tool_parts = tool.name.split('.')
                sanitized_manual_name = self._sanitize_identifier(manual_name)
                tool_name = '_'.join(self._sanitize_identifier(part) for part in tool_parts)
                
                # Create manual namespace object if it doesn't exist
                if sanitized_manual_name not in context:
                    context[sanitized_manual_name] = type('Manual', (), {})()
                
                # Add the tool function to the manual namespace
                setattr(
                    context[sanitized_manual_name],
                    tool_name,
                    make_tool_function(tool.name)
                )
            else:
                # If no dot, add directly to root context (no manual name)
                sanitized_tool_name = self._sanitize_identifier(tool.name)
                context[sanitized_tool_name] = make_tool_function(tool.name)

        return context

    def _json_schema_to_typed_dict_content(self, schema: JsonSchema) -> str:
        """Convert a JSON Schema to Python TypedDict content (properties only).
        
        This generates the content inside a TypedDict class definition.
        
        Args:
            schema: JSON Schema to convert
            
        Returns:
            Python TypedDict properties as string
        """
        if not schema or not hasattr(schema, 'type') or schema.type != 'object':
            return '    pass  # Any type allowed'

        properties = getattr(schema, 'properties', {}) or {}
        required = getattr(schema, 'required', []) or []
        lines: List[str] = []

        if not properties:
            return '    pass  # No specific properties defined'

        for prop_name, prop_schema in properties.items():
            is_required = prop_name in required
            description = getattr(prop_schema, 'description', '') if prop_schema else ''
            py_type = self._json_schema_to_python_type_string(prop_schema)

            if description:
                lines.append(f'    # {description}')
            
            if is_required:
                lines.append(f'    {prop_name}: {py_type}')
            else:
                lines.append(f'    {prop_name}: Optional[{py_type}]')

        return '\n'.join(lines) if lines else '    pass  # No properties'

    def _json_schema_to_python_type(self, schema: JsonSchema, type_name: str) -> str:
        """Convert a JSON Schema to Python TypedDict class definition.
        
        This handles the most common JSON Schema patterns used in UTCP tools.
        
        Args:
            schema: JSON Schema to convert
            type_name: Name for the generated Python class
            
        Returns:
            Python class definition as string
        """
        if not schema:
            return f"class {type_name}(TypedDict):\n    pass  # Any type"

        # Handle different schema types
        schema_type = getattr(schema, 'type', None)
        if schema_type == 'object':
            return self._object_schema_to_python_class(schema, type_name)
        elif schema_type == 'array':
            return self._array_schema_to_python_type(schema, type_name)
        elif schema_type in ['string', 'number', 'integer', 'boolean', 'null']:
            return self._primitive_schema_to_python_type(schema, type_name)
        else:
            # Handle union types or fallback to Any
            if hasattr(schema, 'type') and isinstance(schema.type, list):
                types = [self._map_json_type_to_python(t) for t in schema.type]
                union_type = ' | '.join(types)
                return f"{type_name} = {union_type}"
            return f"{type_name} = Any"

    def _object_schema_to_python_class(self, schema: JsonSchema, type_name: str) -> str:
        """Convert an object JSON Schema to Python TypedDict class."""
        properties = getattr(schema, 'properties', {})
        if not properties:
            return f"""class {type_name}(TypedDict):
    pass  # No specific properties defined"""

        required = getattr(schema, 'required', []) or []
        prop_lines = []
        
        for key, prop_schema in properties.items():
            is_required = key in required
            prop_type = self._json_schema_to_python_type_string(prop_schema)
            description = getattr(prop_schema, 'description', '') if prop_schema else ''
            
            if description:
                prop_lines.append(f'    # {description}')
            
            if is_required:
                prop_lines.append(f'    {key}: {prop_type}')
            else:
                prop_lines.append(f'    {key}: Optional[{prop_type}]')

        properties_content = '\n'.join(prop_lines)
        return f"""class {type_name}(TypedDict):
{properties_content}"""

    def _array_schema_to_python_type(self, schema: JsonSchema, type_name: str) -> str:
        """Convert an array JSON Schema to Python type alias."""
        items = getattr(schema, 'items', None)
        if not items:
            return f"{type_name} = List[Any]"

        if isinstance(items, list):
            item_types = [self._json_schema_to_python_type_string(item) for item in items]
            union_type = ' | '.join(item_types)
            return f"{type_name} = List[{union_type}]"
        else:
            item_type = self._json_schema_to_python_type_string(items)
            return f"{type_name} = List[{item_type}]"

    def _primitive_schema_to_python_type(self, schema: JsonSchema, type_name: str) -> str:
        """Convert a primitive JSON Schema to Python type with enum support."""
        enum_values = getattr(schema, 'enum', None)
        if enum_values:
            enum_literals = []
            for val in enum_values:
                if isinstance(val, str):
                    enum_literals.append(f'"{val}"')
                else:
                    enum_literals.append(str(val))
            return f"{type_name} = Literal[{', '.join(enum_literals)}]"

        schema_type = getattr(schema, 'type', 'any')
        base_type = self._map_json_type_to_python(schema_type)
        return f"{type_name} = {base_type}"

    def _json_schema_to_python_type_string(self, schema: JsonSchema) -> str:
        """Convert a JSON Schema to a Python type string (not a full type definition)."""
        if not schema:
            return 'Any'

        enum_values = getattr(schema, 'enum', None)
        if enum_values:
            enum_literals = []
            for val in enum_values:
                if isinstance(val, str):
                    enum_literals.append(f'"{val}"')
                else:
                    enum_literals.append(str(val))
            return f"Literal[{', '.join(enum_literals)}]"

        schema_type = getattr(schema, 'type', None)
        if schema_type == 'object':
            properties = getattr(schema, 'properties', {})
            if not properties:
                return 'Dict[str, Any]'
            
            required = getattr(schema, 'required', []) or []
            prop_types = []
            for key, prop_schema in properties.items():
                is_required = key in required
                prop_type = self._json_schema_to_python_type_string(prop_schema)
                if is_required:
                    prop_types.append(f'"{key}": {prop_type}')
                else:
                    prop_types.append(f'"{key}": Optional[{prop_type}]')
            return f"TypedDict('{{{', '.join(prop_types)}}}')"
        
        elif schema_type == 'array':
            items = getattr(schema, 'items', None)
            if not items:
                return 'List[Any]'
            if isinstance(items, list):
                item_types = [self._json_schema_to_python_type_string(item) for item in items]
                return f"List[{' | '.join(item_types)}]"
            else:
                item_type = self._json_schema_to_python_type_string(items)
                return f"List[{item_type}]"
        
        elif schema_type in ['string', 'number', 'integer', 'boolean', 'null']:
            return self._map_json_type_to_python(schema_type)
        
        elif isinstance(schema_type, list):
            types = [self._map_json_type_to_python(t) for t in schema_type]
            return ' | '.join(types)
        
        return 'Any'

    def _map_json_type_to_python(self, json_type: str) -> str:
        """Map basic JSON Schema types to Python types."""
        mapping = {
            'string': 'str',
            'number': 'float',
            'integer': 'int',
            'boolean': 'bool',
            'null': 'None',
            'object': 'Dict[str, Any]',
            'array': 'List[Any]'
        }
        return mapping.get(json_type, 'Any')

    # Delegate all abstract methods to the base client
    async def register_manual(self, manual_call_template):
        return await self._base_client.register_manual(manual_call_template)

    async def register_manuals(self, manual_call_templates):
        return await self._base_client.register_manuals(manual_call_templates)
        
    async def deregister_manual(self, manual_call_template_name: str):
        return await self._base_client.deregister_manual(manual_call_template_name)
    
    async def call_tool(self, tool_name: str, tool_args: Dict[str, Any]):
        return await self._base_client.call_tool(tool_name, tool_args)

    async def call_tool_streaming(self, tool_name: str, tool_args: Dict[str, Any]):
        async for item in self._base_client.call_tool_streaming(tool_name, tool_args):
            yield item

    async def search_tools(self, query: str, limit: int = 10, any_of_tags_required: Optional[List[str]] = None):
        return await self._base_client.search_tools(query, limit, any_of_tags_required)

    async def get_required_variables_for_manual_and_tools(self, manual_call_template):
        return await self._base_client.get_required_variables_for_manual_and_tools(manual_call_template)

    async def get_required_variables_for_registered_tool(self, tool_name: str):
        return await self._base_client.get_required_variables_for_registered_tool(tool_name)
        
    async def get_tools(self) -> List[Tool]:
        """Get all registered tools from the base client."""
        return await self._base_client.config.tool_repository.get_tools()
