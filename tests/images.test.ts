import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanImages } from "@/lib/images";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "img-"));
  mkdirSync(join(root, "assets"));
  mkdirSync(join(root, "图片"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "assets", "cover.png"), Buffer.alloc(100));
  writeFileSync(join(root, "assets", "small.png"), Buffer.alloc(10));
  writeFileSync(join(root, "图片", "截图.png"), Buffer.alloc(50));
  writeFileSync(join(root, "src", "app.ts"), "export {}");
  return root;
}

test("扫出三张图、按体积降序、含中文路径", async () => {
  const root = fixture();
  const list = await scanImages(root);
  assert.equal(list.length, 3);
  assert.deepEqual(
    list.map((item) => item.src),
    ["assets/cover.png", "图片/截图.png", "assets/small.png"],
  );
  assert.equal(list[0].bytes, 100);
});

test("limit 只返回最大的几张", async () => {
  const root = fixture();
  const list = await scanImages(root, 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].src, "assets/cover.png");
});

test("跳过 node_modules 与非图片文件", async () => {
  const root = fixture();
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(root, "node_modules", "pkg", "big.png"), Buffer.alloc(999));
  const list = await scanImages(root);
  assert.equal(list.some((item) => item.src.includes("node_modules")), false);
  assert.equal(list.every((item) => /\.(png|jpe?g|webp|avif|gif)$/i.test(item.src)), true);
});

test("目录不存在时返回空数组而不是抛错", async () => {
  assert.deepEqual(await scanImages(join(tmpdir(), "no-such-dir-xyz")), []);
});
