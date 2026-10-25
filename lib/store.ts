import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Project } from "./types";

// 不用 import.meta.url：Next 把服务端代码打包后那里拿不到可用的 URL
const ROOT = process.env.PORTFOLIO_ROOT ?? process.cwd();

/** 数据目录：默认 <repo>/data，测试用 PORTFOLIO_DATA_DIR 覆盖。调用时才读环境变量。 */
export function dataDir(): string {
  return process.env.PORTFOLIO_DATA_DIR ?? join(ROOT, "data");
}

export function projectsFile(): string {
  return join(dataDir(), "projects.json");
}

export function siteDir(slug: string): string {
  return join(dataDir(), "sites", slug);
}

export async function readProjects(): Promise<Project[]> {
  const file = projectsFile();
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
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
