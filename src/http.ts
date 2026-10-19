#!/usr/bin/env node
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { buildServer } from "./server.js";
import { GoogleGatedProvider } from "./auth.js";

const need = (k: string) => { const v = process.env[k]; if (!v) { console.error(`missing env ${k}`); process.exit(1); } return v; };
const publicUrl = need("LINE_MCP_PUBLIC_URL").replace(/\/$/, ""); // e.g. https://line-mcp.example.com
const provider = new GoogleGatedProvider({
  clientId: need("GOOGLE_CLIENT_ID"), clientSecret: need("GOOGLE_CLIENT_SECRET"),
  publicUrl, allowedEmail: need("LINE_MCP_ALLOWED_EMAIL"),
});

const app = express();
app.set("trust proxy", 1);
app.use(mcpAuthRouter({ provider, issuerUrl: new URL(publicUrl), resourceServerUrl: new URL(`${publicUrl}/mcp`) }));

app.get("/oauth/google/callback", async (req, res) => {
  try {
    const url = await provider.handleGoogleCallback(String(req.query.code ?? ""), String(req.query.state ?? ""));
    res.redirect(url);
  } catch (e) {
    res.status(403).type("text").send(`Denied: ${(e as Error).message}`);
  }
});

const auth = requireBearerAuth({ verifier: provider, resourceMetadataUrl: `${publicUrl}/.well-known/oauth-protected-resource/mcp` });
app.post("/mcp", auth, express.json({ limit: "100kb" }), async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.all("/mcp", auth, (_req, res) => res.status(405).json({ error: "POST only" }));

const port = Number(process.env.PORT ?? 8787);
app.listen(port, "127.0.0.1", () => console.error(`line-personal-mcp listening on 127.0.0.1:${port} (${publicUrl})`));
