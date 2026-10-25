import { badRequest, guard, json } from "@/lib/api";
import { manager } from "@/lib/runtime/manager";
import { readProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  return json(await statuses());
}

async function statuses() {
  const list = await readProjects();
  return list.map((project) => ({
    slug: project.slug,
    title: project.title,
    kind: project.runtime.kind,
    port: manager.port(project.slug) ?? project.port,
    status: manager.status(project.slug),
    logs: manager.logs(project.slug),
  }));
}

export async function POST(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;

  let body: { action?: string; slug?: string };
  try {
    body = (await req.json()) as { action?: string; slug?: string };
  } catch {
    return badRequest("请求体不是合法 JSON");
  }

  const list = await readProjects();
  const action = String(body.action ?? "");

  try {
    if (action === "start" || action === "restart") {
      const project = list.find((p) => p.slug === body.slug);
      if (!project) return json({ error: "没有这个作品" }, { status: 404 });
      if (action === "restart") manager.stop(project);
      if (project.runtime.kind !== "remote") await manager.ensure(project);
    } else if (action === "stop") {
      const project = list.find((p) => p.slug === body.slug);
      if (!project) return json({ error: "没有这个作品" }, { status: 404 });
      manager.stop(project);
    } else if (action === "all-start") {
      await Promise.all(
        list.map((project) => (project.runtime.kind === "remote" ? null : manager.ensure(project))),
      );
    } else if (action === "all-stop") {
      manager.stopAll();
    } else {
      return badRequest(`不认识的操作：${action}`);
    }
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 500 });
  }

  return json(await statuses());
}
