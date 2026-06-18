#!/usr/bin/env node
// @utcp/code-mode-cli — call UTCP tools via code mode from any shell.
//
// Output contract: every command prints JSON to stdout. Most print a single
// object; `login` prints NDJSON (one object per line). Errors print
// {"error": "..."} and exit non-zero. Human/diagnostic noise goes to stderr.
import { promises as fs } from 'fs';
import path from 'path';
import util from 'util';

// Keep stdout reserved for machine-readable JSON: route UTCP's diagnostic
// console output (log/info/warn) to stderr. Tool-chain console output is
// captured separately by callToolChain and returned in `logs`.
console.log = (...args: any[]) => process.stderr.write(util.format(...args) + '\n');
console.info = (...args: any[]) => process.stderr.write(util.format(...args) + '\n');
console.warn = (...args: any[]) => process.stderr.write(util.format(...args) + '\n');

// Protocol plugins register themselves on import (side effects).
import '@utcp/http';
import '@utcp/text';
import '@utcp/mcp';
import '@utcp/cli';
import '@utcp/dotenv-loader';
import '@utcp/file';

import { CodeModeUtcpClient } from '@utcp/code-mode';
import { createClient, resolveConfigPath } from './src/config.js';
import { utcpNameToTsInterfaceName, findToolByName } from './src/names.js';
import {
  httpDeviceLogin,
  httpAuthCodeStart,
  mcpLoginStart,
  loginFinishWithCode,
  DEFAULT_REDIRECT,
} from './src/oauth.js';
import { validateConfig, validateManualFiles } from './src/validate.js';

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

interface Args {
  command: string;
  positionals: string[];
  config?: string;
  limit?: number;
  code?: string;
  file?: string;
  timeout?: number;
  paste: boolean;
  authCode?: string;
  offline: boolean;
  manualMode: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { command: argv[0] || 'help', positionals: [], paste: false, offline: false, manualMode: false };
  for (let i = 1; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case '--config': a.config = argv[++i]; break;
      case '--limit': a.limit = Number(argv[++i]); break;
      case '-c': case '--code-string': a.code = argv[++i]; break;
      case '--file': a.file = argv[++i]; break;
      case '--timeout': a.timeout = Number(argv[++i]); break;
      case '--paste': a.paste = true; break;
      case '--code': a.authCode = argv[++i]; break;
      case '--offline': a.offline = true; break;
      case '--manual': a.manualMode = true; break;
      case '-h': case '--help': a.command = a.command === 'help' ? 'help' : a.command; a.positionals.push('--help'); break;
      default: a.positionals.push(t);
    }
  }
  return a;
}

function out(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}
function fail(message: string): never {
  process.stdout.write(JSON.stringify({ error: message }) + '\n');
  process.exit(1);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

// ---------------------------------------------------------------------------
// guide text
// ---------------------------------------------------------------------------

const SELF_CONFIG_GUIDE = `
## Self-configuration (no environment variables needed)

You configure tools by writing a \`.utcp_config.json\` file in your working
directory, then running \`utcp\` against it. Minimal example:

{
  "load_variables_from": [
    { "variable_loader_type": "dotenv", "env_file_path": ".env" }
  ],
  "manual_call_templates": [
    {
      "name": "openlibrary",
      "call_template_type": "http",
      "http_method": "GET",
      "url": "https://openlibrary.org/static/openapi.json",
      "content_type": "application/json"
    }
  ]
}

### Workflow
1. Write \`.utcp_config.json\` with the manuals (APIs / MCP servers / CLIs) you need.
2. \`utcp validate\` to confirm the config + manuals are well-formed and that
   each manual registers (use \`--offline\` to skip the network and only check shape).
3. \`utcp search "<task>"\` to discover tools + their TypeScript interfaces.
4. Write a tool-chain in TypeScript and run it:
   utcp run <<'EOF'
   const r = await openlibrary.read_search_json({ q: "tolkien" });
   return r.docs.slice(0, 3).map(b => b.title);
   EOF
5. Tools are called as \`manual.tool({ args })\`. Top-level \`await\` and \`return\` work.

### You can load an API from any description — not just a UTCP call template
- **OpenAPI / Swagger spec (URL):** use an \`http\` manual whose \`url\` points at the
  spec; UTCP auto-converts it to tools. (The openlibrary example above is exactly this.)
- **OpenAPI spec you have as a file, OR a natural-language API description:** YOU
  write a UTCP manual JSON file (a \`{ "utcp_version": "...", "tools": [...] }\`
  document — each tool has name/description/inputs/outputs/tool_call_template),
  then load it with a \`file\` manual:
    { "name": "myapi", "call_template_type": "file", "file_path": "./myapi_manual.json" }
  Validate the manual you wrote first:  \`utcp validate --manual ./myapi_manual.json\`
- When unsure of the manual schema, run \`utcp validate --manual <file>\` and fix
  the reported errors until it passes; then add the \`file\` manual to your config and
  \`utcp validate\` the whole config.

### Authentication
- API key / basic / OAuth2 client-credentials: put values (or \`\${VAR}\` refs) in the
  manual's \`auth\` block; provide \`\${VAR}\` values via the \`.env\` dotenv loader.
- Interactive sign-in (user opens a page): declare an \`oauth2_user\` auth block:
    "auth": { "auth_type": "oauth2_user", "access_token": "\${MY_TOKEN}",
              "grant_type": "device_code",
              "device_authorization_endpoint": "...", "token_endpoint": "...",
              "client_id": "..." , "scope": "..." }
  For MCP servers, only \`{ "auth_type": "oauth2_user", "access_token": "\${MY_TOKEN}" }\`
  is needed — endpoints are auto-discovered. Then run:
    utcp login <manual>
  and follow the printed instructions (show the user the URL). \`login\` writes the
  token into \`.env\`; UTCP injects it on every call afterwards.
`.trim();

function helpText(): string {
  return [
    'utcp — call UTCP tools via code mode from any shell. No MCP required.',
    '',
    'Commands:',
    '  prompt                      Print the full agent guide (read this first).',
    '  search <query> [--limit N]  Find tools; returns TypeScript interfaces.',
    '  list                        List all registered tool names.',
    '  info <tool...>              Print TypeScript interfaces for tools.',
    '  keys <tool>                 List required variables (e.g. tokens) for a tool.',
    '  run [code] [-c <code>] [--file <p>] [--timeout <ms>]',
    '                              Execute a TS tool-chain (also reads stdin).',
    '  login <manual> [--paste] [--code <code|url>]',
    '                              Interactive OAuth sign-in; writes token to .env.',
    '  validate [--offline]        Validate .utcp_config.json + its manuals.',
    '  validate --manual <file...> Validate standalone UTCP manual file(s).',
    '',
    'Global: --config <path>   Use a specific .utcp_config.json',
    '',
    'Run `utcp prompt` for the full self-configuration + login guide.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// login helpers
// ---------------------------------------------------------------------------

/** Re-derives the namespaced dotenv key UTCP looks up for `${var}` in a manual. */
function namespacedKey(manualName: string, varName: string): string {
  return manualName.replace(/_/g, '!').replace(/!/g, '__') + '_' + varName;
}

function varNameFromTemplate(accessToken: string): string | null {
  const m = /\$\{?([a-zA-Z0-9_]+)\}?/.exec(accessToken || '');
  return m ? m[1]! : null;
}

async function readRawConfig(configPath: string): Promise<any> {
  try {
    return JSON.parse(await fs.readFile(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function dotenvPath(rawConfig: any): string {
  const loaders: any[] = rawConfig.load_variables_from || [];
  const dotenv = loaders.find((l) => l && l.variable_loader_type === 'dotenv');
  const rel = dotenv?.env_file_path || '.env';
  // The dotenv loader resolves env_file_path relative to process.cwd().
  return path.resolve(process.cwd(), rel);
}

async function handleLogin(args: Args): Promise<void> {
  const target = args.positionals[0];
  if (!target) fail('Usage: utcp login <manual> [--paste] [--code <code|url>]');
  const manual = target.includes('.') ? target.split('.')[0]! : target;

  // Step 2 of any paste flow: just exchange the code.
  if (args.authCode) {
    await loginFinishWithCode(manual, args.authCode);
    return;
  }

  const configPath = await resolveConfigPath(args.config);
  const raw = await readRawConfig(configPath);
  const entry = (raw.manual_call_templates || []).find((m: any) => m.name === manual);
  if (!entry) fail(`Manual '${manual}' not found in ${configPath}.`);
  const auth = entry.auth || {};
  if (auth.auth_type !== 'oauth2_user') {
    fail(`Manual '${manual}' does not declare an 'oauth2_user' auth block; nothing to log in to.`);
  }
  const varName = varNameFromTemplate(auth.access_token);
  if (!varName) fail(`Manual '${manual}' oauth2_user.access_token must reference a variable like "\${MY_TOKEN}".`);
  const envKey = namespacedKey(manual, varName!);
  const envPath = dotenvPath(raw);
  const redirect = auth.redirect_uri || DEFAULT_REDIRECT;

  if (entry.call_template_type === 'mcp') {
    const servers = entry.config?.mcpServers || {};
    const first: any = Object.values(servers)[0];
    const serverUrl = first?.url;
    if (!serverUrl) fail(`MCP manual '${manual}' has no http server url to discover OAuth from.`);
    await mcpLoginStart({ manual, serverUrl, scope: auth.scope, redirect, envPath, envKey });
    return;
  }

  // HTTP manual: choose flow.
  const grant = args.paste
    ? 'authorization_code'
    : auth.grant_type || (auth.device_authorization_endpoint ? 'device_code' : 'authorization_code');

  if (grant === 'device_code') {
    if (!auth.device_authorization_endpoint || !auth.token_endpoint || !auth.client_id) {
      fail(`device_code flow needs device_authorization_endpoint, token_endpoint and client_id in the oauth2_user block.`);
    }
    await httpDeviceLogin({
      manual,
      deviceEndpoint: auth.device_authorization_endpoint,
      tokenEndpoint: auth.token_endpoint,
      clientId: auth.client_id,
      scope: auth.scope,
      envPath,
      envKey,
    });
  } else {
    if (!auth.authorization_endpoint || !auth.token_endpoint || !auth.client_id) {
      fail(`authorization_code flow needs authorization_endpoint, token_endpoint and client_id in the oauth2_user block.`);
    }
    await httpAuthCodeStart({
      manual,
      authEndpoint: auth.authorization_endpoint,
      tokenEndpoint: auth.token_endpoint,
      clientId: auth.client_id,
      scope: auth.scope,
      redirect,
      envPath,
      envKey,
    });
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (['help', '--help', '-h'].includes(args.command) || args.positionals.includes('--help')) {
    process.stdout.write(helpText() + '\n');
    return;
  }

  if (args.command === 'prompt') {
    process.stdout.write(
      CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE + '\n\n' + SELF_CONFIG_GUIDE + '\n',
    );
    return;
  }

  if (args.command === 'login') {
    await handleLogin(args);
    return;
  }

  if (args.command === 'validate') {
    if (args.manualMode) {
      if (args.positionals.length === 0) fail('Usage: utcp validate --manual <file...>');
      out(await validateManualFiles(args.positionals));
    } else {
      out(await validateConfig(args.config, args.offline));
    }
    return;
  }

  // All remaining commands need a client.
  const { client } = await createClient(args.config);

  switch (args.command) {
    case 'search': {
      const query = args.positionals.join(' ');
      if (!query) fail('Usage: utcp search <query> [--limit N]');
      const tools = await client.searchTools(query, args.limit ?? 10);
      out({
        tools: tools.map((t) => ({
          name: utcpNameToTsInterfaceName(t.name),
          description: t.description,
          typescript_interface: client.toolToTypeScriptInterface(t),
        })),
      });
      break;
    }
    case 'list': {
      const tools = await client.config.tool_repository.getTools();
      out({ tools: tools.map((t) => utcpNameToTsInterfaceName(t.name)) });
      break;
    }
    case 'info': {
      if (args.positionals.length === 0) fail('Usage: utcp info <tool...>');
      const parts: string[] = [];
      for (const name of args.positionals) {
        const found = await findToolByName(client, name);
        parts.push(found ? client.toolToTypeScriptInterface(found.tool) : `// Tool '${name}' not found`);
      }
      out({ interfaces: parts.join('\n\n') });
      break;
    }
    case 'keys': {
      const name = args.positionals[0];
      if (!name) fail('Usage: utcp keys <tool>');
      const found = await findToolByName(client, name);
      if (!found) fail(`Tool '${name}' not found`);
      const vars = await client.getRequiredVariablesForRegisteredTool(found!.utcpName);
      out({ tool: name, required_variables: vars });
      break;
    }
    case 'run': {
      let code = args.code ?? '';
      if (!code && args.file) code = await fs.readFile(args.file, 'utf-8');
      if (!code && args.positionals.length) code = args.positionals.join(' ');
      if (!code) code = await readStdin();
      if (!code.trim()) fail('No code provided. Pass via -c, --file, a positional, or stdin.');
      const { result, logs } = await client.callToolChain(code, args.timeout ?? 30000);
      out({ success: true, result, logs });
      break;
    }
    default:
      fail(`Unknown command '${args.command}'. Run \`utcp help\`.`);
  }

  await client.close().catch(() => {});
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
