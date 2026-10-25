import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateDraft } from "./generate";
import { scanImages } from "./images";
import { ingest } from "./ingest";
import { toSlug, uniqueSlug } from "./slug";
import { dataDir, readProjects, upsertProject } from "./store";
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

/** 图片从 data/sites 里出，走 /media/<slug>/<path> 路由喂给页面 */
export function mediaUrl(slug: string, src: string): string {
  return `/media/${encodeURIComponent(slug)}/${src.split("/").map(encodeURIComponent).join("/")}`;
}

export async function importSource(input: ImportInput): Promise<ImportResult> {
  const warnings: string[] = [];
  const existing = await readProjects();
  const slug = uniqueSlug(toSlug(input.title), existing.map((p) => p.slug));
  const note = (input.note ?? "").trim();

  let ingested;
  if (input.kind === "zip") {
    const tmpDir = join(dataDir(), "tmp");
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

  const images: ProjectImage[] = (await scanImages(ingested.entryDir, 3)).map((candidate) => ({
    src: mediaUrl(slug, candidate.src),
    caption: "",
    alt: input.title,
  }));
  if (images.length === 0) warnings.push("没在站点里找到图片，详情页会只显示文字");

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
