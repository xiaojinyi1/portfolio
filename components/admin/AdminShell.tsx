"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/types";
import { LoginGate } from "./LoginGate";
import { ImportWizard } from "./ImportWizard";
import { ProjectEditor } from "./ProjectEditor";

export interface StatusEntry {
  slug: string;
  title: string;
  kind: "static" | "process" | "remote";
  port?: number;
  status: "stopped" | "starting" | "ready" | "failed";
  logs: string[];
}

const STATUS_TEXT: Record<StatusEntry["status"], string> = {
  stopped: "未启动",
  starting: "启动中",
  ready: "已就绪",
  failed: "失败",
};

export function AdminShell() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [statuses, setStatuses] = useState<StatusEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [projectRes, runtimeRes] = await Promise.all([
      fetch("/api/admin/projects", { cache: "no-store" }),
      fetch("/api/admin/runtime", { cache: "no-store" }),
    ]);
    if (projectRes.status === 401) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    setProjects((await projectRes.json()) as Project[]);
    if (runtimeRes.ok) setStatuses((await runtimeRes.json()) as StatusEntry[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => {
      void fetch("/api/admin/runtime", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setStatuses(data as StatusEntry[]);
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(id);
  }, [authed]);

  const statusOf = useMemo(() => {
    const map = new Map<string, StatusEntry>();
    for (const entry of statuses) map.set(entry.slug, entry);
    return map;
  }, [statuses]);

  const runtimeAction = async (action: string, slug?: string) => {
    setBusy(action + (slug ?? ""));
    try {
      const res = await fetch("/api/admin/runtime", {
        method: "POST",
        body: JSON.stringify({ action, slug }),
      });
      const data = (await res.json()) as StatusEntry[] | { error: string };
      if (!res.ok && "error" in data) setMessage(data.error);
      else setStatuses(data as StatusEntry[]);
    } finally {
      setBusy(null);
    }
  };

  const patch = async (slug: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/projects/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setMessage("保存失败");
      return;
    }
    await load();
  };

  const remove = async (slug: string) => {
    if (!confirm(`删掉《${slug}》？文件也会一起删。`)) return;
    await fetch(`/api/admin/projects/${encodeURIComponent(slug)}`, { method: "DELETE" });
    await load();
  };

  /** 给作品拍一张首屏当封面 */
  const capture = async (slug: string) => {
    setBusy(`shot-${slug}`);
    setMessage("正在截图…");
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(slug)}/shot`, { method: "POST" });
      const data = (await res.json()) as Project | { error: string };
      if (!res.ok && "error" in data) {
        setMessage(`截图失败：${data.error}`);
        return;
      }
      setMessage("截图已加到作品图片里，可以在「编辑」里排序或删掉。");
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (authed === null) {
    return <p className="empty">读数据中…</p>;
  }

  if (!authed) {
    return <LoginGate onDone={() => void load()} />;
  }

  return (
    <>
      {message ? (
        <div className="notice">
          {message}
          <button className="btn btn-ghost" style={{ marginLeft: 12 }} onClick={() => setMessage(null)}>
            知道了
          </button>
        </div>
      ) : null}

      <div className="btn-row" style={{ marginBottom: 22 }}>
        <button className="btn" disabled={busy !== null} onClick={() => void runtimeAction("all-start")}>
          全部启动
        </button>
        <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void runtimeAction("all-stop")}>
          全部停止
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          进程型作品会在打开详情页时自动拉起，这里可以手动预热
        </span>
      </div>

      <div className="panel">
        <h2>作品</h2>
        {projects.length === 0 ? (
          <p className="muted">还没有作品。用下面的「新增作品」导入第一个。</p>
        ) : (
          <table className="row-table">
            <thead>
              <tr>
                <th>运行</th>
                <th>标题</th>
                <th>日期</th>
                <th>类型</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const status = statusOf.get(project.slug);
                const state = status?.status ?? "stopped";
                return (
                  <tr key={project.slug}>
                    <td>
                      <span className="dot" data-state={state} />
                      <span className="muted" style={{ fontSize: 12 }}>
                        {STATUS_TEXT[state]}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontWeight: 500 }}>{project.title}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {project.slug}
                        {status?.port ? ` · :${status.port}` : ""}
                      </div>
                      {state === "failed" && status?.logs?.length ? (
                        <pre className="log">{status.logs.slice(-6).join("\n")}</pre>
                      ) : null}
                    </td>
                    <td className="muted">{project.date}</td>
                    <td className="muted">
                      {project.runtime.kind === "static"
                        ? "静态"
                        : project.runtime.kind === "process"
                          ? "进程"
                          : "外链"}
                    </td>
                    <td>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {project.published ? "已发布" : "草稿"}
                      </span>
                    </td>
                    <td>
                      <div className="btn-row">
                        <button className="btn btn-ghost" onClick={() => setEditing(project.slug)}>
                          编辑
                        </button>
                        <button
                          className="btn btn-ghost"
                          disabled={busy !== null}
                          onClick={() => void capture(project.slug)}
                        >
                          截图
                        </button>
                        <button
                          className="btn btn-ghost"
                          disabled={project.runtime.kind === "remote" || busy !== null}
                          onClick={() => void runtimeAction("start", project.slug)}
                        >
                          启动
                        </button>
                        <button className="btn btn-ghost" onClick={() => void remove(project.slug)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing ? (
        <ProjectEditor
          project={projects.find((item) => item.slug === editing)!}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            await patch(editing, body);
            setEditing(null);
          }}
        />
      ) : null}

      <ImportWizard
        onImported={async (result) => {
          setMessage(
            result.warnings.length
              ? `已导入《${result.project.title}》。${result.warnings.join("；")}`
              : `已导入《${result.project.title}》，介绍已生成，检查后发布。`,
          );
          await load();
          setEditing(result.project.slug);
        }}
      />
    </>
  );
}
