#!/usr/bin/env node

// UTCP-MCP Bridge Entry Point
// This is the main entry point for the npx @utcp/mcp-bridge command

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "path";
import { promises as fs } from "fs";
import { parse as parseDotEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import "@utcp/http";
import "@utcp/text";
import "@utcp/mcp";
import "@utcp/cli";
import "@utcp/dotenv-loader"
import "@utcp/file"

import {
    UtcpClient,
    CallTemplateSchema,
    InMemConcurrentToolRepository,
    TagSearchStrategy,
    DefaultVariableSubstitutor,
    ensureCorePluginsInitialized,
    UtcpClientConfigSerializer
} from "@utcp/sdk";
import type { UtcpClientConfig } from "@utcp/sdk";
import { CodeModeUtcpClient } from "@utcp/code-mode";
import { ContentBlock, ContentBlockSchema } from "@modelcontextprotocol/sdk/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

ensureCorePluginsInitialized();

let utcpClient: CodeModeUtcpClient | null = null;

async function main() {
    setupMcpTools();
    utcpClient = await initializeUtcpClient();
    const transport = new StdioServerTransport();
    await mcp.connect(transport);
}

const mcp = new McpServer({
    name: "CodeMode-MCP",
    version: "1.0.0",
});

/**
 * Sanitizes an identifier to be a valid TypeScript identifier.
 */
function sanitizeIdentifier(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^[0-9]/, '_$&');
}

/**
 * Converts a UTCP tool name to its TypeScript interface name.
 */
function utcpNameToTsInterfaceName(utcpName: string): string {
    if (utcpName.includes('.')) {
        const parts = utcpName.split('.');
        const manualName = parts[0]!;
        const toolParts = parts.slice(1);
        const sanitizedManualName = sanitizeIdentifier(manualName);
        const toolName = toolParts.map(part => sanitizeIdentifier(part)).join('_');
        return `${sanitizedManualName}.${toolName}`;
    } else {
        return sanitizeIdentifier(utcpName);
    }
}

/**
 * Finds a tool by either UTCP name or TypeScript interface name.
 */
async function findToolByName(client: CodeModeUtcpClient, name: string): Promise<{ tool: any, utcpName: string } | null> {
    // First, try direct lookup by UTCP name
    const directTool = await client.config.tool_repository.getTool(name);
    if (directTool) {
        return { tool: directTool, utcpName: name };
    }
    
    // If not found, search through all tools to find one whose TS interface name matches
    const allTools = await client.config.tool_repository.getTools();
    for (const tool of allTools) {
        if (utcpNameToTsInterfaceName(tool.name) === name) {
            return { tool, utcpName: tool.name };
        }
    }
    
    return null;
}

function setupMcpTools() {
    // Register MCP prompt for using the code mode server
    mcp.registerPrompt("utcp_codemode_usage", {
        title: "UTCP Code Mode Usage Guide",
        description: "Comprehensive guide on how to use the UTCP Code Mode MCP server for executing TypeScript code with tool access."
    }, async () => {
        const codeInstructions = `# UTCP Code Mode MCP Server Usage Guide

You have access to a powerful UTCP Code Mode MCP server that allows you to execute TypeScript code with direct access to registered tools.

## Workflow: Always Follow This Pattern

### 1. 🔍 DISCOVER TOOLS FIRST
**Always start by searching for relevant tools before writing code:**
- Use \`search_tools\` with a description of your task to find relevant tools
- This returns tools with their TypeScript interfaces - study these carefully
- Use \`tool_info\` to get detailed interface information for specific tools if needed

${CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE}

- in the call_tool_chain code, return the result that you want to see, your code will be wrapped in an async function and executed

Remember: The power of this system comes from combining multiple tools in sophisticated TypeScript code execution workflows.`;

        return {
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: codeInstructions
                }
            }]
        };
    });

    mcp.registerTool("register_manual", {
        title: "Register a UTCP Manual",
        description: "Registers a new tool provider by providing its call template.",
        inputSchema: { manual_call_template: CallTemplateSchema.describe("The call template for the UTCP Manual endpoint.") },
    }, async (input) => {
        const client = await initializeUtcpClient();
        try {
            const result = await client.registerManual(input.manual_call_template as any);
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (e: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }) }] };
        }
    });

    mcp.registerTool("deregister_manual", {
        title: "Deregister a UTCP Manual",
        description: "Deregisters a tool provider from the UTCP client.",
        inputSchema: { manual_name: z.string().describe("The name of the manual to deregister.") },
    }, async (input) => {
        const client = await initializeUtcpClient();
        try {
            const success = await client.deregisterManual(input.manual_name);
            const message = success ? `Manual '${input.manual_name}' deregistered.` : `Manual '${input.manual_name}' not found.`;
            return { content: [{ type: "text", text: JSON.stringify({ success, message }) }] };
        } catch (e: any) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }) }] };
        }
    });

    mcp.registerTool("search_tools", {
        title: "Search for UTCP Tools",
        description: "Searches for relevant tools based on a task description.",
        inputSchema: {
            task_description: z.string().describe("A natural language description of the task."),
            limit: z.number().optional().default(10),
        },
    }, async (input) => {
        const client = await initializeUtcpClient();
        try {
            const tools = await client.searchTools(input.task_description, input.limit);
            const toolsWithInterfaces = tools.map(t => ({
                name: utcpNameToTsInterfaceName(t.name),
                description: t.description,
                typescript_interface: client.toolToTypeScriptInterface(t)
            }));
            return { content: [{ type: "text", text: JSON.stringify({ tools: toolsWithInterfaces }) }] };
        } catch (e: any) {
            return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: e.message }) }] };
        }
    });

    mcp.registerTool("list_tools", {
        title: "List All Registered UTCP Tools",
        description: "Returns a list of all tool names currently registered.",
        inputSchema: {},
    }, async () => {
        const client = await initializeUtcpClient();
        try {
            const tools = await client.config.tool_repository.getTools();
            const toolNames = tools.map(t => utcpNameToTsInterfaceName(t.name));
            return { content: [{ type: "text", text: JSON.stringify({ tools: toolNames }) }] };
        } catch (e: any) {
            return { isError: true, content: [{ type: "text", text: e.message }] };
        }
    });

    mcp.registerTool("get_required_keys_for_tool", {
        title: "Get Required Variables for Tool",
        description: "Get required environment variables for a registered tool.",
        inputSchema: {
            tool_name: z.string().describe("Name of the tool to get required variables for."),
        },
    }, async (input) => {
        const client = await initializeUtcpClient();
        try {
            const found = await findToolByName(client, input.tool_name);
            if (!found) {
                return { isError: true, content: [{ type: "text", text: `Tool '${input.tool_name}' not found` }] };
            }
            const variables = await client.getRequiredVariablesForRegisteredTool(found.utcpName);
            return { content: [{ type: "text", text: JSON.stringify({ success: true, tool_name: input.tool_name, required_variables: variables }) }] };
        } catch (e: any) {
            return {isError: true, content: [{ type: "text", text: JSON.stringify({ tool_name: input.tool_name, error: e.message }) }] };
        }
    });

    mcp.registerTool("tool_info", {
        title: "Get Tool Information with TypeScript Interface",
        description: "Get complete information about a specific tool including TypeScript interface definition.",
        inputSchema: {
            tool_name: z.string().describe("Name of the tool to get complete information for."),
        },
    }, async (input) => {
        const client = await initializeUtcpClient();
        try {
            const found = await findToolByName(client, input.tool_name);
            if (!found) {
                return { isError: true, content: [{ type: "text", text: `Tool '${input.tool_name}' not found` }] };
            }
            const typescript_interface = client.toolToTypeScriptInterface(found.tool);
            return { content: [{ type: "text", text: typescript_interface }] };
        } catch (e: any) {
            return { isError: true, content: [{ type: "text", text: e.message }] };
        }
    });

    // Code Mode specific tools
    mcp.registerTool("call_tool_chain", {
        title: "Execute TypeScript Code with Tool Access",
        description: "Execute TypeScript code with direct access to all registered tools as hierarchical functions (e.g., manual.tool()).",
        inputSchema: {
            code: z.string().describe("TypeScript code to execute with access to all registered tools."),
            timeout: z.number().optional().default(30000).describe("Optional timeout in milliseconds (default: 30000)."),
            max_output_size: z.number().optional().default(200000).describe("Optional maximum output size in characters (default: 200000)."),
        },
    }, async (input) => {
        const client = await initializeUtcpClient();
        try {
            const { result, logs } = await client.callToolChain(input.code, input.timeout);
            
            function truncateText(text: string): string {
                if (text.length <= input.max_output_size) {
                    return text;
                }
                return text.slice(0, input.max_output_size) + "...\nmax_output_size exceeded";
            }

            let content: Array<ContentBlock> = new Array<ContentBlock>();
            let processedResult: Array<any> = new Array<any>();

            // Handle MCP response content blocks
            // Based on logic from McpCommunicationProtocol._processMcpToolResult

            let mcpContentFound = false;
            // Case 1: content blocks passed as an array (when more than one)
            if (Array.isArray(result)) {
                for (const item of result) {
                    if (ContentBlockSchema.safeParse(item).success) {
                        content.push(item as ContentBlock);
                        mcpContentFound = true;
                    } else {
                        // Text blocks are returned as plain object or string
                        processedResult.push(item);
                    }
                }
            // Case 2: when a single content block is returned, it passed directly
            } else if (ContentBlockSchema.safeParse(result).success) {
                content.push(result as ContentBlock);
                mcpContentFound = true;
            // Case 3: result is not a content block - it's either text or structured data or not MCP content at all
            } else {
                processedResult.push(result);
            }
            
            const plainContent: any = processedResult.length > 1 ? processedResult : processedResult[0];
            const jsonContent: string = JSON.stringify({ success: true, nonMcpContentResults: plainContent, logs });
            content.push({ type: "text", text: truncateText(jsonContent) });

            return { content: content };
        } catch (e: any) {
            return { isError: true, content: [{ type: "text", text: e.message }] };
        }
    });

}

async function initializeUtcpClient(): Promise<CodeModeUtcpClient> {
    if (utcpClient) {
        return utcpClient;
    }

    // Look for config file: 1) Environment variable, 2) Current working directory, 3) Package directory
    const cwd = process.cwd();
    const packageDir = __dirname;
    
    let configPath: string;
    let scriptDir: string;
    
    // Check if UTCP_CONFIG_FILE environment variable is set
    if (process.env.UTCP_CONFIG_FILE) {
        configPath = path.resolve(process.env.UTCP_CONFIG_FILE);
        scriptDir = path.dirname(configPath);
        
        try {
            await fs.access(configPath);
        } catch {
            console.warn(`UTCP config file specified in UTCP_CONFIG_FILE not found: ${configPath}`);
        }
    } else {
        // Fall back to current working directory first, then package directory
        configPath = path.resolve(cwd, '.utcp_config.json');
        scriptDir = cwd;
        
        try {
            await fs.access(configPath);
        } catch {
            configPath = path.resolve(packageDir, '.utcp_config.json');
            scriptDir = packageDir;
        }
    }

    let rawConfig: any = {};
    try {
        const configFileContent = await fs.readFile(configPath, 'utf-8');
        rawConfig = JSON.parse(configFileContent);
    } catch (e: any) {
        if (e.code !== 'ENOENT') {
            console.warn(`Could not read or parse .utcp_config.json. Error: ${e.message}`);
        }
    }

    const clientConfig = new UtcpClientConfigSerializer().validateDict(rawConfig);

    const newClient = await CodeModeUtcpClient.create(scriptDir, clientConfig);

    utcpClient = newClient;
    return utcpClient;
}

main().catch(err => {
    console.error("Failed to start UTCP-MCP Bridge:", err);
    process.exit(1);
});
