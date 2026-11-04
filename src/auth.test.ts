import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { GoogleGatedProvider } from "./auth.js";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const client = { client_id: "test-client", redirect_uris: ["https://example.test/callback"], token_endpoint_auth_method: "none" as const };
const cfg = { clientId: "google-test", clientSecret: "synthetic", publicUrl: "https://example.test", allowedEmail: "owner@example.test" };

function fixture(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), "line-oauth-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "oauth.json");
  let time = 2_000_000_000;
  const refresh = "synthetic-original-refresh";
  writeFileSync(path, JSON.stringify({ clients: { [client.client_id]: client }, tokens: { [hash(refresh)]: { clientId: client.client_id, refresh: true, exp: time + 1000 } } }), { mode: 0o600 });
  const options = { storePath: path, now: () => time };
  return { provider: new GoogleGatedProvider(cfg, options), path, refresh, options, advance: (seconds: number) => { time += seconds; } };
}

test("concurrent refreshes return one identical token pair and persist only hashes", async (t) => {
  const f = fixture(t);
  const [one, two] = await Promise.all([f.provider.exchangeRefreshToken(client, f.refresh), f.provider.exchangeRefreshToken(client, f.refresh)]);
  assert.deepEqual(one, two);
  assert.notEqual(one.refresh_token, f.refresh);
  const disk = readFileSync(f.path, "utf8");
  assert(!disk.includes(one.access_token));
  assert(!disk.includes(one.refresh_token!));
  assert(!disk.includes(hash(f.refresh)));
  assert.equal(statSync(f.path).mode & 0o777, 0o600);
  assert.equal((await f.provider.verifyAccessToken(one.access_token)).clientId, client.client_id);
});

test("only the same client can retry, with a fixed 30 second limit", async (t) => {
  const f = fixture(t);
  await f.provider.exchangeRefreshToken(client, f.refresh);
  await assert.rejects(f.provider.exchangeRefreshToken({ ...client, client_id: "other" }, f.refresh), InvalidGrantError);
  f.advance(29);
  await f.provider.exchangeRefreshToken(client, f.refresh);
  f.advance(1);
  await assert.rejects(f.provider.exchangeRefreshToken(client, f.refresh), InvalidGrantError);
});

test("successor rotation invalidates retries of the previous generation", async (t) => {
  const f = fixture(t);
  const one = await f.provider.exchangeRefreshToken(client, f.refresh);
  await f.provider.exchangeRefreshToken(client, one.refresh_token!);
  await assert.rejects(f.provider.exchangeRefreshToken(client, f.refresh), InvalidGrantError);
});

test("retry cannot outlive the original refresh token", async (t) => {
  const f = fixture(t);
  f.advance(999);
  await f.provider.exchangeRefreshToken(client, f.refresh);
  f.advance(1);
  await assert.rejects(f.provider.exchangeRefreshToken(client, f.refresh), InvalidGrantError);
});

test("successor persists across server restart without accepting spent tokens", async (t) => {
  const f = fixture(t);
  const one = await f.provider.exchangeRefreshToken(client, f.refresh);
  const restarted = new GoogleGatedProvider(cfg, f.options);
  await assert.rejects(restarted.exchangeRefreshToken(client, f.refresh), InvalidGrantError);
  await restarted.exchangeRefreshToken(client, one.refresh_token!);
});

test("revoking the successor also disables the cached retry", async (t) => {
  const f = fixture(t);
  const one = await f.provider.exchangeRefreshToken(client, f.refresh);
  await f.provider.revokeToken(client, { token: one.refresh_token! });
  await assert.rejects(f.provider.exchangeRefreshToken(client, f.refresh), InvalidGrantError);
});

test("invalid refresh yields OAuth invalid_grant HTTP 400 instead of HTTP 500", async (t) => {
  const f = fixture(t);
  const app = express();
  app.use("/token", tokenHandler({ provider: f.provider, rateLimit: false }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => { server.close(); server.closeAllConnections(); });
  const addr = server.address();
  assert(addr && typeof addr !== "string");
  const response = await fetch(`http://127.0.0.1:${addr.port}/token`, {
    method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", client_id: client.client_id, refresh_token: "invalid-synthetic" }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json() as { error: string }).error, "invalid_grant");
});
