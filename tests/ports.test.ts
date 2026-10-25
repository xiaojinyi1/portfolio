import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { allocatePort, isPortFree } from "@/lib/runtime/ports";

// 不要用 4300：开发服务器可能正好把演示作品跑在 4300 上
const BASE = 5300;

test("被占用的端口会被跳过", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(BASE, "127.0.0.1", () => resolve()));
  try {
    assert.equal(await isPortFree(BASE), false);
    const port = await allocatePort(BASE);
    assert.notEqual(port, BASE);
    assert.ok(port > BASE && port < BASE + 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("taken 里的端口也会跳过", async () => {
  const port = await allocatePort(BASE, new Set([BASE]));
  assert.notEqual(port, BASE);
});

test("端口全被占时抛错", async () => {
  const taken = new Set<number>();
  for (let p = BASE + 100; p < BASE + 103; p += 1) taken.add(p);
  await assert.rejects(allocatePort(BASE + 100, taken, 3), /端口/);
});
