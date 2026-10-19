#!/usr/bin/env node
// Owner-only helper (run in a terminal, not exposed over MCP): manage per-chat permissions.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CONFIG_PATH, loadConfig, isValidChatId } from "./policy.js";
import { runLine } from "./line.js";

const [cmd, id, perms] = process.argv.slice(2);
const cfg = loadConfig();
const save = () => { mkdirSync(dirname(CONFIG_PATH), { recursive: true }); writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 }); };

if (cmd === "chats") {
  const r = await runLine(["chats", "--json", "--details", "--limit", "50"]);
  for (const c of JSON.parse(r.stdout).chats) console.log(`${c.id}\t${c.name}`);
} else if (cmd === "show") {
  console.log(JSON.stringify(cfg, null, 2));
} else if ((cmd === "allow" || cmd === "deny") && id && isValidChatId(id)) {
  if (cmd === "deny") delete cfg.chats[id];
  else {
    const set = new Set((perms ?? "read").split(","));
    const r = await runLine(["chats", "--json", "--details"]);
    const name = JSON.parse(r.stdout).chats.find((c: { id: string }) => c.id === id)?.name ?? "";
    cfg.chats[id] = { name, read: set.has("read"), write: set.has("write") };
  }
  save(); console.log("saved", CONFIG_PATH);
} else {
  console.log("usage: admin chats | show | allow <chat_id> [read,write] | deny <chat_id>");
}
