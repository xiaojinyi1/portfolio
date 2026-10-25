import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const root = process.cwd();
const source = join(root, "data", "projects.json");
const target = join(root, "content", "projects.json");

const mediaKey = (slug) =>
  /^[a-z0-9._-]+$/i.test(slug) ? slug : `p-${createHash("sha256").update(slug).digest("hex").slice(0, 10)}`;

const projects = JSON.parse(readFileSync(source, "utf8"));
let copied = 0;

for (const project of projects) {
  const key = mediaKey(project.slug);
  const shotsFrom = join(root, "data", "sites", project.slug, "shots");
  const shotsTo = join(root, "public", "media", key, "shots");
  mkdirSync(shotsTo, { recursive: true });

  let files = [];
  try {
    files = readdirSync(shotsFrom);
  } catch {
    files = [];
  }
  for (const file of files) {
    copyFileSync(join(shotsFrom, file), join(shotsTo, file));
    copied += 1;
  }

  const oldPrefix = `/media/${encodeURIComponent(project.slug)}/`;
  const newPrefix = `/media/${key}/`;
  project.images = (project.images ?? []).map((image) => ({
    ...image,
    src: image.src.startsWith(oldPrefix) ? newPrefix + image.src.slice(oldPrefix.length) : image.src,
  }));

  if (project.runtime?.kind === "static" && project.runtime.dir) {
    project.runtime.dir = `data/sites/${project.slug}`;
  }
  delete project.port;
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
console.log(`迁移 ${projects.length} 个项目，复制 ${copied} 张图 → content/projects.json + public/media/`);
