# line-personal-mcp

Personal stdio MCP server over the private `line` CLI (`O-chr/line-cli-private`). Intended to run on the Mac mini.

## Permissions (both must allow; default deny)
1. **Tool level** – env `LINE_MCP_PERMISSIONS` = `read` (default) or `read,write`. The send tool is not even registered without `write`.
2. **Per chat** – `~/.config/line-personal-mcp/config.json`, edited only by the owner via `node dist/admin.js`:
   - `chats` (list all, with ids), `allow <chat_id> [read,write]`, `deny <chat_id>`, `show`
   - Unlisted chats are never readable, writable, or even listed.
- `confirm_send` (default true): each send asks the owner via MCP elicitation; denied if the client can't ask.
- Individuals (IDs starting with `U`) only by default; groups/rooms need `allow <id> --group`. `allow` rejects IDs not in your LINE chat list.
- Sends never use `--allow-plaintext`; chats are addressed by ID only.

## Claude Code
`claude mcp add line -e LINE_MCP_PERMISSIONS=read -- node ~/code/line-personal-mcp/dist/index.js`

Tools: `line_status`, `line_list_chats`, `line_read_messages`, `line_send_message`.

## Remote (ChatGPT) via HTTP + Google sign-in
`node dist/http.js` serves `/mcp` (Streamable HTTP, stateless) on 127.0.0.1 and acts as its own OAuth server (dynamic client registration, PKCE). The login step is delegated to Google, and **only `LINE_MCP_ALLOWED_EMAIL` (verified) can obtain a token**. Access tokens last 1h; refresh tokens rotate (30d). Tokens are stored hashed in `~/.config/line-personal-mcp/oauth.json` (0600).

Env: `LINE_MCP_PUBLIC_URL` (https URL of the tunnel), `LINE_MCP_ALLOWED_EMAIL`, optional `GOOGLE_OAUTH_JSON` (default `~/.config/line-personal-mcp/google-oauth.json`, the client JSON downloaded from Google Cloud, mode 0600), optional `PORT` (8787), `LINE_MCP_PERMISSIONS` (keep `read` at first).
Google Cloud OAuth client (Web): authorized redirect URI = `<PUBLIC_URL>/oauth/google/callback`.
Expose with Cloudflare Tunnel to 127.0.0.1:8787, then add `<PUBLIC_URL>/mcp` as a ChatGPT custom connector (OAuth).

## ChatGPT Chat and Codex use different connection registrations

Adding `line_mcp` to Settings → MCP / `~/.codex/config.toml` connects the local Codex client. A successful `initialize` or `tools/list` from `codex-mcp-client` does not demonstrate that a normal ChatGPT Chat has the tools. ChatGPT needs its own installed plugin and OAuth connection. The existing LINE Official Account plugin is a separate account-backed integration; changing the personal server's HTTP transport or weakening OAuth will not create that registration.

`plugin/line-personal/` is the private ChatGPT plugin source. It points to the existing Streamable HTTP endpoint with OAuth dynamic client registration; it contains no credentials or chat data. Install the private plugin in ChatGPT, connect it using the permitted Google account, and select **個人LINE** with `@` in a new ChatGPT chat. Ask it to call `line_list_chats`. Success means an actual tool result containing only the allowed chats, with `read: true` and `write: false` in the current deployment. A response from Codex alone is insufficient for this check.

Keep `LINE_MCP_PERMISSIONS=read`, the existing allowed Google account, default-deny chat policy, send confirmation, and encrypted-only sending unchanged. Installing a plugin does not grant additional server permissions.

For the investigation, observations, and remaining verification, see [the connection report](docs/chatgpt-connection.md).
