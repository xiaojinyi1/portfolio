import { access, copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { generateDraft } from "./generate";
import { scanImages } from "./images";
import { ingest } from "./ingest";
import { toSlug, uniqueSlug } from "./slug";
import { mediaDir, mediaKey, readProjects, upsertProject, workDir } from "./store";
import type { Project, ProjectImage } from "./types";

export type ImportInput =
  | { kind: "zip"; title: string; date: string; note?: string; buf: Buffer }
  | { kind: "folder"; title: string; date: string; note?: string; path: string }
  | { kind: "path"; title: string; date: string; note?: string; path: string }
  | { kind: "remote"; title: string; date: string; note?: string; url: string; mirror: boolean };

export interface ImportResult {
  project: Project;
  warnings: string[];
}

/** 图片落在 public/media/<key>/ 下，线上由 CDN 直接出，不经过任何运行时 */
export function mediaUrl(slug: string, src: string): string {
  return `/media/${encodeURIComponent(mediaKey(slug))}/${src.split("/").map(encodeURIComponent).join("/")}`;
}

/** 单张图上限：git 里塞大图会让仓库越来越重，超了就跳过并提示 */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyIntoMedia(slug: string, from: string, relative: string): Promise<string | null> {
  const dir = mediaDir(slug);
  // 保留站点里的相对路径（assets/cover.png 还是 assets/cover.png），只把每段清洗干净
  const wanted = relative
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[^\w.\-]+/g, "_"))
    .join("/");
  const slash = wanted.lastIndexOf("/");
  const prefix = slash < 0 ? "" : wanted.slice(0, slash + 1);
  const base = slash < 0 ? wanted : wanted.slice(slash + 1);
  let final = wanted;
  let suffix = 2;
  while (await exists(join(dir, final))) {
    final = `${prefix}${suffix++}-${base}`;
  }
  const target = join(dir, final);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(from, target);
  return mediaUrl(slug, final);
}

async function collectImages(
  slug: string,
  entryDir: string,
  title: string,
  warnings: string[],
): Promise<ProjectImage[]> {
  const candidates = await scanImages(entryDir, 3);
  const images: ProjectImage[] = [];
  for (const candidate of candidates) {
    const from = join(entryDir, candidate.src);
    const info = await stat(from).catch(() => null);
    if (!info) continue;
    if (info.size > MAX_IMAGE_BYTES) {
      warnings.push(`${candidate.src} 太大了（超过 2MB），没有放进详情页`);
      continue;
    }
    const src = await copyIntoMedia(slug, from, candidate.src);
    if (src) images.push({ src, caption: "", alt: title });
  }
  return images;
}

export async function importSource(input: ImportInput): Promise<ImportResult> {
  const warnings: string[] = [];
  const existing = await readProjects();
  const slug = uniqueSlug(toSlug(input.title), existing.map((p) => p.slug));
  const note = (input.note ?? "").trim();

  let ingested;
  if (input.kind === "zip") {
    const tmpDir = join(workDir(), "tmp");
    await mkdir(tmpDir, { recursive: true });
    const zipPath = join(tmpDir, `${slug}.zip`);
    await writeFile(zipPath, input.buf);
    ingested = await ingest({ kind: "zip", path: zipPath, slug, title: input.title });
  } else if (input.kind === "folder" || input.kind === "path") {
    ingested = await ingest({
      kind: input.kind === "path" ? "local" : "folder",
      path: input.path,
      slug,
      title: input.title,
    });
  } else {
    ingested = await ingest({ kind: "remote", url: input.url, slug, title: input.title });
    if (ingested.runtime.kind === "remote") {
      warnings.push("对方站点不允许被内嵌，已改为直接打开原链接；介绍内容需要手写");
    }
  }

  const images = await collectImages(slug, ingested.entryDir, input.title.trim(), warnings);
  if (images.length === 0) warnings.push("没在站点里找到合适的图片，详情页会只显示文字");

  let intro: string[] = [];
  const facts = { time: input.date, role: "", stack: "", status: "" };

  if (!process.env.DEEPSEEK_API_KEY) {
    warnings.push("未配置 DEEPSEEK_API_KEY，介绍需要手写");
  } else if (ingested.runtime.kind === "remote") {
    warnings.push("作品不是本地托管的，抓不到内容，介绍需要手写");
  } else {
    try {
      const draft = await generateDraft({
        title: input.title,
        material: ingested.material,
        note,
      });
      intro = draft.intro;
      for (const key of ["time", "role", "stack", "status"] as const) {
        if (draft.facts[key]) facts[key] = draft.facts[key];
      }
    } catch (error) {
      warnings.push(`自动生成失败（${(error as Error).message}），介绍需要手写`);
    }
  }

  const project: Project = {
    slug,
    title: input.title.trim(),
    date: input.date,
    intro,
    facts,
    images,
    note: note || undefined,
    runtime: ingested.runtime,
    sourceLabel: ingested.sourceLabel,
    published: false,
    createdAt: new Date().toISOString(),
    order: existing.length,
  };

  await upsertProject(project);
  return { project, warnings };
}
