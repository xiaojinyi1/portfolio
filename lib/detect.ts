import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache"]);

export interface EntryDetection {
  mode: "static" | "process" | "none";
  /** static 模式下要托管的目录（绝对路径）；其它模式为 root */
  dir: string;
  /** process 模式下要执行的命令 */
  start?: string;
  /** 目录树（相对路径，最多 40 条），报错时给人看 */
  tree: string[];
}

const ENTRY_CANDIDATES = [
  "index.html",
  "dist/index.html",
  "build/index.html",
  "public/index.html",
  "out/index.html",
];

export async function findStaticEntry(root: string): Promise<string | null> {
  for (const candidate of ENTRY_CANDIDATES) {
    const full = join(root, candidate);
    try {
      const info = await stat(full);
      if (info.isFile()) return join(root, candidate.replace(/\/?index\.html$/, "") || ".");
    } catch {
      // 继续找下一个
    }
  }
  return null;
}

export async function readStartScript(root: string): Promise<string | null> {
  try {
    const raw = await readFile(join(root, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
    return scripts.start ?? scripts.dev ?? scripts.serve ?? null;
  } catch {
    return null;
  }
}

export async function listTree(root: string, max = 40): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, depth: number) {
    if (out.length >= max || depth > 2) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()));
    for (const entry of entries) {
      if (out.length >= max) return;
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      const full = join(dir, entry.name);
      const rel = full.slice(root.length + 1).split("\\").join("/");
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        out.push(`${rel}/`);
        await walk(full, depth + 1);
      } else {
        out.push(rel);
      }
    }
  }
  await walk(root, 0);
  return out;
}

export async function detectEntry(root: string): Promise<EntryDetection> {
  const tree = await listTree(root);
  const staticDir = await findStaticEntry(root);
  if (staticDir) {
    return { mode: "static", dir: staticDir, tree };
  }
  const start = await readStartScript(root);
  if (start) {
    return { mode: "process", dir: root, start, tree };
  }
  return { mode: "none", dir: root, tree };
}
