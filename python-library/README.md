<div align="center">

<h1 align="center">🐍 Python Code-Mode Library: Tool calling via code execution</h1>
<p align="center">
    <a href="https://github.com/universal-tool-calling-protocol">
        <img src="https://img.shields.io/github/followers/universal-tool-calling-protocol?label=Follow%20Org&logo=github" /></a>
    <a href="https://pypi.org/project/code-mode/" title="PyPI Version">
        <img src="https://img.shields.io/pypi/v/code-mode"/></a>
    <a href="https://github.com/universal-tool-calling-protocol/code-mode/blob/main/LICENSE" alt="License">
        <img src="https://img.shields.io/github/license/universal-tool-calling-protocol/code-mode" /></a>
</p>
</div>

> Transform your AI agents from clunky tool callers into efficient code executors — in Python.

## Why This Changes Everything

LLMs excel at writing code but struggle with tool calls. Instead of exposing hundreds of tools directly, give them ONE tool that executes Python code with access to your entire toolkit.

[Apple](https://machinelearning.apple.com/research/codeact), [Cloudflare](https://blog.cloudflare.com/code-mode/), and [Anthropic](https://www.anthropic.com/engineering/code-execution-with-mcp) say that Code-Mode is a more efficient way to approach tool calling compared to the traditional dump function information and then extract a JSON for function calling.

## Benchmarks

Independent [Python benchmark study](https://github.com/imran31415/codemode_python_benchmark) validates the performance claims with **$9,536/year cost savings** at 1,000 scenarios/day:

| Scenario Complexity | Traditional | Code Mode | **Improvement** |
|---------------------|-------------|-----------|----------------|
| **Simple (2-3 tools)** | 3 iterations | 1 execution | **67% faster** |
| **Medium (4-7 tools)** | 8 iterations | 1 execution | **75% faster** |
| **Complex (8+ tools)** | 16 iterations | 1 execution | **88% faster** |

### **Why Code Mode Dominates:**

   **Batching Advantage** - Single code block replaces multiple API calls  
   **Cognitive Efficiency** - LLMs excel at code generation vs. tool orchestration  
   **Computational Efficiency** - No context re-processing between operations

# Getting Started

## Get Started in 3 Lines

```python
from utcp_code_mode import CodeModeUtcpClient
from utcp.data.call_template import CallTemplateSerializer

client = await CodeModeUtcpClient.create()                              # 1. Initialize

# Serialize the call template dict to CallTemplate object
call_template = CallTemplateSerializer().validate_dict({
    'name': 'github',
    'call_template_type': 'mcp',
    'config': {...}
})
await client.register_manual(call_template)                             # 2. Add tools  
result = await client.call_tool_chain("# Python code here")             # 3. Execute code
```

That's it. Your AI agent can now execute complex workflows in a single request instead of dozens.

## What You Get

### **Progressive Tool Discovery**
```python
# Agent discovers tools dynamically, loads only what it needs
tools = await client.search_tools('github pull request')
# Instead of 500 tool definitions → 3 relevant tools
```

### **Natural Code Execution**  
```python
result = await client.call_tool_chain('''
# Chain multiple operations in one request
pr = await github.get_pull_request(owner='microsoft', repo='vscode', pull_number=1234)
comments = await github.get_pull_request_comments(owner='microsoft', repo='vscode', pull_number=1234)
reviews = await github.get_pull_request_reviews(owner='microsoft', repo='vscode', pull_number=1234)

# Process data efficiently in-sandbox
return {
    "title": pr["title"],
    "commentCount": len(comments),
    "approvals": len([r for r in reviews if r["state"] == "APPROVED"])
}
''')
# Single API call replaces 15+ traditional tool calls
```

### **Auto-Generated Python TypedDict Interfaces**
```python
class GithubGetPullRequestInput(TypedDict):
    """Repository owner"""
    owner: str
    """Repository name"""
    repo: str
    """Pull request number"""
    pull_number: int
```

## Enterprise-Ready

- **Secure Process Sandboxing** – Subprocess isolation prevents unauthorized access
- **Timeout Protection** – Configurable execution limits prevent runaway code  
- **Complete Observability** – Full console output capture and error handling
- **Zero External Dependencies** – Tools only accessible through registered UTCP/MCP servers
- **Runtime Introspection** – Dynamic interface discovery for adaptive workflows

## Universal Protocol Support

Works with **any tool ecosystem:**

| Protocol | Description | Usage | Plugin Required |
|----------|-------------|-------|----------------|
| **MCP** | Model Context Protocol servers | `call_template_type: 'mcp'` | `pip install utcp-mcp` |
| **HTTP** | REST APIs with auto-discovery | `call_template_type: 'http'` | Built-in |  
| **Text** | Local JSON/YAML/UTCP files | `call_template_type: 'text'` | Built-in |
| **CLI** | Command-line tool execution | `call_template_type: 'cli'` | `pip install utcp-cli` |

> **Note:** Each protocol requires its corresponding plugin to be installed. Installing a plugin automatically registers it with the UTCP client.

## Installation

```bash
pip install code-mode
```

## Direct Python Usage

### 1. **MCP Server Integration**
Connect to any Model Context Protocol server:

> **Prerequisites:** `pip install utcp-mcp` (installing the plugin auto-registers it)

```python
from utcp_code_mode import CodeModeUtcpClient
from utcp.data.call_template import CallTemplateSerializer
import os

client = await CodeModeUtcpClient.create()

# Connect to GitHub MCP server
# Serialize the dict to CallTemplate object
call_template = CallTemplateSerializer().validate_dict({
    'name': 'github',
    'call_template_type': 'mcp',
    'config': {
        'mcpServers': {
            'github': {
                'command': 'docker',
                'args': ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'mcp/github'],
                'env': {'GITHUB_PERSONAL_ACCESS_TOKEN': os.environ.get('GITHUB_TOKEN')}
            }
        }
    }
})
await client.register_manual(call_template)
```

### 2. **Execute Multi-Step Workflows**
Replace 15+ tool calls with a single code execution:

```python
result = await client.call_tool_chain('''
# Traditional: 4 separate API round trips → Code Mode: 1 execution
pr = await github.get_pull_request(owner='microsoft', repo='vscode', pull_number=1234)
comments = await github.get_pull_request_comments(owner='microsoft', repo='vscode', pull_number=1234)
reviews = await github.get_pull_request_reviews(owner='microsoft', repo='vscode', pull_number=1234)
files = await github.get_pull_request_files(owner='microsoft', repo='vscode', pull_number=1234)

# Process data in-sandbox (no token overhead)
summary = {
    "title": pr["title"],
    "state": pr["state"],
    "author": pr["user"]["login"],
    "stats": {
        "comments": len(comments),
        "reviews": len(reviews),
        "filesChanged": len(files),
        "approvals": len([r for r in reviews if r["state"] == "APPROVED"])
    },
    "topDiscussion": [
        {
            "author": c["user"]["login"],
            "preview": c["body"][:100] + "..."
        } for c in comments[:3]
    ]
}

print(f'PR "{pr["title"]}" analysis complete')
return summary
''')

print('Analysis Result:', result['result'])
# console output: 'PR "Fix memory leak in hooks" analysis complete'
```

---

## Advanced Features

### **Multi-Protocol Tool Chains**
Mix and match different tool ecosystems in a single execution:

```python
from utcp.data.call_template import CallTemplateSerializer

serializer = CallTemplateSerializer()

# Register multiple tool sources
await client.register_manual(serializer.validate_dict({
    'name': 'github',
    'call_template_type': 'mcp',
    'config': {...}
}))
await client.register_manual(serializer.validate_dict({
    'name': 'slack',
    'call_template_type': 'http',
    'http_method': 'POST',
    'url': 'https://api.slack.com/utcp'
}))
await client.register_manual(serializer.validate_dict({
    'name': 'db',
    'call_template_type': 'text',
    'file_path': './db-tools.json'
}))

result = await client.call_tool_chain('''
# Fetch PR data from GitHub (MCP)
pr = await github.get_pull_request(owner='company', repo='api', pull_number=42)

# Query deployment status from database (File)
deployment = await db.get_deployment_status(pr_id=pr["id"])

# Send notification to Slack (HTTP)
await slack.post_message(
    channel='#releases',
    text=f'PR #42 "{pr["title"]}" deployed to {deployment["environment"]}'
)

return {"pr": pr["title"], "environment": deployment["environment"]}
''')
```

### **Runtime Interface Introspection**
Tools can dynamically discover and adapt to available interfaces:

```python
result = await client.call_tool_chain('''
# Discover available tools at runtime
print('Available interfaces:', __interfaces)

# Get specific tool interface for validation
pr_interface = __get_tool_interface('github.get_pull_request')
print('PR tool expects:', pr_interface)

# Use interface info for dynamic workflows
has_slack_tools = 'namespace slack' in __interfaces
if has_slack_tools:
    await slack.post_message(channel='#dev', text='Analysis complete')

return {"toolsAvailable": has_slack_tools}
''')
```

### **Context-Efficient Data Processing**
Process large datasets without bloating the model's context:

```python
result = await client.call_tool_chain('''
# Fetch large dataset
all_issues = await github.list_repository_issues(owner='facebook', repo='react')
print(f'Fetched {len(all_issues)} total issues')

# Process efficiently in-sandbox
critical_bugs = [
    {
        "number": issue["number"],
        "title": issue["title"],
        "author": issue["user"]["login"],
        "daysOld": (datetime.now() - datetime.fromisoformat(issue["created_at"].replace('Z', '+00:00'))).days
    }
    for issue in all_issues
    if any(l["name"] == "bug" for l in issue["labels"])
    and any(l["name"] == "high priority" for l in issue["labels"])
]

critical_bugs.sort(key=lambda x: x["daysOld"], reverse=True)

# Only return processed summary (not 10,000 raw issues)
return {
    "totalIssues": len(all_issues),
    "criticalBugs": critical_bugs[:10],  # Top 10 oldest critical bugs
    "summary": f'Found {len(critical_bugs)} critical bugs, oldest is {critical_bugs[0]["daysOld"]} days old'
}
''')
```

### **Error Handling & Observability**
Built-in error handling with complete execution transparency:

```python
result = await client.call_tool_chain('''
try:
    print('Starting multi-step workflow...')
    
    data = await external_api.fetch_data(id='user-123')
    print('Data fetched successfully')
    
    processed = await data_processor.transform(data)
    print(f'Processing completed with {len(processed.get("warnings", []))} warnings')
    
    return processed
except Exception as error:
    print(f'Workflow failed: {str(error)}')
    raise error  # Propagates to outer error handling
''', timeout=30)  # 30-second timeout

# Complete observability
print('Result:', result['result'])
print('Execution logs:', result['logs'])
# ['Starting multi-step workflow...', 'Data fetched successfully', 'Processing completed with 2 warnings']
```

### **Custom Timeouts**
Configure execution limits for different workload types:

```python
# Quick operations (5 seconds)
quick_result = await client.call_tool_chain('return await ping.check()', timeout=5)

# Heavy data processing (2 minutes)
heavy_result = await client.call_tool_chain('''
big_data = await database.export_full_dataset()
return await analytics.process_dataset(big_data)
''', timeout=120)
```

---

## AI Agent Integration

Plug-and-play with any AI framework. The built-in prompt template handles all the complexity:

```python
from utcp_code_mode import CodeModeUtcpClient
from openai import OpenAI

system_prompt = f"""
You are an AI assistant with access to tools via UTCP CodeMode.
{CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE}
Additional instructions...
"""

# Works with any AI library
client = OpenAI()
response = client.chat.completions.create(
    model='gpt-4',
    messages=[
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': 'Analyze the latest PR in microsoft/vscode'}
    ]
)
```

**The template provides comprehensive guidance on:**
- Tool discovery workflow (`search_tools` → `__interfaces` → `call_tool_chain`)
- Hierarchical access patterns (`manual.tool()` syntax)  
- Interface introspection (`__get_tool_interface()`)
- Error handling and best practices

---

## API Reference

### **Core Methods**

#### `call_tool_chain(code: str, timeout: int = 30) -> Dict[str, Any]`
Execute Python code with full tool access and observability.
- **Returns**: `{"result": any, "logs": List[str]}` with execution result and captured console output
- **Default timeout**: 30 seconds

#### `get_all_tools_python_interfaces() -> str`
Generate complete Python TypedDict interfaces for IDE integration.
- **Returns**: String containing all interface definitions with proper typing

#### `search_tools(query: str, limit: int = 10)` *(from UtcpClient)*
Discover tools using natural language queries.
- **Returns**: List of relevant tools with descriptions and interfaces

### **Static Methods**

#### `CodeModeUtcpClient.create(root_dir=None, config=None) -> CodeModeUtcpClient`
Create a new client instance with optional configuration.

#### `CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE`
Production-ready prompt template for AI agents.

---

## Security & Performance

### **Secure by Design**
- **Process sandboxing** – Isolated execution in separate processes with real termination
- **No filesystem access** – Tools only through registered servers  
- **Timeout protection** – Configurable execution limits with forcible termination
- **Zero network access** – No external dependencies or API keys exposed
- **Restricted imports** – Only safe modules allowed (json, math, asyncio, datetime, time, re, typing, collections, itertools, functools, operator, uuid)
- **Safe builtins** – Dangerous functions like `exec`, `eval`, `open` are blocked
- **No system access** – Modules like `os`, `sys`, `subprocess` not available

### **Performance Optimized**
- **Minimal memory footprint** – Process isolation is efficient with copy-on-write
- **Efficient tool caching** – TypedDict interfaces cached automatically
- **Streaming console output** – Real-time log capture without buffering
- **Identifier sanitization** – Handles invalid Python identifiers gracefully

### **Cooperative Sandbox Model**
This security model is designed for **cooperative LLM-generated code** (not adversarial scenarios). It's perfect for:
- **AI agents** with tool-based workflows
- **Development environments** with controlled tool access
- **Educational settings** for safe code experimentation
- **Internal automation** with defined interfaces

**Not suitable for**: Production multi-tenant environments or untrusted user code.

---

## Development Experience

### **IDE Integration**
Generate Python definitions for full IntelliSense support:

```python
# Generate tool interfaces  
interfaces = await client.get_all_tools_python_interfaces()
with open('generated_tools.py', 'w') as f:
    f.write(interfaces)

# Import in your code for type hints
from generated_tools import *
```

### **Debug & Monitor**
Built-in observability for production deployments:

```python
result = await client.call_tool_chain(user_code)

# Ship logs to your monitoring system
for log in result['logs']:
    if '[ERROR]' in log:
        monitoring.error(log)
    if '[WARN]' in log:
        monitoring.warn(log)
```

---

### **Benchmark Methodology**
The [comprehensive Python study](https://github.com/imran31415/codemode_python_benchmark) tested **16 realistic scenarios** across:
- **Financial workflows** (invoicing, expense tracking)  
- **DevOps operations** (deployments, monitoring)
- **Data processing** (analysis, reporting)
- **Business automation** (CRM, notifications)

**Models tested:** Claude Haiku, Gemini Flash  
**Pricing basis:** $0.25/1M input, $1.25/1M output tokens  
**Scale:** 1,000 scenarios/day = $9,536/year savings with Code Mode

## Learn More

- **[Cloudflare Research](https://blog.cloudflare.com/code-mode/)** – Original code mode whitepaper
- **[Anthropic Study](https://www.anthropic.com/engineering/code-execution-with-mcp)** – MCP code execution benefits
- **[Python Benchmark Study](https://github.com/imran31415/codemode_python_benchmark)** – Comprehensive performance analysis
- **[UTCP Specification](https://utcp.io)** – Universal Tool Calling Protocol  
- **[Report Issues](https://github.com/universal-tool-calling-protocol/code-mode/issues)** – Bug reports and feature requests

## License

**MPL-2.0** – Open source with commercial-friendly terms.
