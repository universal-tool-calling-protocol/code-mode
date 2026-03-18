# Code Mode MCP Server (Hintas Fork)

Fork of [universal-tool-calling-protocol/code-mode](https://github.com/universal-tool-calling-protocol/code-mode) with Docker containerization for Hintas multi-tenant deployment.

Only `code-mode-mcp/` is containerized. `python-library/` and `typescript-library/` are kept for upstream sync but excluded from Docker builds via `.dockerignore`.

## Docker Usage

### Build and run

```bash
docker build -t code-mode .
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e UTCP_CONFIG_FILE=/app/config/.utcp_config.json \
  -v /path/to/.utcp_config.json:/app/config/.utcp_config.json:ro \
  -v /path/to/.env:/app/config/.env:ro \
  code-mode
```

### Docker Compose

```bash
# Place your .utcp_config.json and .env in code-mode-mcp/, then:
docker compose up --build
```

### Health check

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

### Transport modes

- **HTTP** (Docker/production): Set `PORT=3000` — serves Streamable HTTP on `/mcp`
- **stdio** (local/desktop): Omit `PORT` — uses MCP stdio transport, backward compatible with `npx @utcp/code-mode-mcp`

### Config injection

Both `.utcp_config.json` and `.env` must be in the same directory. Set `UTCP_CONFIG_FILE` to point at the config, and the server resolves `.env` relative to it.

```
-v /tenant/config/.utcp_config.json:/app/config/.utcp_config.json:ro
-v /tenant/config/.env:/app/config/.env:ro
-e UTCP_CONFIG_FILE=/app/config/.utcp_config.json
```

## Upstream Sync

`main` branch is a clean mirror of upstream. All Hintas changes live on `hintas`.

### Sync workflow

1. On GitHub: "Sync fork" button updates `main` to match upstream
2. Locally: `git checkout hintas && git rebase main`
3. Since Hintas changes are mostly new files (Dockerfile, CI, docker-compose) and one small `index.ts` modification, rebases rarely conflict

### Why python-library/ is not deleted

Deleting it would cause merge conflicts on every upstream sync that touches those files. `.dockerignore` excludes it from builds instead.

### Contributing back to upstream

Create a branch off `main` (which mirrors upstream), make changes, open a PR against `universal-tool-calling-protocol/code-mode`.

## CI/CD

Pushing to `hintas` triggers GitHub Actions to build and push the Docker image to `ghcr.io/prmsregmi/code-mode` with tags `latest` and `sha-<hash>`.

## License

MPL-2.0
