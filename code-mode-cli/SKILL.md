---
name: utcp-cli
description: >
  Call external APIs, MCP servers, and CLI tools by writing TypeScript code that
  runs in a sandbox — without MCP. Use when the user wants the agent to use a
  tool/API/integration (e.g. "search Open Library", "read my Notion", "call this
  REST API") in an environment that has a shell but no MCP config and no
  settable environment variables (e.g. Claude Cowork sandboxes). Self-configure
  by writing a .utcp_config.json file, discover tools with `utcp search`,
  run tool-chains with `utcp run`, and complete interactive OAuth sign-ins
  with `utcp login`. Bootstrap with `npx @utcp/code-mode-cli prompt`.
---

# utcp cli

`utcp` (npm: `@utcp/code-mode-cli`) lets you call [UTCP](https://www.utcp.io)
tools by writing TypeScript that executes in an isolated sandbox. It needs only a
shell and a working folder — no MCP, no environment variables.

Run everything via `npx @utcp/code-mode-cli <command>` (or `utcp <command>`
if installed). **All output is JSON on stdout.**

## 1. Read the guide

```bash
npx @utcp/code-mode-cli prompt
```

## 2. Configure (write a file — no env vars)

Write `.utcp_config.json` in the working directory listing the manuals (APIs /
MCP servers / CLIs) you need:

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

Transports: `http` (incl. OpenAPI URLs), `mcp` (remote/local MCP servers), `cli`,
`text`, `file`.

## 3. Discover

```bash
utcp search "search for books"   # returns tools + TypeScript interfaces
utcp list                        # all tool names
utcp info <tool>                 # full interface for a tool
utcp keys <tool>                 # required variables (tokens) for a tool
```

## 4. Run a tool-chain

Call tools as `manual.tool({ args })`. Top-level `await` and `return` work.
Use a heredoc for multi-line code:

```bash
utcp run <<'EOF'
const r = await openlibrary.read_search_json_search_json_get({ q: "tolkien", limit: 3 });
return (r.docs || []).map(b => b.title);
EOF
```

Output: `{"success":true,"result":<value>,"logs":[...]}`.

## 5. Interactive OAuth (user signs into a page)

Declare an `oauth2_user` auth block on the manual. For a remote MCP server the
block is just `{ "auth_type": "oauth2_user", "access_token": "${MY_TOKEN}" }` —
endpoints are auto-discovered. Then:

```bash
utcp login <manual>
```

`login` prints NDJSON describing what to do next. Handle it like this:

- **`{"action":"show_user_url","then":"poll", ...}`** (device flow): show the
  user the `url` and `user_code` in chat, then wait — the command polls and
  finishes on its own, printing `{"action":"done", ...}`.
- **`{"action":"show_user_url","then":"rerun_with_code","next":"...", ...}`**
  (paste flow, used by MCP / authorization-code): show the user the `url`. After
  they sign in they are redirected to a URL that won't load (e.g.
  `http://localhost:8765/callback?code=...`). Ask them to copy that full
  address-bar URL and paste it to you, then run:
  ```bash
  utcp login <manual> --code "<pasted url or code>"
  ```
  It writes the token to `.env`; tools are now authenticated.

## Failure modes

- **`Invalid CallTemplate object`** → a manual in `.utcp_config.json` is missing a
  required field or uses an unknown `call_template_type`. Re-check against the
  schema (`utcp prompt`).
- **`access_token ... is empty` / `keys` shows a missing variable** → run
  `utcp login <manual>`.
- **`No pending login for '<manual>'`** → run `utcp login <manual>` (without
  `--code`) first to start the flow.
- **`isolated-vm` install fails on Windows** → needs the VS C++ build tools.

## Boundaries

- The bundled `@utcp/cli` plugin can run arbitrary local commands — only register
  manuals from trusted sources.
- This is for shell/sandbox agents. On an MCP client, use `@utcp/code-mode-mcp`.
