import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isHosted,
  mediaKey,
  readProjects,
  writeProjects,
  upsertProject,
  getProject,
  removeProject,
  siteDir,
} from "@/lib/store";
import type { Project } from "@/lib/types";

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "pf-"));
  process.env.PORTFOLIO_DATA_DIR = join(root, "content");
  process.env.PORTFOLIO_WORK_DIR = join(root, "work");
  process.env.PORTFOLIO_PUBLIC_DIR = join(root, "public");
  delete process.env.VERCEL;
});

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: "a",
    title: "A",
    date: "2025.06",
    intro: [],
    facts: { time: "", role: "", stack: "", status: "" },
    images: [],
    runtime: { kind: "remote", url: "https://x.test", mirrored: false },
    sourceLabel: "静态网址",
    published: false,
    createdAt: new Date().toISOString(),
    order: 1,
    ...overrides,
  };
}

test("读写往返并保持顺序", async () => {
  assert.deepEqual(await readProjects(), []);
  await upsertProject(makeProject());
  assert.equal((await getProject("a"))?.title, "A");
  await upsertProject(makeProject({ slug: "b", title: "B", order: 2 }));
  assert.deepEqual((await readProjects()).map((p) => p.slug), ["a", "b"]);
  await writeProjects([]);
  assert.deepEqual(await readProjects(), []);
});

test("upsert 更新同 slug 不产生重复", async () => {
  await upsertProject(makeProject());
  await upsertProject(makeProject({ title: "A2" }));
  const all = await readProjects();
  assert.equal(all.length, 1);
  assert.equal(all[0].title, "A2");
});

test("removeProject 删掉对应项，siteDir 落在运行目录下", async () => {
  await upsertProject(makeProject());
  await removeProject("a");
  assert.deepEqual(await readProjects(), []);
  assert.equal(siteDir("a"), join(process.env.PORTFOLIO_WORK_DIR!, "sites", "a"));
});

test("内容、运行、静态三个目录互不重叠", () => {
  const data = process.env.PORTFOLIO_DATA_DIR!;
  const work = process.env.PORTFOLIO_WORK_DIR!;
  const pub = process.env.PORTFOLIO_PUBLIC_DIR!;
  assert.notEqual(data, work);
  assert.ok(!siteDir("a").startsWith(data), "站点副本不该落在要提交的内容目录里");
  assert.ok(siteDir("a").startsWith(work));
  assert.ok(pub.length > 0);
});

test("中文 slug 的图片目录用哈希，英文 slug 原样", () => {
  assert.equal(mediaKey("food-rank"), "food-rank");
  const key = mediaKey("校门口美食实时榜单");
  assert.match(key, /^p-[0-9a-f]{10}$/);
  assert.equal(key, mediaKey("校门口美食实时榜单"), "同一 slug 每次都要得到同一个目录");
});

test("VERCEL 环境下视为线上：后台与预热都要关掉", () => {
  assert.equal(isHosted(), false);
  process.env.VERCEL = "1";
  assert.equal(isHosted(), true);
  delete process.env.VERCEL;
});
