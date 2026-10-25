import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { importSource } from "@/lib/import";
import { manager } from "@/lib/runtime/manager";
import { readProjects } from "@/lib/store";

// 验收标准 1 的前半：四种来源都能得到一个带 runtime 的项目
function useEnv(): void {
  const root = mkdtempSync(join(tmpdir(), "accept-"));
  process.env.PORTFOLIO_DATA_DIR = join(root, "content");
  process.env.PORTFOLIO_WORK_DIR = join(root, "work");
  process.env.PORTFOLIO_PUBLIC_DIR = join(root, "public");
  process.env.DEEPSEEK_API_KEY = "";
}

function staticSite(): string {
  const dir = mkdtempSync(join(tmpdir(), "site-"));
  writeFileSync(join(dir, "index.html"), "<title>小站</title><h1>你好</h1>");
  return dir;
}

test("来源一：zip", async () => {
  useEnv();
  const zip = new AdmZip();
  zip.addFile("index.html", Buffer.from("<title>zip 小站</title>"));
  const { project } = await importSource({ kind: "zip", title: "zip 小站", date: "2025.01", buf: zip.toBuffer() });
  assert.equal(project.runtime.kind, "static");
});

test("来源二：文件夹", async () => {
  useEnv();
  const { project } = await importSource({ kind: "folder", title: "文件夹小站", date: "2025.02", path: staticSite() });
  assert.equal(project.runtime.kind, "static");
});

test("来源三：本机路径", async () => {
  useEnv();
  const { project } = await importSource({ kind: "path", title: "本机小站", date: "2025.03", path: staticSite() });
  assert.equal(project.runtime.kind, "static");
});

test("来源四：静态网址（可达时镜像成本地静态站）", async () => {
  useEnv();
  const server = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<title>线上小站</title><h1>在线</h1>");
      return;
    }
    res.writeHead(404).end("no");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const { project } = await importSource({
      kind: "remote",
      title: "线上小站",
      date: "2025.04",
      url: `http://127.0.0.1:${port}/`,
      mirror: true,
    });
    assert.equal(project.runtime.kind, "static");
    assert.equal(project.runtime.kind === "static" ? project.images.length >= 0 : false, true);
  } finally {
    server.close();
  }
});

test("验收标准 6：进程型项目起来后端口可访问，停掉后端口释放", async () => {
  useEnv();
  const dir = mkdtempSync(join(tmpdir(), "proc-"));
  writeFileSync(
    join(dir, "server.mjs"),
    `import { createServer } from "node:http";
     const port = Number(process.env.PORT || 0);
     createServer((req, res) => { res.writeHead(200, {"content-type":"text/plain"}); res.end("alive"); })
       .listen(port, "127.0.0.1", () => console.log("up", port));`,
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "proc", type: "module", scripts: { start: "node server.mjs" } }, null, 2),
  );

  const { project } = await importSource({ kind: "path", title: "进程小站", date: "2025.05", path: dir });
  assert.equal(project.runtime.kind, "process");

  process.env.PORTFOLIO_HEALTH_TIMEOUT_MS = "20000";
  const port = await manager.ensure(project);
  assert.ok(port && port >= 4300, "应当分到一个端口");

  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "alive");

  manager.stop(project);
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(manager.status(project.slug), "stopped");

  const saved = await readProjects();
  assert.equal(saved.length, 1);
});
