// Interactive OAuth login flows for `utcp login`.
//
// UTCP cannot run interactive OAuth itself (no user channel, no persistence), so
// this module performs the sign-in and writes the resulting bearer token into a
// dotenv file. A manual's `oauth2_user` auth block then references that token via
// `access_token: "${VAR}"`, and UTCP injects it at call time.
//
// Two transport shapes:
//   - Generic HTTP manuals: endpoints come from the auth block. Device-code flow
//     is a single streaming command; authorization-code is a two-step paste flow.
//   - MCP manuals: endpoints are DISCOVERED from the server via the MCP SDK
//     (RFC 9728 + RFC 8414), with dynamic client registration (RFC 7591) and a
//     two-step PKCE paste flow.
//
// All output is NDJSON: one JSON object per line. Device-flow prints the sign-in
// line immediately, then a result line once authorized.
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import {
  discoverOAuthProtectedResourceMetadata,
  discoverAuthorizationServerMetadata,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';

const STATE_FILE = '.code-mode-login-state.json';
const TOKENS_FILE = '.code-mode-tokens.json';
/** Loopback redirect: the browser lands here after sign-in; the URL bar holds ?code=. */
export const DEFAULT_REDIRECT = 'http://localhost:8765/callback';

function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// ---------------------------------------------------------------------------
// dotenv + state persistence
// ---------------------------------------------------------------------------

/** Sets or replaces `key=value` in a dotenv file (created if missing). */
export async function upsertEnvVar(envPath: string, key: string, value: string): Promise<void> {
  let lines: string[] = [];
  try {
    const existing = await fs.readFile(envPath, 'utf-8');
    lines = existing.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.startsWith(`${key}=`));
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
  lines.push(`${key}=${value}`);
  await fs.writeFile(envPath, lines.join('\n') + '\n', 'utf-8');
}

type LoginState = Record<string, any>;

async function readStateMap(): Promise<Record<string, LoginState>> {
  try {
    return JSON.parse(await fs.readFile(path.resolve(process.cwd(), STATE_FILE), 'utf-8'));
  } catch {
    return {};
  }
}

async function saveState(manual: string, state: LoginState): Promise<void> {
  const map = await readStateMap();
  map[manual] = state;
  await fs.writeFile(path.resolve(process.cwd(), STATE_FILE), JSON.stringify(map, null, 2), 'utf-8');
}

async function loadState(manual: string): Promise<LoginState | null> {
  const map = await readStateMap();
  return map[manual] ?? null;
}

async function clearState(manual: string): Promise<void> {
  const map = await readStateMap();
  delete map[manual];
  await fs.writeFile(path.resolve(process.cwd(), STATE_FILE), JSON.stringify(map, null, 2), 'utf-8');
}

async function persistTokenMeta(manual: string, meta: Record<string, any>): Promise<void> {
  let map: Record<string, any> = {};
  try {
    map = JSON.parse(await fs.readFile(path.resolve(process.cwd(), TOKENS_FILE), 'utf-8'));
  } catch {
    /* new file */
  }
  map[manual] = { ...(map[manual] || {}), ...meta };
  await fs.writeFile(path.resolve(process.cwd(), TOKENS_FILE), JSON.stringify(map, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Reads a query param from a pasted redirect URL (or bare `?k=v` fragment). */
function paramFromInput(input: string, name: string): string | null {
  const trimmed = input.trim();
  if (trimmed.includes('://') || trimmed.includes('?')) {
    try {
      const url = new URL(trimmed.includes('://') ? trimmed : `http://x/${trimmed}`);
      return url.searchParams.get(name);
    } catch {
      /* not a URL */
    }
  }
  return null;
}

/** Accepts a bare code or a full pasted redirect URL and returns the code. */
export function parseCodeFromInput(input: string): string {
  const code = paramFromInput(input, 'code');
  return code ?? input.trim();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function postForm(url: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Generic HTTP — device-code flow (single streaming command)
// ---------------------------------------------------------------------------

export interface HttpDeviceArgs {
  manual: string;
  deviceEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  scope?: string;
  envPath: string;
  envKey: string;
}

export async function httpDeviceLogin(a: HttpDeviceArgs): Promise<void> {
  const start = await postForm(a.deviceEndpoint, {
    client_id: a.clientId,
    ...(a.scope ? { scope: a.scope } : {}),
  });
  if (!start.ok || !start.json.device_code) {
    throw new Error(`Device authorization failed (${start.status}): ${JSON.stringify(start.json)}`);
  }
  const d = start.json;
  // Print the sign-in instruction immediately so the agent can relay it.
  emit({
    action: 'show_user_url',
    url: d.verification_uri,
    user_code: d.user_code,
    verification_uri_complete: d.verification_uri_complete,
    then: 'poll',
    message: `Tell the user to open ${d.verification_uri} and enter code ${d.user_code}. Polling for completion...`,
  });

  let interval = (d.interval || 5) * 1000;
  const deadline = Date.now() + (d.expires_in || 900) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const poll = await postForm(a.tokenEndpoint, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: d.device_code,
      client_id: a.clientId,
    });
    if (poll.json.access_token) {
      await upsertEnvVar(a.envPath, a.envKey, poll.json.access_token);
      if (poll.json.refresh_token) {
        await persistTokenMeta(a.manual, { refresh_token: poll.json.refresh_token, client_id: a.clientId });
      }
      emit({ action: 'done', wrote: a.envKey, env_file: a.envPath, message: 'Login complete. The token is now available to the manual.' });
      return;
    }
    const err = poll.json.error;
    if (err === 'authorization_pending') continue;
    if (err === 'slow_down') {
      interval += 5000;
      continue;
    }
    throw new Error(`Device token poll failed: ${JSON.stringify(poll.json)}`);
  }
  throw new Error('Device authorization expired before the user completed sign-in.');
}

// ---------------------------------------------------------------------------
// Generic HTTP — authorization-code flow (two-step paste)
// ---------------------------------------------------------------------------

export interface HttpAuthCodeArgs {
  manual: string;
  authEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  scope?: string;
  redirect: string;
  envPath: string;
  envKey: string;
}

export async function httpAuthCodeStart(a: HttpAuthCodeArgs): Promise<void> {
  const codeVerifier = b64url(crypto.randomBytes(32));
  const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const url = new URL(a.authEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', a.clientId);
  url.searchParams.set('redirect_uri', a.redirect);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  if (a.scope) url.searchParams.set('scope', a.scope);

  await saveState(a.manual, {
    kind: 'http_authcode',
    tokenEndpoint: a.tokenEndpoint,
    clientId: a.clientId,
    redirect: a.redirect,
    codeVerifier,
    state,
    envPath: a.envPath,
    envKey: a.envKey,
  });
  emit({
    action: 'show_user_url',
    url: url.href,
    then: 'rerun_with_code',
    next: `utcp login ${a.manual} --code "<pasted code or redirect URL>"`,
    message: `Tell the user to open the URL and sign in. After redirect to ${a.redirect}, have them copy the full address-bar URL (or the code) and pass it to the next command.`,
  });
}

export async function loginFinishWithCode(manual: string, codeInput: string): Promise<void> {
  const st = await loadState(manual);
  if (!st) throw new Error(`No pending login for '${manual}'. Run \`utcp login ${manual}\` first.`);
  const code = parseCodeFromInput(codeInput);

  // CSRF / response-binding check. If we issued a `state`, a pasted redirect URL
  // MUST carry a matching `state` — a URL with a missing or different state is
  // rejected (fail-closed), since a legitimate redirect from our request always
  // includes it. Only a bare code paste (no URL) is allowed through unverified,
  // because there is genuinely no state to compare.
  if (st.state) {
    const isRedirectUrl = /:\/\/|\?/.test(codeInput.trim());
    if (isRedirectUrl) {
      const returnedState = paramFromInput(codeInput, 'state');
      if (returnedState !== st.state) {
        throw new Error('OAuth state missing or mismatched — aborting login (possible CSRF, or a stale/wrong link). Restart with `utcp login`.');
      }
    }
  }

  if (st.kind === 'http_authcode') {
    const res = await postForm(st.tokenEndpoint, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: st.redirect,
      client_id: st.clientId,
      code_verifier: st.codeVerifier,
    });
    if (!res.json.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(res.json)}`);
    await upsertEnvVar(st.envPath, st.envKey, res.json.access_token);
    if (res.json.refresh_token) await persistTokenMeta(manual, { refresh_token: res.json.refresh_token, client_id: st.clientId });
    await clearState(manual);
    emit({ action: 'done', wrote: st.envKey, env_file: st.envPath, message: 'Login complete.' });
    return;
  }

  if (st.kind === 'mcp') {
    const tokens = await exchangeAuthorization(st.authServerUrl, {
      metadata: st.metadata,
      clientInformation: st.clientInformation,
      authorizationCode: code,
      codeVerifier: st.codeVerifier,
      redirectUri: st.redirect,
      resource: st.resource ? new URL(st.resource) : undefined,
    });
    if (!tokens.access_token) throw new Error(`MCP token exchange returned no access_token: ${JSON.stringify(tokens)}`);
    await upsertEnvVar(st.envPath, st.envKey, tokens.access_token);
    await persistTokenMeta(manual, {
      refresh_token: tokens.refresh_token,
      client_id: st.clientInformation?.client_id,
      authServerUrl: st.authServerUrl,
    });
    await clearState(manual);
    emit({ action: 'done', wrote: st.envKey, env_file: st.envPath, message: 'MCP login complete.' });
    return;
  }

  throw new Error(`Unknown pending login kind '${st.kind}' for '${manual}'.`);
}

// ---------------------------------------------------------------------------
// MCP — discovery + dynamic client registration + PKCE (two-step paste)
// ---------------------------------------------------------------------------

export interface McpLoginArgs {
  manual: string;
  serverUrl: string;
  scope?: string;
  redirect: string;
  envPath: string;
  envKey: string;
}

export async function mcpLoginStart(a: McpLoginArgs): Promise<void> {
  const resourceMeta = await discoverOAuthProtectedResourceMetadata(a.serverUrl).catch(() => undefined);
  const authServerUrl = (resourceMeta?.authorization_servers && resourceMeta.authorization_servers[0]) || a.serverUrl;
  const metadata = await discoverAuthorizationServerMetadata(authServerUrl);
  if (!metadata) throw new Error(`Could not discover OAuth metadata for ${authServerUrl}.`);

  const clientInformation = await registerClient(authServerUrl, {
    metadata,
    clientMetadata: {
      client_name: `code-mode-cli (${a.manual})`,
      redirect_uris: [a.redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(a.scope ? { scope: a.scope } : {}),
    },
  });

  const resource = new URL((resourceMeta as any)?.resource || a.serverUrl);
  const state = b64url(crypto.randomBytes(16));
  const { authorizationUrl, codeVerifier } = await startAuthorization(authServerUrl, {
    metadata,
    clientInformation,
    redirectUrl: a.redirect,
    scope: a.scope,
    state,
    resource,
  });

  await saveState(a.manual, {
    kind: 'mcp',
    authServerUrl,
    metadata,
    clientInformation,
    codeVerifier,
    state,
    redirect: a.redirect,
    resource: resource.href,
    envPath: a.envPath,
    envKey: a.envKey,
  });
  emit({
    action: 'show_user_url',
    url: authorizationUrl.href,
    then: 'rerun_with_code',
    next: `utcp login ${a.manual} --code "<pasted code or redirect URL>"`,
    message: `Tell the user to open the URL and authorize. After redirect to ${a.redirect}, have them copy the full address-bar URL (or the code) and pass it to the next command.`,
  });
}
