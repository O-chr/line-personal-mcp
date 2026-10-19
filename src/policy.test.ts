import test from "node:test";
import assert from "node:assert/strict";
import { allowed, toolPerms } from "./policy.js";

const cfg = { confirm_send: true, chats: { c1: { read: true }, c2: { read: true, write: true }, "__proto__x": { write: true } } };
test("default tool perms are read only", () => assert.deepEqual([...toolPerms(undefined)], ["read"]));
test("unknown chat denied", () => assert.equal(allowed("read", "zzz", cfg, toolPerms("read,write")), false));
test("chat read-only blocks write", () => assert.equal(allowed("write", "c1", cfg, toolPerms("read,write")), false));
test("tool perms cap chat perms", () => assert.equal(allowed("write", "c2", cfg, toolPerms("read")), false));
test("both allow", () => assert.equal(allowed("write", "c2", cfg, toolPerms("read,write")), true));
test("invalid ids and prototype keys denied", () => {
  assert.equal(allowed("read", "--help", cfg, toolPerms("read")), false);
  assert.equal(allowed("read", "constructor", cfg, toolPerms("read")), false);
});
