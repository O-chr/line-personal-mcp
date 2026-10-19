import test from "node:test";
import assert from "node:assert/strict";
import { allowed, toolPerms } from "./policy.js";

const cfg = { confirm_send: true, chats: { U1: { read: true, write: true }, C1: { read: true }, C2: { read: true, group: true }, c1: { read: true, group: true }, c2: { read: true, write: true, group: true }, "__proto__x": { write: true } } };
test("default tool perms are read only", () => assert.deepEqual([...toolPerms(undefined)], ["read"]));
test("unknown chat denied", () => assert.equal(allowed("read", "zzz", cfg, toolPerms("read,write")), false));
test("chat read-only blocks write", () => assert.equal(allowed("write", "c1", cfg, toolPerms("read,write")), false));
test("tool perms cap chat perms", () => assert.equal(allowed("write", "c2", cfg, toolPerms("read")), false));
test("both allow", () => assert.equal(allowed("write", "c2", cfg, toolPerms("read,write")), true));
test("invalid ids and prototype keys denied", () => {
  assert.equal(allowed("read", "--help", cfg, toolPerms("read")), false);
  assert.equal(allowed("read", "constructor", cfg, toolPerms("read")), false);
});
test("groups need explicit opt-in; individuals do not", () => {
  const t = toolPerms("read,write");
  assert.equal(allowed("write", "U1", cfg, t), true);
  assert.equal(allowed("read", "C1", cfg, t), false);
  assert.equal(allowed("read", "C2", cfg, t), true);
});
