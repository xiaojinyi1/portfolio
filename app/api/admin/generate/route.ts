import { badRequest, guard, json } from "@/lib/api";
import { generateDraft } from "@/lib/generate";
import { collectMaterial } from "@/lib/material";
import { getProject, siteDir, upsertProject } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 重新生成草稿：只返回文本，不覆盖项目里已有的介绍（前端点保存才写回） */
export async function POST(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;

  let body: { slug?: string };
  try {
    body = (await req.json()) as { slug?: string };
  } catch {
    return badRequest("请求体不是合法 JSON");
  }

  const project = await getProject(String(body.slug ?? ""));
  if (!project) return json({ error: "没有这个作品" }, { status: 404 });

  if (!process.env.DEEPSEEK_API_KEY) {
    return json({ ok: false, error: "没有配置 DEEPSEEK_API_KEY" }, { status: 400 });
  }
  if (project.runtime.kind === "remote") {
    return json({ ok: false, error: "外链作品抓不到内容，请手写介绍" }, { status: 400 });
  }

  const entryDir = project.runtime.kind === "static" ? project.runtime.dir : siteDir(project.slug);

  try {
    const material = await collectMaterial(entryDir);
    const draft = await generateDraft({
      title: project.title,
      material,
      note: project.note ?? "",
    });
    return json({ ok: true, draft });
  } catch (error) {
    return json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}

/** 保存生成结果到项目（前端确认后调用） */
export async function PUT(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;

  const body = (await req.json()) as { slug?: string; intro?: string[]; facts?: Record<string, string> };
  const project = await getProject(String(body.slug ?? ""));
  if (!project) return json({ error: "没有这个作品" }, { status: 404 });

  const next = { ...project };
  if (Array.isArray(body.intro)) next.intro = body.intro.map((p) => String(p).trim()).filter(Boolean);
  if (body.facts) {
    next.facts = {
      time: String(body.facts.time ?? next.facts.time),
      role: String(body.facts.role ?? next.facts.role),
      stack: String(body.facts.stack ?? next.facts.stack),
      status: String(body.facts.status ?? next.facts.status),
    };
  }

  await upsertProject(next);
  return json({ ok: true, project: next });
}
