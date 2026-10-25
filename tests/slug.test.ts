import { test } from "node:test";
import assert from "node:assert/strict";
import { toSlug, uniqueSlug } from "@/lib/slug";

test("uniqueSlug 冲突追加序号", () => {
  assert.equal(uniqueSlug("work", ["work"]), "work-2");
  assert.equal(uniqueSlug("work", ["work", "work-2"]), "work-3");
});

test("toSlug 去掉标点、压缩连字符", () => {
  assert.equal(toSlug("  Campus   Heat!! "), "campus-heat");
});
