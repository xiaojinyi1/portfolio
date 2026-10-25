import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProjects, writeProjects, upsertProject, getProject, removeProject, siteDir } from "@/lib/store";
import type { Project } from "@/lib/types";

beforeEach(() => {
  process.env.PORTFOLIO_DATA_DIR = mkdtempSync(join(tmpdir(), "pf-"));
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

test("removeProject 删掉对应项，siteDir 落在 data/sites 下", async () => {
  await upsertProject(makeProject());
  await removeProject("a");
  assert.deepEqual(await readProjects(), []);
  assert.equal(siteDir("a"), join(process.env.PORTFOLIO_DATA_DIR!, "sites", "a"));
});
