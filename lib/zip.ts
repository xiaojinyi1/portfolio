import AdmZip from "adm-zip";
import { mkdir } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

export interface ZipResult {
  files: number;
  bytes: number;
}

/**
 * 条目名是否安全：拒绝绝对路径、盘符、任何 `..` 段、空名。
 * 只要有一个不安全，整包都不解（先校验后落盘），避免半解压状态。
 */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.trim() === "") return false;
  const unified = name.replace(/\\/g, "/");
  if (unified.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(unified)) return false;
  const segments = unified.split("/");
  if (segments.some((segment) => segment === "..")) return false;
  const resolved = normalize(join("root", unified));
  if (!resolved.startsWith(`root${sep}`) && resolved !== "root") return false;
  return true;
}

export async function extractZip(buf: Buffer, destDir: string): Promise<ZipResult> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buf);
  } catch {
    throw new Error("压缩包读不出来，可能不是有效的 zip");
  }

  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);

  for (const entry of entries) {
    if (!isSafeEntryName(entry.entryName)) {
      throw new Error(`压缩包里有不安全路径：${entry.entryName}`);
    }
  }

  let bytes = 0;
  for (const entry of entries) {
    zip.extractEntryTo(entry, destDir, true, true);
    bytes += entry.header.size;
  }

  return { files: entries.length, bytes };
}
