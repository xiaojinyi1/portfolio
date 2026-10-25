import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectEntry, listTree } from "@/lib/detect";

const mk = () => mkdtempSync(join(tmpdir(), "det-"));

test("根目录有 index.html → static", async () => {
  const d = mk();
  writeFileSync(join(d, "index.html"), "<h1>hi</h1>");
  assert.equal((await detectEntry(d)).mode, "static");
});

test("只有 dist/index.html → static 且 dir 指到 dist", async () => {
  const d = mk();
  mkdirSync(join(d, "dist"));
  writeFileSync(join(d, "dist/index.html"), "x");
  const r = await detectEntry(d);
  assert.equal(r.mode, "static");
  assert.equal(r.dir, join(d, "dist"));
});

test("有 start 脚本无 index → process 且带 start", async () => {
  const d = mk();
  writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { start: "node server.mjs" } }));
  const r = await detectEntry(d);
  assert.equal(r.mode, "process");
  assert.equal(r.start, "node server.mjs");
});

test("两者都没有 → none 且 tree 非空", async () => {
  const d = mk();
  writeFileSync(join(d, "readme.md"), "x");
  const r = await detectEntry(d);
  assert.equal(r.mode, "none");
  assert.ok(r.tree.length > 0);
});

test("listTree 跳过 node_modules 且限制条数", async () => {
  const d = mk();
  mkdirSync(join(d, "node_modules", "a"), { recursive: true });
  writeFileSync(join(d, "node_modules", "a", "x.js"), "");
  mkdirSync(join(d, "src"));
  writeFileSync(join(d, "src", "a.ts"), "");
  const tree = await listTree(d, 10);
  assert.equal(tree.some((p) => p.includes("node_modules")), false);
  assert.ok(tree.some((p) => p.includes("src")));
});
