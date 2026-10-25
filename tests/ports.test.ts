import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { allocatePort, isPortFree } from "@/lib/runtime/ports";

test("被占用的端口会被跳过", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(4300, "127.0.0.1", () => resolve()));
  try {
    assert.equal(await isPortFree(4300), false);
    const port = await allocatePort(4300);
    assert.notEqual(port, 4300);
    assert.ok(port > 4300 && port < 4500);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("taken 里的端口也会跳过", async () => {
  const port = await allocatePort(4300, new Set([4300]));
  assert.notEqual(port, 4300);
});

test("端口全被占时抛错", async () => {
  const taken = new Set<number>();
  for (let p = 4400; p < 4403; p += 1) taken.add(p);
  await assert.rejects(allocatePort(4400, taken, 3), /端口/);
});
