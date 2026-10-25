import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { extractZip, isSafeEntryName } from "@/lib/zip";

function zipWith(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, body] of Object.entries(entries)) {
    // adm-zip 的 addFile 会清洗路径，恶意条目名只能加完再改回去
    const entry = zip.addFile(name.replace(/^[./]+/, "") || "tmp", Buffer.from(body));
    entry.entryName = name;
  }
  return zip.toBuffer();
}

test("正常 zip 解出文件且内容一致", async () => {
  const dest = mkdtempSync(join(tmpdir(), "zip-"));
  const buf = zipWith({ "index.html": "<h1>作品</h1>", "assets/a.png": "x" });
  const result = await extractZip(buf, dest);
  assert.equal(result.files, 2);
  assert.equal(readFileSync(join(dest, "index.html"), "utf8"), "<h1>作品</h1>");
  assert.ok(existsSync(join(dest, "assets", "a.png")));
});

test("zip-slip：../evil.txt 被拒且不落盘", async () => {
  const dest = mkdtempSync(join(tmpdir(), "zip-"));
  const buf = zipWith({ "../evil.txt": "pwned", "index.html": "ok" });
  await assert.rejects(
    () => extractZip(buf, dest),
    /不安全路径/,
  );
  assert.equal(existsSync(join(dest, "index.html")), false, "校验失败时不该写任何文件");
  assert.equal(existsSync(join(dest, "..", "evil.txt")), false);
});

test("绝对路径条目被拒", async () => {
  const dest = mkdtempSync(join(tmpdir(), "zip-"));
  await assert.rejects(() => extractZip(zipWith({ "/abs.txt": "x" }), dest), /不安全路径/);
});

test("中文名条目正常解出", async () => {
  const dest = mkdtempSync(join(tmpdir(), "zip-"));
  await extractZip(zipWith({ "图片/封面.png": "png" }), dest);
  assert.ok(existsSync(join(dest, "图片", "封面.png")));
});

test("isSafeEntryName 判断", () => {
  assert.equal(isSafeEntryName("a/b.png"), true);
  assert.equal(isSafeEntryName("../a.png"), false);
  assert.equal(isSafeEntryName("a/../../b.png"), false);
  assert.equal(isSafeEntryName("C:/x/a.png"), false);
  assert.equal(isSafeEntryName("/a.png"), false);
  assert.equal(isSafeEntryName(""), false);
});
