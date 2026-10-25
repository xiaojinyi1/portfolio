import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocatePort } from "@/lib/runtime/ports";
import { Manager } from "@/lib/runtime/manager";

test("内嵌预览：进程起来后能访问，停掉后端口关闭", async () => {
  const dir = mkdtempSync(join(tmpdir(), "site-"));
  const port = await allocatePort(4390);
  writeFileSync(join(dir, "index.html"), "hello-portfolio");
  writeFileSync(
    join(dir, "server.cjs"),
    `require('http').createServer((_q,r)=>r.end('hello-portfolio')).listen(${port},'127.0.0.1')\n`,
  );

  const proj = {
    slug: "t1",
    title: "T",
    date: "",
    intro: [],
    facts: { time: "", role: "", stack: "", status: "" },
    images: [],
    runtime: {
      kind: "process" as const,
      cwd: dir,
      start: `"${process.execPath}" server.cjs`,
    },
    port,
    sourceLabel: "test",
    published: true,
    createdAt: "",
    order: 0,
  };

  // 用真实的子进程启动器（不做注入）：这条测试要覆盖的就是"真起一个进程"。
  const m = new Manager();

  await m.ensure(proj);
  const res = await fetch(`http://127.0.0.1:${proj.port}/`);
  assert.equal(await res.text(), "hello-portfolio");

  m.stop(proj);
  await new Promise((r) => setTimeout(r, 800));
  await assert.rejects(fetch(`http://127.0.0.1:${proj.port}/`));
});
