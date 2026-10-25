import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectEntry } from "./detect";
import type { SiteMaterial } from "./generate";
import { collectMaterial } from "./material";
import { siteDir, workDir } from "./store";
import type { Runtime } from "./types";
import { extractZip } from "./zip";

export type IngestInput =
  | { kind: "zip"; path: string; slug: string; title: string }
  | { kind: "folder"; path: string; slug: string; title: string }
  | { kind: "local"; path: string; slug: string; title: string }
  | { kind: "remote"; url: string; slug: string; title: string };

export interface IngestResult {
  runtime: Runtime;
  sourceLabel: string;
  material: SiteMaterial;
  /** 入口 HTML 所在目录（static 时就是托管目录） */
  entryDir: string;
}

const COPY_SKIP = /[\\/](node_modules|\.git|\.next|\.cache)[\\/]?/;

async function copyTree(from: string, to: string): Promise<void> {
  await cp(from, to, {
    recursive: true,
    filter: (src) => !COPY_SKIP.test(src),
  });
}

/** zip 里如果只有一层顶层目录，就用那层作为根 */
async function unwrapSingleFolder(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  const visible = entries.filter((e) => !e.name.startsWith("__MACOSX"));
  if (visible.length === 1 && visible[0].isDirectory()) return join(dir, visible[0].name);
  return dir;
}

function describeTree(tree: string[]): string {
  return tree.length ? tree.slice(0, 20).join("、") : "（空目录）";
}

/* ------------------------------ 远程镜像 ------------------------------ */

const MAX_MIRROR_FILES = 60;
const MAX_MIRROR_BYTES = 20 * 1024 * 1024;

function assetUrls(html: string, base: string): string[] {
  const urls = new Set<string>();
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("data:") || raw.startsWith("#")) continue;
    try {
      const absolute = new URL(raw, base);
      if (absolute.origin === new URL(base).origin) urls.add(absolute.href);
    } catch {
      // 不是合法 URL
    }
  }
  return [...urls];
}

function localPathFor(dest: string, url: string, base: string): string {
  const u = new URL(url);
  const baseUrl = new URL(base);
  let pathname = decodeURIComponent(u.pathname);
  if (!pathname || pathname === "/") pathname = "/index.html";
  if (pathname.endsWith("/")) pathname += "index.html";
  void baseUrl;
  const safe = pathname.replace(/^\/+/, "").split("/").filter((p) => p && p !== "..").join("\\");
  return join(dest, safe);
}

/** 抓一份线上静态站点到本地；被 X-Frame-Options / CSP 拒绝时返回 wasMirrored:false */
export async function mirrorRemote(
  url: string,
  dest: string,
): Promise<{ wasMirrored: boolean; reason?: string }> {
  let page: Response;
  try {
    page = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch (error) {
    return { wasMirrored: false, reason: `抓不到页面：${(error as Error).message}` };
  }

  const xfo = page.headers.get("x-frame-options")?.toLowerCase() ?? "";
  const csp = page.headers.get("content-security-policy")?.toLowerCase() ?? "";
  if (xfo.includes("deny") || xfo.includes("sameorigin") || csp.includes("frame-ancestors")) {
    return { wasMirrored: false, reason: "对方不允许被内嵌（X-Frame-Options / CSP）" };
  }
  if (!page.ok) return { wasMirrored: false, reason: `对方返回 ${page.status}` };

  const html = await page.text();
  await mkdir(dest, { recursive: true });
  await writeFile(join(dest, "index.html"), html, "utf8");

  let bytes = html.length;
  let files = 0;
  for (const asset of assetUrls(html, url)) {
    if (files >= MAX_MIRROR_FILES || bytes >= MAX_MIRROR_BYTES) break;
    try {
      const res = await fetch(asset, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (bytes + buf.length > MAX_MIRROR_BYTES) break;
      bytes += buf.length;
      files += 1;
      const target = localPathFor(dest, asset, url);
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, buf);
    } catch {
      // 单个资源失败就算了
    }
  }

  return { wasMirrored: true };
}

/* -------------------------------- 主流程 -------------------------------- */

export async function ingest(input: IngestInput): Promise<IngestResult> {
  const dest = siteDir(input.slug);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await mkdir(workDir(), { recursive: true });

  if (input.kind === "remote") {
    const result = await mirrorRemote(input.url, dest);
    if (!result.wasMirrored) {
      return {
        runtime: { kind: "remote", url: input.url, mirrored: false },
        sourceLabel: input.url,
        material: {
          headings: [],
          text: result.reason ?? "",
          files: [],
          readme: "",
        },
        entryDir: dest,
      };
    }
    const entry = await detectEntry(dest);
    const entryDir = entry.mode === "static" ? entry.dir : dest;
    return {
      runtime: { kind: "static", dir: entryDir },
      sourceLabel: input.url,
      material: await collectMaterial(entryDir),
      entryDir,
    };
  }

  if (input.kind === "zip") {
    await extractZip(await readFile(input.path), dest);
  } else if (input.kind === "folder") {
    await copyTree(input.path, dest);
  } else {
    // 本机路径：先看原目录，能跑进程就直接用原目录（依赖都在，不复制）
    const localDetect = await detectEntry(input.path);
    if (localDetect.mode === "process") {
      return {
        runtime: { kind: "process", cwd: input.path, start: localDetect.start! },
        sourceLabel: input.path,
        material: await collectMaterial(input.path),
        entryDir: input.path,
      };
    }
    if (localDetect.mode === "static") {
      await copyTree(localDetect.dir, dest);
    } else {
      await copyTree(input.path, dest);
    }
  }

  const root = input.kind === "zip" ? await unwrapSingleFolder(dest) : dest;
  const detection = await detectEntry(root);

  if (detection.mode === "none") {
    throw new Error(
      `没有找到可以托管的入口（index.html / dist / build / public / out），也没有可运行的 start 脚本。目录里现在有：${describeTree(
        detection.tree,
      )}`,
    );
  }

  if (detection.mode === "process") {
    return {
      runtime: { kind: "process", cwd: root, start: detection.start! },
      sourceLabel: input.kind === "zip" ? "zip 上传" : "文件夹上传",
      material: await collectMaterial(root),
      entryDir: root,
    };
  }

  const entryDir = detection.dir;
  const label =
    input.kind === "zip" ? "zip 上传" : input.kind === "local" ? input.path : "文件夹上传";
  return {
    runtime: { kind: "static", dir: entryDir },
    sourceLabel: label,
    material: await collectMaterial(entryDir),
    entryDir,
  };
}
