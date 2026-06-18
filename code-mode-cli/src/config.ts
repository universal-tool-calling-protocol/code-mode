// Config discovery + client construction.
// Adapted from the code-mode MCP bridge's initializeUtcpClient(), but driven by
// a CLI flag instead of only an env var, since sandboxed agents (e.g. Cowork)
// cannot set environment variables — they write a local .utcp_config.json.
import path from 'path';
import { promises as fs } from 'fs';
import { UtcpClientConfigSerializer, ensureCorePluginsInitialized } from '@utcp/sdk';
import { CodeModeUtcpClient } from '@utcp/code-mode';

export interface ResolvedClient {
  client: CodeModeUtcpClient;
  /** Absolute path to the config file that was (or would be) loaded. */
  configPath: string;
  /** Directory the client resolves relative paths and secrets (.env) against. */
  scriptDir: string;
  /** The raw, un-substituted config object as read from disk. */
  rawConfig: Record<string, unknown>;
}

export interface CreateClientOptions {
  /** When true, do not register the config's manuals on create (caller registers them). */
  skipManualRegistration?: boolean;
}

/**
 * Resolves the config path with precedence:
 *   1. explicit --config flag
 *   2. ./.utcp_config.json in the current working directory
 *   3. UTCP_CONFIG_FILE environment variable
 * Falls back to cwd/.utcp_config.json (which may not exist → empty config).
 */
export async function resolveConfigPath(configFlag?: string): Promise<string> {
  if (configFlag) return path.resolve(configFlag);

  const cwdConfig = path.resolve(process.cwd(), '.utcp_config.json');
  try {
    await fs.access(cwdConfig);
    return cwdConfig;
  } catch {
    /* fall through */
  }

  if (process.env.UTCP_CONFIG_FILE) return path.resolve(process.env.UTCP_CONFIG_FILE);
  return cwdConfig;
}

/** Builds a CodeModeUtcpClient from the resolved config file. */
export async function createClient(
  configFlag?: string,
  opts: CreateClientOptions = {},
): Promise<ResolvedClient> {
  ensureCorePluginsInitialized();

  const configPath = await resolveConfigPath(configFlag);
  const scriptDir = path.dirname(configPath);

  let rawConfig: Record<string, unknown> = {};
  try {
    rawConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      // Surface parse errors to stderr; an empty config still lets `prompt`/`--help` work.
      process.stderr.write(`[code-mode] Could not read/parse ${configPath}: ${e.message}\n`);
    }
  }

  // Validate (and optionally strip manuals so the caller can register them
  // one-by-one and capture per-manual results).
  const configForClient = opts.skipManualRegistration
    ? { ...rawConfig, manual_call_templates: [] }
    : rawConfig;
  const clientConfig = new UtcpClientConfigSerializer().validateDict(configForClient);
  const client = await CodeModeUtcpClient.create(scriptDir, clientConfig);
  return { client, configPath, scriptDir, rawConfig };
}
