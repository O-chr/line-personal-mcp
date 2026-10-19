import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const STORE = process.env.LINE_MCP_OAUTH_STORE ?? join(homedir(), ".config", "line-personal-mcp", "oauth.json");
const ACCESS_TTL = 3600, REFRESH_TTL = 30 * 86400, CODE_TTL = 300, PENDING_TTL = 600;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rand = () => randomBytes(32).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

interface Pending { client: OAuthClientInformationFull; params: AuthorizationParams; exp: number }
interface Code { clientId: string; challenge: string; redirectUri: string; exp: number }
interface Tok { clientId: string; exp: number; refresh?: boolean }
interface Data { clients: Record<string, OAuthClientInformationFull>; tokens: Record<string, Tok> } // tokens keyed by sha256

function load(): Data {
  if (!existsSync(STORE)) return { clients: {}, tokens: {} };
  return JSON.parse(readFileSync(STORE, "utf8"));
}
function save(d: Data) { mkdirSync(dirname(STORE), { recursive: true }); writeFileSync(STORE, JSON.stringify(d), { mode: 0o600 }); }

export interface GoogleCfg { clientId: string; clientSecret: string; publicUrl: string; allowedEmail: string }

/** Decode the id_token payload. It was received directly from Google's token endpoint over TLS, so no signature check is needed (OIDC Core 3.1.3.7). */
function idTokenClaims(idToken: string): { email?: string; email_verified?: boolean; aud?: string } {
  return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
}

export class GoogleGatedProvider implements OAuthServerProvider {
  private data = load();
  private pending = new Map<string, Pending>();
  private codes = new Map<string, Code>();
  constructor(private g: GoogleCfg) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (id) => this.data.clients[id],
      registerClient: (c) => {
        const full = { ...c, client_id: randomBytes(16).toString("hex"), client_id_issued_at: now() } as OAuthClientInformationFull;
        this.data.clients[full.client_id] = full; save(this.data); return full;
      },
    };
  }

  /** Step 1: send the user to Google. */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const state = rand();
    this.pending.set(state, { client, params, exp: now() + PENDING_TTL });
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: this.g.clientId, redirect_uri: `${this.g.publicUrl}/oauth/google/callback`,
      response_type: "code", scope: "openid email", state, prompt: "select_account",
    }).toString();
    res.redirect(u.toString());
  }

  /** Step 2: Google redirects back here. Only the allowed email gets an MCP authorization code. */
  async handleGoogleCallback(code: string, state: string): Promise<string> {
    const p = this.pending.get(state);
    this.pending.delete(state);
    if (!p || p.exp < now()) throw new Error("expired or unknown state");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: this.g.clientId, client_secret: this.g.clientSecret, redirect_uri: `${this.g.publicUrl}/oauth/google/callback`, grant_type: "authorization_code" }),
    });
    if (!r.ok) throw new Error("google token exchange failed");
    const claims = idTokenClaims((await r.json() as { id_token: string }).id_token);
    if (claims.aud !== this.g.clientId || claims.email_verified !== true || claims.email?.toLowerCase() !== this.g.allowedEmail.toLowerCase()) throw new Error("this Google account is not allowed");
    const mcpCode = rand();
    this.codes.set(mcpCode, { clientId: p.client.client_id, challenge: p.params.codeChallenge, redirectUri: p.params.redirectUri, exp: now() + CODE_TTL });
    const back = new URL(p.params.redirectUri);
    back.searchParams.set("code", mcpCode);
    if (p.params.state) back.searchParams.set("state", p.params.state);
    return back.toString();
  }

  async challengeForAuthorizationCode(_c: OAuthClientInformationFull, code: string): Promise<string> {
    const c = this.codes.get(code);
    if (!c || c.exp < now()) throw new Error("invalid code");
    return c.challenge;
  }

  private issue(clientId: string): OAuthTokens {
    const access = rand(), refresh = rand();
    this.data.tokens[sha(access)] = { clientId, exp: now() + ACCESS_TTL };
    this.data.tokens[sha(refresh)] = { clientId, exp: now() + REFRESH_TTL, refresh: true };
    for (const [k, t] of Object.entries(this.data.tokens)) if (t.exp < now()) delete this.data.tokens[k];
    save(this.data);
    return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh };
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, code: string, _v?: string, redirectUri?: string): Promise<OAuthTokens> {
    const c = this.codes.get(code);
    this.codes.delete(code); // single use
    if (!c || c.exp < now() || c.clientId !== client.client_id || (redirectUri && redirectUri !== c.redirectUri)) throw new Error("invalid code");
    return this.issue(client.client_id);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens> {
    const t = this.data.tokens[sha(refreshToken)];
    if (!t?.refresh || t.exp < now() || t.clientId !== client.client_id) throw new Error("invalid refresh token");
    delete this.data.tokens[sha(refreshToken)]; // rotate
    return this.issue(client.client_id);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const t = this.data.tokens[sha(token)];
    if (!t || t.refresh || t.exp < now()) throw new InvalidTokenError("invalid token");
    return { token, clientId: t.clientId, scopes: [], expiresAt: t.exp };
  }

  async revokeToken(_c: OAuthClientInformationFull, req: { token: string }): Promise<void> {
    delete this.data.tokens[sha(req.token)]; save(this.data);
  }
}
