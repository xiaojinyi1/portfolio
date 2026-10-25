import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface ImageCandidate {
  /** 相对 root 的 posix 路径，如 assets/cover.png */
  src: string;
  bytes: number;
}

const EXTS = /\.(png|jpe?g|webp|avif|gif)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache", "out"]);

/** 扫出站点里的图片候选，按体积从大到小（体积大通常更像主视觉） */
export async function scanImages(root: string, limit = 12): Promise<ImageCandidate[]> {
  const found: ImageCandidate[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > 6) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // 目录不存在或没权限：当空处理，扫描不该让上传失败
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!EXTS.test(entry.name)) continue;
      try {
        const info = await stat(full);
        found.push({
          src: full.slice(root.length + 1).split("\\").join("/"),
          bytes: info.size,
        });
      } catch {
        // 取不到大小就跳过
      }
    }
  }

  await walk(root, 0);
  found.sort((a, b) => b.bytes - a.bytes || a.src.localeCompare(b.src));
  return found.slice(0, limit);
}
