import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocatePort } from "@/lib/runtime/ports";
import { startStaticServer } from "@/lib/runtime/static-server";
import { screenshot } from "../scripts/shot.mjs";

const SANDBOX_DENIED = /拒绝访问|Access is denied|EPERM|0x5/;

test("能用无头浏览器截一张本地页面的图", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "shot-"));
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;background:#0b0d10;color:#e8e8ea;font:600 64px serif;display:grid;place-items:center">作品集</body>`,
  );

  const port = await allocatePort(4700);
  const server = await startStaticServer(dir, port);
  const out = join(dir, "shot.png");

  try {
    await screenshot(`http://127.0.0.1:${port}/`, out);
  } catch (error) {
    const message = (error as Error).message;
    // 开发沙箱会拦住浏览器的进程创建（crashpad OpenProcess 被拒）；
    // 正常终端里 `npm test` 会真的跑这条断言。
    if (SANDBOX_DENIED.test(message)) {
      t.skip(`当前沙箱不允许启动浏览器：${message}`);
      return;
    }
    throw error;
  } finally {
    server.close();
  }

  const size = statSync(out).size;
  assert.ok(size > 1000, `截图太小：${size} 字节`);
});
