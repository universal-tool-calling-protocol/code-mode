# @utcp/code-mode-cli

**Call any API by writing code — from any shell. No MCP required.**

`utcp` lets an LLM agent discover [UTCP](https://www.utcp.io) tools, run
TypeScript tool-chains in a sandbox, and complete interactive OAuth logins —
using only shell commands and a local config file. Built for sandboxed agents
(e.g. Claude Cowork) that have a shell but no MCP.

## You don't run the CLI yourself

Hand an **agent** a description of the API you want used — **any** of:

- a UTCP **call template** (paste it directly),
- an **OpenAPI / Swagger spec** (a URL, or a file the agent reads),
- or just a **plain-English description** of the API (endpoints, base URL, auth).

…and tell it to run:

```bash
npx -y @utcp/code-mode-cli prompt
```

That command prints the full self-configuration + usage guide; the agent reads it,
writes a `.utcp_config.json`, and takes it from there. Everything else below is
reference.

---

## What the agent does

1. **Configure** — turn your API description into a UTCP manual in `.utcp_config.json`:
   - call template / OpenAPI URL → an `http` (or `mcp`) manual,
   - OpenAPI file / plain-English description → write a UTCP manual JSON file and
     load it with a `file` manual.
2. **`validate`** — check the config + manuals are well-formed and register.
3. **`search`** — discover tools and their TypeScript interfaces.
4. **`run`** — execute a tool-chain (tools are called as `manual.tool({ args })`).
5. **`login`** — if a tool needs interactive sign-in, complete OAuth (it shows you
   the URL, you authorize, the token is saved to `.env`).

Every command prints **JSON to stdout** (`login` prints one JSON object per line);
diagnostics go to stderr, so stdout pipes cleanly into `jq`.

## Commands

| Command | Description |
| --- | --- |
| `prompt` | Print the full agent guide (read first). |
| `search <query> [--limit N]` | Find tools; returns name + description + TS interface. |
| `list` | List all registered tool names. |
| `info <tool...>` | Print TypeScript interfaces for the named tools. |
| `keys <tool>` | List required variables (e.g. tokens) for a tool. |
| `run [code] [-c <code>] [--file <p>] [--timeout <ms>]` | Execute a tool-chain (also reads stdin). |
| `login <manual> [--paste] [--code <code\|url>]` | Interactive OAuth sign-in; writes the token to `.env`. |
| `validate [--offline]` | Validate `.utcp_config.json` + its manuals (registers each unless `--offline`). |
| `validate --manual <file...>` | Validate standalone UTCP manual file(s). |
| `--help` | Short usage. |

Global: `--config <path>` to use a specific config file (default `./.utcp_config.json`).

## Config example

```json
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
```

## Interactive OAuth (`oauth2_user`)

Declare an `oauth2_user` auth block; the token is provisioned by `utcp login`
and injected on every call afterwards (UTCP never runs the flow itself).

- **Remote MCP server (e.g. Notion):** minimal block — endpoints auto-discovered
  via the MCP SDK (discovery + dynamic client registration + PKCE):
  ```json
  "auth": { "auth_type": "oauth2_user", "access_token": "${NOTION_TOKEN}" }
  ```
  `utcp login notion` prints a sign-in URL; the user authorizes and pastes the
  redirect URL back via `--code`.
- **HTTP API with a device-code flow:** declare `device_authorization_endpoint`,
  `token_endpoint`, `client_id`, `scope`; `utcp login <manual>` prints a URL +
  code and polls until done.

Tokens are written to the `dotenv` file (default `.env`), keyed by the namespaced
variable UTCP looks up (`<manual>_<VAR>`), so the `dotenv` loader block is required
when using `${VAR}` secrets or `oauth2_user`.

> **Security:** the bundled `@utcp/cli` plugin lets a manual run arbitrary local
> commands. Only register manuals from sources you trust.

## Prerequisites

- Node.js ≥ 18.
- `isolated-vm` is a native addon; on Windows it needs the Visual Studio C++ build
  tools / `node-gyp` toolchain.

## Local development

Lives in the [code-mode](https://github.com/universal-tool-calling-protocol/code-mode)
repo alongside `typescript-library` (the `@utcp/code-mode` engine) and
`code-mode-mcp` (the MCP bridge). Depends on published `@utcp/*` (`@utcp/sdk`
≥ 1.1.1, `@utcp/http` ≥ 1.1.7, `@utcp/mcp` ≥ 1.1.3 — the ones carrying the
`oauth2_user` variant).

```bash
npm install
npm run build
node dist/index.js --help
```
