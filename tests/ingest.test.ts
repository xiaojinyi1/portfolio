import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "@/lib/ingest";

test("文件夹导入：拷到运行目录，识别为 static，材料里抓到标题与正文", async () => {
  const root = mkdtempSync(join(tmpdir(), "ing-"));
  process.env.PORTFOLIO_DATA_DIR = join(root, "content");
  process.env.PORTFOLIO_WORK_DIR = join(root, "work");
  process.env.PORTFOLIO_PUBLIC_DIR = join(root, "public");

  const src = join(root, "src");
  mkdirSync(src, { recursive: true });
  writeFileSync(
    join(src, "index.html"),
    "<html><head><title>榜单</title></head><body><h1>美食榜单</h1><p>按人气和评分排序，能看到附近餐厅的排队情况。</p></body></html>",
  );

  const result = await ingest({ kind: "folder", path: src, slug: "t1", title: "测试项目" });

  assert.equal(result.runtime.kind, "static");
  assert.ok(existsSync(join(root, "work", "sites", "t1", "index.html")));
  assert.ok(!existsSync(join(root, "content", "sites", "t1")), "站点副本不该写进内容目录");
  assert.ok(result.material.headings.includes("美食榜单"));
  assert.match(result.material.text, /附近餐厅/);
});

test("找不到入口时抛错并带上目录树", async () => {
  const root = mkdtempSync(join(tmpdir(), "ing-"));
  process.env.PORTFOLIO_DATA_DIR = join(root, "content");
  process.env.PORTFOLIO_WORK_DIR = join(root, "work");
  process.env.PORTFOLIO_PUBLIC_DIR = join(root, "public");
  const src = join(root, "empty");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "notes.txt"), "x");

  await assert.rejects(
    ingest({ kind: "folder", path: src, slug: "t2", title: "空" }),
    /没有找到可以托管的入口/,
  );
});
