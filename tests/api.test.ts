import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";

const DATA = mkdtempSync(join(tmpdir(), "api-"));

// 所有测试共用一个进程，环境变量会互相污染：每条测试开头重设一次
function useEnv(): void {
  process.env.PORTFOLIO_DATA_DIR = join(DATA, "content");
  process.env.PORTFOLIO_WORK_DIR = join(DATA, "work");
  process.env.PORTFOLIO_PUBLIC_DIR = join(DATA, "public");
  process.env.ADMIN_PASSWORD = "portfolio";
  process.env.DEEPSEEK_API_KEY = "";
}

const { POST: login } = await import("@/app/api/admin/login/route");
const { GET: listProjects, POST: createProject } = await import("@/app/api/admin/projects/route");
const { PATCH } = await import("@/app/api/admin/projects/[slug]/route");
const { authCookieHeader } = await import("@/lib/auth");

function authed(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { cookie: authCookieHeader(), ...(init.headers as Record<string, string>) },
  };
}

test("登录：口令对给 cookie，口令错 401", async () => {
  useEnv();

  const wrong = await login(
    new Request("http://x/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "nope" }),
    }),
  );
  assert.equal(wrong.status, 401);

  const right = await login(
    new Request("http://x/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "portfolio" }),
    }),
  );
  assert.equal(right.status, 200);
  assert.match(right.headers.get("set-cookie") ?? "", /pf_admin=/);
});

test("没登录访问项目列表 → 401", async () => {
  useEnv();
  const res = await listProjects(new Request("http://x/api/admin/projects"));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "未授权");
});

test("上传 zip → 建项目、图片进 images、文件落到 data/sites、能改发布状态", async () => {
  useEnv();

  const zip = new AdmZip();
  zip.addFile("index.html", Buffer.from("<!doctype html><title>相册</title><h1>照片墙</h1>"));
  zip.addFile("assets/cover.png", Buffer.alloc(4096));

  const form = new FormData();
  form.set("kind", "zip");
  form.set("title", "照片墙");
  form.set("date", "2025.05");
  form.set("file", new Blob([zip.toBuffer()]), "site.zip");

  const res = await createProject(
    new Request("http://x/api/admin/projects", authed({ method: "POST", body: form })),
  );
  assert.equal(res.status, 200);

  const payload = (await res.json()) as {
    project: { slug: string; runtime: { kind: string }; images: { src: string }[]; published: boolean };
    warnings: string[];
  };

  assert.equal(payload.project.runtime.kind, "static");
  assert.equal(payload.project.images.length, 1);
  assert.match(payload.project.images[0].src, /^\/media\/.+\/assets\/cover\.png$/);
  assert.equal(payload.project.published, false);
  assert.ok(payload.warnings.some((w) => w.includes("DEEPSEEK_API_KEY")));

  const siteIndex = join(DATA, "work", "sites", payload.project.slug, "index.html");
  assert.ok(existsSync(siteIndex), `没找到 ${siteIndex}`);
  assert.match(readFileSync(siteIndex, "utf8"), /照片墙/);

  const patch = await PATCH(
    new Request(
      `http://x/api/admin/projects/${payload.project.slug}`,
      authed({ method: "PATCH", body: JSON.stringify({ published: true, intro: ["第一段", "第二段"] }) }),
    ),
    { params: Promise.resolve({ slug: payload.project.slug }) },
  );
  assert.equal(patch.status, 200);

  const list = await listProjects(new Request("http://x/api/admin/projects", authed()));
  const saved = (await list.json()) as Array<{ slug: string; published: boolean; intro: string[] }>;
  assert.equal(saved[0].published, true);
  assert.deepEqual(saved[0].intro, ["第一段", "第二段"]);
});

test("线上形态：后台整条链路都当不存在（404）", async () => {
  useEnv();
  process.env.VERCEL = "1";
  try {
    const loginRes = await login(
      new Request("http://x/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "portfolio" }),
      }),
    );
    assert.equal(loginRes.status, 404, "口令对也不能登录");

    const listRes = await listProjects(new Request("http://x/api/admin/projects", authed()));
    assert.equal(listRes.status, 404, "带 cookie 也不能读项目");
  } finally {
    delete process.env.VERCEL;
  }
});
