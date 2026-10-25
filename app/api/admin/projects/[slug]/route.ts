import { badRequest, guard, json } from "@/lib/api";
import { getProject, upsertProject, removeProject } from "@/lib/store";
import { manager } from "@/lib/runtime/manager";
import type { FactKey, Project, ProjectImage } from "@/lib/types";

export const dynamic = "force-dynamic";

const FACT_KEYS: FactKey[] = ["time", "role", "stack", "status"];

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;

  const { slug } = await ctx.params;
  const project = await getProject(decodeURIComponent(slug));
  if (!project) return json({ error: "没有这个作品" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("请求体不是合法 JSON");
  }

  const next: Project = { ...project };

  if (typeof body.title === "string" && body.title.trim()) next.title = body.title.trim();
  if (typeof body.date === "string") next.date = body.date.trim();
  if (typeof body.published === "boolean") next.published = body.published;
  if (typeof body.note === "string") next.note = body.note.trim() || undefined;
  if (typeof body.order === "number" && Number.isFinite(body.order)) next.order = body.order;

  if (typeof body.liveUrl === "string") {
    const liveUrl = body.liveUrl.trim();
    if (!liveUrl) {
      next.liveUrl = undefined;
    } else if (!/^https?:\/\//i.test(liveUrl)) {
      return badRequest("线上地址要以 http:// 或 https:// 开头");
    } else {
      next.liveUrl = liveUrl;
    }
  }

  if (Array.isArray(body.intro)) {
    next.intro = body.intro.map((part) => String(part).trim()).filter(Boolean);
  }

  if (body.facts && typeof body.facts === "object") {
    const facts = { ...next.facts };
    for (const key of FACT_KEYS) {
      const value = (body.facts as Record<string, unknown>)[key];
      if (typeof value === "string") facts[key] = value.trim();
    }
    next.facts = facts;
  }

  if (Array.isArray(body.images)) {
    next.images = (body.images as ProjectImage[])
      .filter((image) => image && typeof image.src === "string" && image.src)
      .map((image) => ({
        src: image.src,
        caption: String(image.caption ?? ""),
        alt: String(image.alt ?? next.title),
      }));
  }

  await upsertProject(next);
  return json(next);
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;

  const { slug } = await ctx.params;
  const project = await getProject(decodeURIComponent(slug));
  if (!project) return json({ error: "没有这个作品" }, { status: 404 });

  manager.stop(project);
  await removeProject(project.slug);
  return json({ ok: true });
}
