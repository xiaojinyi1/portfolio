import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import bundledProjects from "../content/projects.json" with { type: "json" };
import type { Project } from "./types";

// 不用 import.meta.url：Next 把服务端代码打包后那里拿不到可用的 URL
const ROOT = process.env.PORTFOLIO_ROOT ?? process.cwd();

/**
 * 写作出来的内容目录：默认 <repo>/content，进 git。
 * 线上构建就是从这份文件读数据，所以它必须在仓库里，不能放在运行目录。
 */
export function dataDir(): string {
  return process.env.PORTFOLIO_DATA_DIR ?? join(ROOT, "content");
}

/**
 * 只在本地用的运行目录：站点副本、日志、临时解压。默认 <repo>/data，不进 git。
 * 线上没有这个目录，也没有任何东西该去读它。
 */
export function workDir(): string {
  return process.env.PORTFOLIO_WORK_DIR ?? join(ROOT, "data");
}

/**
 * 静态资源目录：图片要能直接由 CDN 提供，所以必须落在 public 下。
 */
export function publicDir(): string {
  return process.env.PORTFOLIO_PUBLIC_DIR ?? join(ROOT, "public");
}

/**
 * 图片目录名：slug 是中文时用哈希代替。
 * 理由是 public/ 里的文件名会变成 URL 的一部分，中文路径在各家 CDN 上不保险，
 * 而图片一旦写进 src 就不会再改，所以在这里一次性定死。
 */
export function mediaKey(slug: string): string {
  if (/^[a-z0-9._-]+$/i.test(slug)) return slug;
  return `p-${createHash("sha256").update(slug).digest("hex").slice(0, 10)}`;
}

/** 某个作品的图片目录 → 对外是 /media/<key>/<file> */
export function mediaDir(slug: string): string {
  return join(publicDir(), "media", mediaKey(slug));
}

export function projectsFile(): string {
  return join(dataDir(), "projects.json");
}

/** 本地跑起来的站点副本（线上不存在，也不该被读到） */
export function siteDir(slug: string): string {
  return join(workDir(), "sites", slug);
}

/**
 * 线上形态：没有可写磁盘、没有长驻进程，后台必须关掉。
 * VERCEL 是自动的；其它容器平台（腾讯云 CloudBase 等）用 PORTFOLIO_HOSTED=1 手动标。
 */
export function isHosted(): boolean {
  const flag = process.env.PORTFOLIO_HOSTED;
  if (flag === "1" || flag === "true") return true;
  return Boolean(process.env.VERCEL);
}

export async function readProjects(): Promise<Project[]> {
  const file = projectsFile();
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // 线上拿不拿得到这个文件取决于构建产物里有没有它；兜底用构建时打进来的那份，
    // 这样部署出去的站点至少不会因为读不到文件而变成空作品集。
    if (isHosted()) return bundledProjects as Project[];
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as Project[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error(`projects.json 损坏，请检查：${file}`);
  }
}

export async function writeProjects(list: Project[]): Promise<void> {
  const file = projectsFile();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

export async function getProject(slug: string): Promise<Project | undefined> {
  return (await readProjects()).find((p) => p.slug === slug);
}

export async function upsertProject(project: Project): Promise<void> {
  const list = await readProjects();
  const index = list.findIndex((p) => p.slug === project.slug);
  if (index >= 0) list[index] = project;
  else list.push(project);
  await writeProjects(list);
}

export async function removeProject(slug: string): Promise<void> {
  await writeProjects((await readProjects()).filter((p) => p.slug !== slug));
}
