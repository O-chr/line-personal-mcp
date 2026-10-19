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

Env: `LINE_MCP_PUBLIC_URL` (https URL of the tunnel), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LINE_MCP_ALLOWED_EMAIL`, optional `PORT` (8787), `LINE_MCP_PERMISSIONS` (keep `read` at first).
Google Cloud OAuth client (Web): authorized redirect URI = `<PUBLIC_URL>/oauth/google/callback`.
Expose with Cloudflare Tunnel to 127.0.0.1:8787, then add `<PUBLIC_URL>/mcp` as a ChatGPT custom connector (OAuth).
