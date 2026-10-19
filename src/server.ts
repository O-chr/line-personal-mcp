import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { allowed, loadConfig, toolPerms } from "./policy.js";
import { runLine } from "./line.js";


export function buildServer(): McpServer {
  const tools = toolPerms();
  const server = new McpServer({ name: "line-personal-mcp", version: "0.1.0" });
  const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });
  const denied = (perm: string) => text(`Denied: this chat is not allowed for ${perm}. Permissions are managed by the owner outside MCP.`, true);

  server.registerTool("line_status", {
    description: "Show LINE login state and which MCP permissions (read/write) are enabled.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const r = await runLine(["auth", "status"]);
    return text(`mcp_permissions: ${[...tools].join(",") || "none"}\n${r.stdout.trim() || r.stderr.trim()}`);
  });

  server.registerTool("line_list_chats", {
    description: "List the chats the owner has allowed for this MCP, with their read/write permission. Other chats are never shown.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const cfg = loadConfig();
    const rows = Object.entries(cfg.chats).map(([id, r]) => ({
      id, name: r.name ?? "",
      read: allowed("read", id, cfg, tools), write: allowed("write", id, cfg, tools),
    })).filter((r) => r.read || r.write);
    return text(JSON.stringify(rows, null, 2));
  });

  if (tools.has("read")) server.registerTool("line_read_messages", {
    description: "Read recent messages from an allowed chat (by chat id from line_list_chats).",
    inputSchema: { chat_id: z.string(), limit: z.number().int().min(1).max(50).default(20) },
    annotations: { readOnlyHint: true },
  }, async ({ chat_id, limit }) => {
    if (!allowed("read", chat_id, loadConfig(), tools)) return denied("read");
    const r = await runLine(["messages", chat_id, "--json", "--details", "--resolve-names", "--limit", String(limit), "--timeout", "30s"]);
    return r.code === 0 ? text(r.stdout) : text(r.stderr || `line exited with ${r.code}`, true);
  });

  if (tools.has("write")) server.registerTool("line_send_message", {
    description: "Send a text message to an allowed chat. The owner is asked to confirm each send.",
    inputSchema: { chat_id: z.string(), text: z.string().min(1).max(2000) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ chat_id, text: body }) => {
    const cfg = loadConfig();
    if (!allowed("write", chat_id, cfg, tools)) return denied("write");
    if (cfg.confirm_send) {
      if (!server.server.getClientCapabilities()?.elicitation) return text("Denied: confirm_send is on but the client cannot ask for confirmation.", true);
      const name = cfg.chats[chat_id]?.name || chat_id;
      const res = await server.server.elicitInput({
        message: `LINEに送信しますか？\n宛先: ${name}\n本文:\n${body}`,
        requestedSchema: { type: "object", properties: { approve: { type: "boolean", title: "送信する" } }, required: ["approve"] },
      });
      if (res.action !== "accept" || res.content?.approve !== true) return text("Not sent: owner declined.", true);
    }
    // Plaintext fallback (--allow-plaintext) is intentionally never passed.
    const r = await runLine(["send", chat_id, "--stdin", "--json", "--timeout", "30s"], body);
    return r.code === 0 ? text(r.stdout || "sent") : text(r.stderr || `line exited with ${r.code}`, true);
  });
  return server;
}
