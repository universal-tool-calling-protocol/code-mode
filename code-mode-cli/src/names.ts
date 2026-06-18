// Tool-name helpers. Mirrors the mapping used by the code-mode MCP bridge so the
// CLI surfaces tools to the agent under the same TypeScript-interface names that
// `callToolChain` exposes (e.g. manual.tool).
import type { CodeModeUtcpClient } from '@utcp/code-mode';
import type { Tool } from '@utcp/sdk';

/** Sanitizes a name into a valid TypeScript identifier. */
export function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
}

/** Converts a UTCP tool name ("manual.tool") to its TS interface name. */
export function utcpNameToTsInterfaceName(utcpName: string): string {
  if (utcpName.includes('.')) {
    const parts = utcpName.split('.');
    const manualName = parts[0]!;
    const toolParts = parts.slice(1);
    return `${sanitizeIdentifier(manualName)}.${toolParts.map(sanitizeIdentifier).join('_')}`;
  }
  return sanitizeIdentifier(utcpName);
}

/** Finds a tool by either its UTCP name or its TS-interface name. */
export async function findToolByName(
  client: CodeModeUtcpClient,
  name: string,
): Promise<{ tool: Tool; utcpName: string } | null> {
  const direct = await client.config.tool_repository.getTool(name);
  if (direct) return { tool: direct, utcpName: name };

  const all = await client.config.tool_repository.getTools();
  for (const tool of all) {
    if (utcpNameToTsInterfaceName(tool.name) === name) {
      return { tool, utcpName: tool.name };
    }
  }
  return null;
}
