import { test } from "node:test";
import assert from "node:assert/strict";
import { toSlug } from "@/lib/slug";

test("toSlug 保留中文并压掉空格", () => {
  assert.equal(toSlug("实时美食榜单 Demo"), "实时美食榜单-demo");
});
