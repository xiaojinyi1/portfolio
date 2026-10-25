import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { importSource } from "@/lib/import";
import { readProjects } from "@/lib/store";

// 共用进程里环境变量会互相污染：每条测试开头重设
function freshData(): void {
  const root = mkdtempSync(join(tmpdir(), "import-"));
  process.env.PORTFOLIO_DATA_DIR = join(root, "content");
  process.env.PORTFOLIO_WORK_DIR = join(root, "work");
  process.env.PORTFOLIO_PUBLIC_DIR = join(root, "public");
  process.env.DEEPSEEK_API_KEY = "";
}

function zipBuf(): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "index.html",
    Buffer.from("<!doctype html><title>美食榜单</title><h1>校门口吃什么</h1><p>实时更新的小榜单</p>"),
  );
  zip.addFile("assets/cover.png", Buffer.alloc(2048));
  return zip.toBuffer();
}

test("zip 导入：识别 static、扫到图、无 key 时留空介绍并警告", async () => {
  freshData();
  const { project, warnings } = await importSource({
    kind: "zip",
    title: "实时美食榜单",
    date: "2025.06",
    buf: zipBuf(),
  });

  assert.equal(project.runtime.kind, "static");
  assert.equal(project.published, false);
  assert.equal(project.images.length, 1);
  assert.equal(project.images[0].caption, "");
  assert.equal(project.images[0].alt, "实时美食榜单");
  assert.deepEqual(project.intro, []);
  assert.ok(warnings.some((w) => w.includes("DEEPSEEK_API_KEY")));

  const saved = await readProjects();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].slug, project.slug);
});

test("同名标题导入两次 → slug 自动加序号", async () => {
  freshData();
  const first = await importSource({ kind: "zip", title: "读书笔记", date: "2025.03", buf: zipBuf() });
  const second = await importSource({ kind: "zip", title: "读书笔记", date: "2025.03", buf: zipBuf() });
  assert.notEqual(first.project.slug, second.project.slug);
  assert.match(second.project.slug, /-2$/);
});

test("文件夹导入并带上备注", async () => {
  freshData();
  const dir = mkdtempSync(join(tmpdir(), "folder-"));
  writeFileSync(join(dir, "index.html"), "<title>相册</title><h1>照片墙</h1>");
  mkdirSync(join(dir, "img"));
  writeFileSync(join(dir, "img", "a.jpg"), Buffer.alloc(500));

  const { project } = await importSource({
    kind: "folder",
    title: "照片墙",
    date: "2024.11",
    note: "最难的是图片多的时候滚动卡",
    path: dir,
  });

  assert.equal(project.note, "最难的是图片多的时候滚动卡");
  assert.equal(project.runtime.kind, "static");
  assert.equal(project.facts.time, "2024.11");
  assert.equal(project.facts.role, "");
});
