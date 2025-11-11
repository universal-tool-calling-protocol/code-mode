# Code Mode

[![npm](https://img.shields.io/npm/v/@utcp/code-mode)](https://www.npmjs.com/package/@utcp/code-mode)

**A plug-and-play library that lets agents call MCP and UTCP tools through TypeScript code - in just 3 lines.**

LLMs are far better at writing code than managing complex tool calls. Instead of exposing hundreds of tools directly to the model, Code Mode UTCP allows for targeted searching of tools, and then calls the entire tool chain via code execution. The model writes JavaScript that calls your MCP or UTCP tools, enabling scalable, context-efficient orchestration. 

## 🚀 Features

- **TypeScript Code Execution** – Run JavaScript with full access to registered MCP/UTCP tools
- **Hierarchical Tool Access** – Tools organized by namespace (e.g. `math_tools.add()`)
- **Auto-Generated Type Definitions** – Type-safe interfaces for tool inputs and outputs
- **Runtime Interface Access** – Introspect TypeScript interfaces at runtime
- **Secure Execution** – Node.js VM sandbox with timeout and resource limits
- **Composable Calls – Chain** multiple tool calls within a single JavaScript code block

## 🧠 Why Code Mode

### The problem

Direct tool calling doesn't scale:

- Each tool definition consumes context tokens
- Every intermediate result passes through the model

### The approach

Code Mode flips this model:

1. The LLM gets the ability to search tools in natural language using **`searchTools`**. Each tool is shown as a TypeScript interface.
2. The LLM gets a single tool: **`callToolChain`**
3. It writes JS that calls your MCP or UTCP tools as JS functions 
3. Only end results get returned to the agent

This leverages what LLMs excel at - **writing code** - while keeping tool orchestration efficient and stateless.

## 📦 Benefits

### 🧭 Progressive Disclosure

Agents can search for tools dynamically to keep context lean.`searchTools`

### 💾 Context Efficiency

Large datasets can be filtered, joined, or aggregated *in code* before returning results, saving thousands of tokens.

### 🔁 Smarter Control Flow

Loops, conditionals, and error handling happen naturally in code - not through multiple tool calls.

### 🔒 Privacy & Security

Intermediate results stay within the sandbox; sensitive data can be tokenized automatically before reaching the model.

## Installation

```bash
npm install @utcp/code-mode
```

## Basic Usage

```typescript
import { CodeModeUtcpClient } from '@utcp/code-mode';

const client = await CodeModeUtcpClient.create();

// Register some tools first (example)
await client.registerManual({
  name: 'github',
  call_template_type: 'mcp',
  config: {
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "mcp/github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "<YOUR_TOKEN>"
      }
    }
  }
}
});

// Now execute TypeScript code that uses the tools
const { result, logs } = await client.callToolChain(`
  // Get pull request details
  const prDetails = await github.get_pull_request({ 
    owner: 'microsoft', 
    repo: 'vscode', 
    pull_number: 1234 
  });
  console.log('PR Title:', prDetails.title);
  console.log('PR State:', prDetails.state);
  
  // Get pull request comments
  const prComments = await github.get_pull_request_comments({ 
    owner: 'microsoft', 
    repo: 'vscode', 
    pull_number: 1234 
  });
  console.log('Found', prComments.length, 'review comments');
  
  // Get pull request reviews
  const prReviews = await github.get_pull_request_reviews({ 
    owner: 'microsoft', 
    repo: 'vscode', 
    pull_number: 1234 
  });
  console.log('Found', prReviews.length, 'reviews');
  
  // Get files changed in the PR
  const prFiles = await github.get_pull_request_files({ 
    owner: 'microsoft', 
    repo: 'vscode', 
    pull_number: 1234 
  });
  console.log('Files changed:', prFiles.length);
  
  // Summarize the discussion
  const discussionSummary = {
    title: prDetails.title,
    description: prDetails.body || 'No description provided',
    state: prDetails.state,
    author: prDetails.user.login,
    filesChanged: prFiles.length,
    totalComments: prComments.length,
    totalReviews: prReviews.length,
    reviewSummary: prReviews.map(review => ({
      reviewer: review.user.login,
      state: review.state,
      commentCount: review.body ? 1 : 0
    })),
    keyDiscussionPoints: prComments.slice(0, 3).map(comment => ({
      author: comment.user.login,
      snippet: comment.body.substring(0, 100) + '...'
    }))
  };
  
  console.log('Discussion Summary Generated');
  return discussionSummary;
`);

console.log('PR Discussion Summary:', result);
console.log('Console output:', logs);
```

## Advanced Usage

### Console Output Capture

All console output is automatically captured and returned alongside execution results:

```typescript
const { result, logs } = await client.callToolChain(`
  console.log('Starting PR analysis...');
  console.warn('Analyzing large PR with many changes');
  
  const prDetails = await github.get_pull_request({ 
    owner: 'facebook', 
    repo: 'react', 
    pull_number: 5678 
  });
  console.log('PR Title:', prDetails.title);
  
  const prStatus = await github.get_pull_request_status({ 
    owner: 'facebook', 
    repo: 'react', 
    pull_number: 5678 
  });
  console.log('Status checks passed:', prStatus.state === 'success');
  
  return { title: prDetails.title, checksPass: prStatus.state === 'success' };
`);

console.log('Result:', result); // { title: "Fix memory leak in hooks", checksPass: true }
console.log('Captured logs:');
logs.forEach((log, i) => console.log(`${i + 1}: ${log}`));
// Output:
// 1: Starting PR analysis...
// 2: [WARN] Analyzing large PR with many changes
// 3: PR Title: Fix memory leak in hooks
// 4: Status checks passed: true
```

### Getting TypeScript Interfaces

You can generate TypeScript interfaces for all your tools to get better IDE support:

```typescript
const interfaces = await client.getAllToolsTypeScriptInterfaces();
console.log(interfaces);
```

This will output something like:

```typescript
// Auto-generated TypeScript interfaces for UTCP tools

namespace math_tools {
  interface addInput {
    /** First number */
    a: number;
    /** Second number */
    b: number;
  }

  interface addOutput {
    /** The sum result */
    result: number;
  }
}

/**
 * Adds two numbers
 * Tags: math, arithmetic
 * Access as: math_tools.add(args)
 */
```

### Complex Tool Chains

Execute complex logic with multiple tools using hierarchical access:

```typescript
const result = await client.callToolChain(`
  // Get user data (assuming 'user_service' manual)
  const user = await user_service.getUserData({ userId: "123" });
  
  // Process the data (assuming 'data_processing' manual)
  const processedData = await data_processing.processUserData({
    userData: user,
    options: { normalize: true, validate: true }
  });
  
  // Generate report (assuming 'reporting' manual)
  const report = await reporting.generateReport({
    data: processedData,
    format: "json",
    includeMetrics: true
  });
  
  // Send notification (assuming 'notifications' manual)
  await notifications.sendNotification({
    recipient: user.email,
    subject: "Your report is ready",
    body: \`Report generated with \${report.metrics.totalItems} items\`
  });
  
  return {
    reportId: report.id,
    itemCount: report.metrics.totalItems,
    notificationSent: true
  };
`);
```

### Error Handling

The code execution includes proper error handling:

```typescript
try {
  const result = await client.callToolChain(`
    const result = await someToolThatMightFail({ input: "test" });
    return result;
  `);
} catch (error) {
  console.error('Code execution failed:', error.message);
}
```

### Timeout Configuration

You can set custom timeouts for code execution:

```typescript
const result = await client.callToolChain(`
  // Long running operation
  const result = await processLargeDataset({ data: largeArray });
  return result;
`, 60000); // 60 second timeout
```

### Runtime Interface Access

The code execution context provides access to TypeScript interfaces at runtime:

```typescript
const result = await client.callToolChain(`
  // Access all interfaces
  console.log('All interfaces:', __interfaces);
  
  // Get interface for a specific tool
  const addInterface = __getToolInterface('math_tools.add');
  console.log('Add tool interface:', addInterface);
  
  // Parse interface information
  const hasNamespaces = __interfaces.includes('namespace math_tools');
  const availableNamespaces = __interfaces.match(/namespace \\w+/g) || [];
  
  // Use this for dynamic validation, documentation, or debugging
  return {
    hasInterfaces: typeof __interfaces === 'string',
    namespaceCount: availableNamespaces.length,
    canIntrospect: typeof __getToolInterface === 'function',
    specificToolInterface: !!addInterface
  };
`);
```

#### Available Context Variables

- **`__interfaces`**: String containing all TypeScript interface definitions
- **`__getToolInterface(toolName: string)`**: Function to get interface for a specific tool

## AI Agent Integration

For AI agents that will use CodeModeUtcpClient, include the built-in prompt template in your system prompt:

```typescript
import { CodeModeUtcpClient } from '@utcp/code-mode';

// Add this to your AI agent's system prompt
const systemPrompt = `
You are an AI assistant with access to tools via UTCP CodeMode.

${CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE}

Additional instructions...
`;
```

This template provides essential guidance on:
- **Tool Discovery Workflow**: How to explore available tools before coding
- **Hierarchical Access Patterns**: Using `manual.tool()` syntax correctly  
- **Interface Introspection**: Leveraging `__interfaces` and `__getToolInterface()`
- **Best Practices**: Error handling, data flow, and proper code structure
- **Runtime Context**: Available variables and functions in the execution environment

## API Reference

### CodeModeUtcpClient

Extends `UtcpClient` with additional code execution capabilities.

#### Methods

##### `callToolChain(code: string, timeout?: number): Promise<{result: any, logs: string[]}>`

Executes TypeScript code with access to all registered tools and captures console output.

- **code**: TypeScript code to execute
- **timeout**: Optional timeout in milliseconds (default: 30000)
- **Returns**: Object containing both the execution result and captured console logs (`console.log`, `console.error`, `console.warn`, `console.info`)

##### `toolToTypeScriptInterface(tool: Tool): string`

Converts a single tool to its TypeScript interface definition.

- **tool**: The Tool object to convert
- **Returns**: TypeScript interface as a string

##### `getAllToolsTypeScriptInterfaces(): Promise<string>`

Generates TypeScript interfaces for all registered tools.

- **Returns**: Complete TypeScript interface definitions

### Static Properties

##### `CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE: string`

A comprehensive prompt template designed for AI agents using CodeModeUtcpClient. Contains detailed guidance on tool discovery, hierarchical access patterns, interface introspection, and best practices for code execution.

### Static Methods

##### `CodeModeUtcpClient.create(root_dir?: string, config?: UtcpClientConfig): Promise<CodeModeUtcpClient>`

Creates a new CodeModeUtcpClient instance.

- **root_dir**: Root directory for relative path resolution
- **config**: UTCP client configuration
- **Returns**: New CodeModeUtcpClient instance

## Security Considerations

- Code execution happens in a secure Node.js VM context
- No access to Node.js modules or filesystem by default
- Timeout protection prevents infinite loops
- Only registered tools are accessible in the execution context

## Type Safety

The code mode client generates hierarchical TypeScript interfaces for all tools, providing:

- **Namespace Organization**: Tools grouped by manual (e.g., `namespace math_tools`)
- **Hierarchical Access**: Clean dot notation (`math_tools.add()`) prevents naming conflicts
- **Compile-time Type Checking**: Full type safety for tool parameters and return values
- **IntelliSense Support**: Enhanced IDE autocompletion with organized namespaces
- **Runtime Introspection**: Access interface definitions during code execution
- **Self-Documenting Code**: Generated interfaces include descriptions and access patterns

## Integration with IDEs

For the best development experience:

1. Generate TypeScript interfaces for your tools
2. Save them to a `.d.ts` file in your project
3. Reference the file in your TypeScript configuration
4. Enjoy full IntelliSense support for tool functions

```typescript
// Generate and save interfaces
const interfaces = await client.getAllToolsTypeScriptInterfaces();
await fs.writeFile('tools.d.ts', interfaces);
```

## Actual up to date implementation in the [typescript repository](https://github.com/universal-tool-calling-protocol/typescript-utcp/tree/main/packages/code-mode)

## License

MPL-2.0
