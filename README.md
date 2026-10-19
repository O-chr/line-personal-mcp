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
