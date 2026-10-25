import { guard, json } from "@/lib/api";
import { mediaUrl } from "@/lib/import";
import { screenshot } from "@/lib/shot";
import { getProject, siteDir, upsertProject } from "@/lib/store";
import { manager } from "@/lib/runtime/manager";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 给作品拍一张首屏，存进 data/sites/<slug>/shots/，并追加到 images */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;

  const { slug } = await ctx.params;
  const project = await getProject(decodeURIComponent(slug));
  if (!project) return json({ error: "没有这个作品" }, { status: 404 });

  let url: string;
  if (project.runtime.kind === "remote" && !project.runtime.mirrored) {
    url = project.runtime.url;
  } else {
    try {
      const port = await manager.ensure(project);
      url = `http://127.0.0.1:${port}/`;
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "作品没跑起来" }, { status: 409 });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const relative = `shots/${stamp}.png`;

  try {
    await screenshot(url, `${siteDir(project.slug)}/${relative}`);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "截图失败" }, { status: 500 });
  }

  const next: Project = {
    ...project,
    images: [
      ...project.images,
      { src: mediaUrl(project.slug, relative), caption: "", alt: `${project.title} 首屏` },
    ],
  };
  await upsertProject(next);
  return json(next);
}
