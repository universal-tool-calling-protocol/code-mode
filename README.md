<div align="center">
<!-- <img alt="utcp code mode banner" src="https://github.com/user-attachments/assets/77723130-ecbc-4d1d-9e9b-20f978882699" width="80%" style="margin: 20px auto;"> -->

<h1 align="center">🤖 Code-Mode Library: First library for tool calls via code execution</h1>
<p align="center">
    <a href="https://github.com/universal-tool-calling-protocol">
        <img src="https://img.shields.io/github/followers/universal-tool-calling-protocol?label=Follow%20Org&logo=github" /></a>
    <a href="https://img.shields.io/npm/dt/@utcp/code-mode" title="PyPI Version">
        <img src="https://img.shields.io/npm/dt/@utcp/code-mode"/></a>
    <a href="https://github.com/universal-tool-calling-protocol/code-mode/blob/main/LICENSE" alt="License">
        <img src="https://img.shields.io/github/license/universal-tool-calling-protocol/code-mode" /></a>
 
  [![npm](https://img.shields.io/npm/v/@utcp/code-mode)](https://www.npmjs.com/package/@utcp/code-mode)
</p>
</div>

> Transform your AI agents from clunky tool callers into efficient code executors — in just 3 lines.

## Why This Changes Everything

LLMs excel at writing code but struggle with tool calls. Instead of exposing hundreds of tools directly, give them ONE tool that executes TypeScript code with access to your entire toolkit.

**Research from [Apple](https://machinelearning.apple.com/research/codeact), [Cloudflare](https://blog.cloudflare.com/code-mode/) and [Anthropic](https://www.anthropic.com/engineering/code-execution-with-mcp) proves:**
- **60% faster execution** than traditional tool calling
- **68% fewer tokens** consumed  
- **88% fewer API round trips**
- **98.7% reduction in context overhead** for complex workflows

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

   ## Why Choose Code Mode UTCP?

| Traditional Tool Calling | **Code Mode UTCP** | **Improvement** |
|--------------------------|-------------------|----------------|
| 15+ API round trips | **1 code execution** | **15x fewer requests** |
| 50,000+ context tokens | **2,000 tokens** | **96% token reduction** |
| 16 iterations (complex) | **1 iteration** | **88% faster** |
| Higher token costs | **68% token reduction** | **$9,536/year savings** |
| Manual error handling | **Automatic capture & logs** | **Zero-config observability** |
| Tool-by-tool discovery | **Dynamic semantic search** | **Progressive disclosure** |
| Vendor/protocol lock-in | **Universal compatibility** | **MCP, HTTP, File, CLI** |


**Real-world results:** Independent benchmarks demonstrate significant cost savings, with **$9,536/year savings** possible at enterprise scale (1,000 scenarios/day).

# Getting Started

[<img width="2606" height="1445" alt="Frame 4 (4)" src="https://github.com/user-attachments/assets/58ba26ab-6e77-459b-a59a-eeb60d711746" />
](https://www.youtube.com/watch?v=zsMjkPzmqhA)

## Get Started in 3 Lines

```typescript
import { CodeModeUtcpClient } from '@utcp/code-mode';

const client = await CodeModeUtcpClient.create();                    // 1. Initialize
await client.registerManual({ name: 'github', /* MCP config */ });  // 2. Add tools  
const { result } = await client.callToolChain(`/* TypeScript */`);   // 3. Execute code
```

That's it. Your AI agent can now execute complex workflows in a single request instead of dozens.

## What You Get

### **Progressive Tool Discovery**
```typescript
// Agent discovers tools dynamically, loads only what it needs
const tools = await client.searchTools('github pull request');
// Instead of 500 tool definitions → 3 relevant tools
```

### **Natural Code Execution**  
```typescript
const { result, logs } = await client.callToolChain(`
  // Chain multiple operations in one request
  const pr = await github.get_pull_request({ owner: 'microsoft', repo: 'vscode', pull_number: 1234 });
  const comments = await github.get_pull_request_comments({ owner: 'microsoft', repo: 'vscode', pull_number: 1234 });
  const reviews = await github.get_pull_request_reviews({ owner: 'microsoft', repo: 'vscode', pull_number: 1234 });
  
  // Process data efficiently in-sandbox
  return {
    title: pr.title,
    commentCount: comments.length,
    approvals: reviews.filter(r => r.state === 'APPROVED').length
  };
`);
// Single API call replaces 15+ traditional tool calls
```

### **Auto-Generated TypeScript Interfaces**
```typescript
namespace github {
  interface get_pull_requestInput {
    /** Repository owner */
    owner: string;
    /** Repository name */ 
    repo: string;
    /** Pull request number */
    pull_number: number;
  }
}
```

## Enterprise-Ready

- **Secure VM Sandboxing** – Node.js isolates prevent unauthorized access
- **Timeout Protection** – Configurable execution limits prevent runaway code  
- **Complete Observability** – Full console output capture and error handling
- **Zero External Dependencies** – Tools only accessible through registered UTCP/MCP servers
- **Runtime Introspection** – Dynamic interface discovery for adaptive workflows

## Universal Protocol Support

Works with **any tool ecosystem:**

| Protocol | Description | Usage |
|----------|-------------|-------|
| **MCP** | Model Context Protocol servers | `call_template_type: 'mcp'` |
| **HTTP** | REST APIs with auto-discovery | `call_template_type: 'http'` |  
| **File** | Local JSON/YAML configurations | `call_template_type: 'file'` |
| **CLI** | Command-line tool execution | `call_template_type: 'cli'` |

## Installation

```bash
npm install @utcp/code-mode
```

## Even Easier: Ready-to-Use MCP Server

**Want Code Mode without any setup?** Use our plug-and-play MCP server with Claude Desktop or any MCP client:

```json
{
  "mcpServers": {
    "code-mode": {
      "command": "npx",
      "args": ["@utcp/code-mode-mcp"],
      "env": {
        "UTCP_CONFIG_FILE": "/path/to/your/.utcp_config.json"
      }
    }
  }
}
```

**That's it!** No installation, no Node.js knowledge required. The [Code Mode MCP Server](https://github.com/universal-tool-calling-protocol/code-mode/tree/main/code-mode-mcp) automatically:
- Downloads and runs the latest version via `npx`
- Loads your tool configurations from JSON
- Provides code execution capabilities to Claude Desktop
- Gives you `call_tool_chain` as an MCP tool for TypeScript execution

**Perfect for non-developers** who want Code Mode power in Claude Desktop!

## Direct TypeScript Usage

### 1. **MCP Server Integration**
Connect to any Model Context Protocol server:

```typescript
import { CodeModeUtcpClient } from '@utcp/code-mode';

const client = await CodeModeUtcpClient.create();

// Connect to GitHub MCP server
await client.registerManual({
  name: 'github',
  call_template_type: 'mcp',
  config: {
    mcpServers: {
      github: {
        command: 'docker',
        args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'mcp/github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN }
      }
    }
  }
});
```

### 2. **Execute Multi-Step Workflows**
Replace 15+ tool calls with a single code execution:

```typescript
const { result, logs } = await client.callToolChain(`
  // Traditional: 4 separate API round trips → Code Mode: 1 execution
  const pr = await github.get_pull_request({ owner: 'microsoft', repo: 'vscode', pull_number: 1234 });
  const comments = await github.get_pull_request_comments({ owner: 'microsoft', repo: 'vscode', pull_number: 1234 });
  const reviews = await github.get_pull_request_reviews({ owner: 'microsoft', repo: 'vscode', pull_number: 1234 });
  const files = await github.get_pull_request_files({ owner: 'microsoft', repo: 'vscode', pull_number: 1234 });
  
  // Process data in-sandbox (no token overhead)
  const summary = {
    title: pr.title,
    state: pr.state,
    author: pr.user.login,
    stats: {
      comments: comments.length,
      reviews: reviews.length, 
      filesChanged: files.length,
      approvals: reviews.filter(r => r.state === 'APPROVED').length
    },
    topDiscussion: comments.slice(0, 3).map(c => ({
      author: c.user.login,
      preview: c.body.substring(0, 100) + '...'
    }))
  };
  
  console.log(\`PR "\${pr.title}" analysis complete\`);
  return summary;
`);

console.log('Analysis Result:', result);
// console output: 'PR "Fix memory leak in hooks" analysis complete'
```

---

## Advanced Features

### **Multi-Protocol Tool Chains**
Mix and match different tool ecosystems in a single execution:

```typescript
// Register multiple tool sources
await client.registerManual({ name: 'github', call_template_type: 'mcp', /* config */ });
await client.registerManual({ name: 'slack', call_template_type: 'http', /* config */ });
await client.registerManual({ name: 'db', call_template_type: 'file', file_path: './db-tools.json' }); // This loads a UTCP manual from a json file

const result = await client.callToolChain(`
  // Fetch PR data from GitHub (MCP)
  const pr = await github.get_pull_request({ owner: 'company', repo: 'api', pull_number: 42 });
  
  // Query deployment status from database (File)
  const deployment = await db.get_deployment_status({ pr_id: pr.id });
  
  // Send notification to Slack (HTTP)
  await slack.post_message({
    channel: '#releases',
    text: \`PR #42 "\${pr.title}" deployed to \${deployment.environment}\`
  });
  
  return { pr: pr.title, environment: deployment.environment };
`);
```

### **Runtime Interface Introspection**
Tools can dynamically discover and adapt to available interfaces:

```typescript
const result = await client.callToolChain(`
  // Discover available tools at runtime
  console.log('Available interfaces:', __interfaces);
  
  // Get specific tool interface for validation
  const prInterface = __getToolInterface('github.get_pull_request');
  console.log('PR tool expects:', prInterface);
  
  // Use interface info for dynamic workflows
  const hasSlackTools = __interfaces.includes('namespace slack');
  if (hasSlackTools) {
    await slack.post_message({ channel: '#dev', text: 'Analysis complete' });
  }
  
  return { toolsAvailable: hasSlackTools };
`);
```

### **Context-Efficient Data Processing**
Process large datasets without bloating the model's context:

```typescript
const result = await client.callToolChain(`
  // Fetch large dataset
  const allIssues = await github.list_repository_issues({ owner: 'facebook', repo: 'react' });
  console.log('Fetched', allIssues.length, 'total issues');
  
  // Process efficiently in-sandbox
  const criticalBugs = allIssues
    .filter(issue => issue.labels.some(l => l.name === 'bug'))
    .filter(issue => issue.labels.some(l => l.name === 'high priority'))
    .map(issue => ({
      number: issue.number,
      title: issue.title,
      author: issue.user.login,
      daysOld: Math.floor((Date.now() - new Date(issue.created_at)) / (1000 * 60 * 60 * 24))
    }))
    .sort((a, b) => b.daysOld - a.daysOld);
  
  // Only return processed summary (not 10,000 raw issues)
  return {
    totalIssues: allIssues.length,
    criticalBugs: criticalBugs.slice(0, 10), // Top 10 oldest critical bugs
    summary: \`Found \${criticalBugs.length} critical bugs, oldest is \${criticalBugs[0]?.daysOld} days old\`
  };
`);
```

### **Error Handling & Observability**
Built-in error handling with complete execution transparency:

```typescript
const { result, logs } = await client.callToolChain(`
  try {
    console.log('Starting multi-step workflow...');
    
    const data = await external_api.fetch_data({ id: 'user-123' });
    console.log('Data fetched successfully');
    
    const processed = await data_processor.transform(data);
    console.warn('Processing completed with', processed.warnings.length, 'warnings');
    
    return processed;
  } catch (error) {
    console.error('Workflow failed:', error.message);
    throw error; // Propagates to outer error handling
  }
`, 30000); // 30-second timeout

// Complete observability
console.log('Result:', result);
console.log('Execution logs:', logs);
// ['Starting multi-step workflow...', 'Data fetched successfully', '[WARN] Processing completed with 2 warnings']
```

### **Custom Timeouts**
Configure execution limits for different workload types:

```typescript
// Quick operations (5 seconds)
const quickResult = await client.callToolChain(`return await ping.check();`, 5000);

// Heavy data processing (2 minutes) 
const heavyResult = await client.callToolChain(`
  const bigData = await database.export_full_dataset();
  return await analytics.process_dataset(bigData);
`, 120000);
```

---

## AI Agent Integration

Plug-and-play with any AI framework. The built-in prompt template handles all the complexity:

```typescript
import { CodeModeUtcpClient } from '@utcp/code-mode';

const systemPrompt = `
You are an AI assistant with access to tools via UTCP CodeMode.
${CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE}
Additional instructions...
`;

// Works with any AI library
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Analyze the latest PR in microsoft/vscode' }
  ]
});
```

**The template provides comprehensive guidance on:**
- Tool discovery workflow (`searchTools` → `__interfaces` → `callToolChain`)
- Hierarchical access patterns (`manual.tool()` syntax)  
- Interface introspection (`__getToolInterface()`)
- Error handling and best practices

---

## API Reference

### **Core Methods**

#### `callToolChain(code: string, timeout?: number)`
Execute TypeScript code with full tool access and observability.
- **Returns**: `{result: any, logs: string[]}` with execution result and captured console output
- **Default timeout**: 30 seconds

#### `getAllToolsTypeScriptInterfaces()`
Generate complete TypeScript interfaces for IDE integration.
- **Returns**: String containing all interface definitions with namespaces

#### `searchTools(query: string)` *(from UtcpClient)*
Discover tools using natural language queries.
- **Returns**: Array of relevant tools with descriptions and interfaces

### **Static Methods**

#### `CodeModeUtcpClient.create(root_dir?, config?)`
Create a new client instance with optional configuration.

#### `CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE`
Production-ready prompt template for AI agents.

---

## Security & Performance

### **Secure by Design**
- **Node.js VM sandboxing** – Isolated execution context
- **No filesystem access** – Tools only through registered servers  
- **Timeout protection** – Configurable execution limits
- **Zero network access** – No external dependencies or API keys exposed

### **Performance Optimized**
- **Minimal memory footprint** – VM contexts are lightweight
- **Efficient tool caching** – TypeScript interfaces cached automatically
- **Streaming console output** – Real-time log capture without buffering
- **Identifier sanitization** – Handles invalid TypeScript identifiers gracefully

---

## Development Experience

### **IDE Integration**
Generate TypeScript definitions for full IntelliSense support:

```bash
# Generate tool interfaces  
const interfaces = await client.getAllToolsTypeScriptInterfaces();
await fs.writeFile('generated-tools.d.ts', interfaces);

# Add to tsconfig.json
{
  "compilerOptions": {
    "typeRoots": ["./generated-tools.d.ts"]
  }
}
```

### **Debug & Monitor**
Built-in observability for production deployments:

```typescript
const { result, logs } = await client.callToolChain(userCode);

// Ship logs to your monitoring system
logs.forEach(log => {
  if (log.startsWith('[ERROR]')) monitoring.error(log);
  if (log.startsWith('[WARN]')) monitoring.warn(log);
});
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
- **[UTCP Specification](https://utcp.io)** – Official TypeScript implementation  
- **[Report Issues](https://github.com/universal-tool-calling-protocol/code-mode/issues)** – Bug reports and feature requests

## License

**MPL-2.0** – Open source with commercial-friendly terms.
