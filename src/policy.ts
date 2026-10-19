import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Perm = "read" | "write";
export interface ChatRule { name?: string; read?: boolean; write?: boolean; group?: boolean }
export interface Config { chats: Record<string, ChatRule>; confirm_send: boolean }

export const CONFIG_PATH = process.env.LINE_MCP_CONFIG ?? join(homedir(), ".config", "line-personal-mcp", "config.json");
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidChatId(id: string): boolean { return ID_RE.test(id); }

/** Tool-level permissions, fixed by the MCP client config (env). Default: read only. */
export function toolPerms(env: string | undefined = process.env.LINE_MCP_PERMISSIONS): Set<Perm> {
  const out = new Set<Perm>();
  for (const p of (env ?? "read").split(",").map((s) => s.trim())) if (p === "read" || p === "write") out.add(p);
  return out;
}

export function loadConfig(path = CONFIG_PATH): Config {
  if (!existsSync(path)) return { chats: {}, confirm_send: true };
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return { chats: raw.chats ?? {}, confirm_send: raw.confirm_send !== false };
}

/** Both the tool-level permission and the per-chat permission must allow it. Unknown chats are denied. */
export function allowed(perm: Perm, chatId: string, cfg: Config, tools: Set<Perm>): boolean {
  if (!isValidChatId(chatId) || !tools.has(perm)) return false;
  const rule = Object.hasOwn(cfg.chats, chatId) ? cfg.chats[chatId] : undefined;
  // IDs starting with 'U' are individuals; groups (C) and rooms (R) need an explicit group:true opt-in.
  if (!chatId.startsWith("U") && rule?.group !== true) return false;
  return rule?.[perm] === true;
}
