"use client";

import { useState } from "react";
import type { FactKey, Project, ProjectImage } from "@/lib/types";

const FACT_KEYS: Array<{ key: FactKey; label: string }> = [
  { key: "time", label: "时间" },
  { key: "role", label: "我的角色" },
  { key: "stack", label: "用了什么" },
  { key: "status", label: "现状" },
];

export function ProjectEditor({
  project,
  onClose,
  onSave,
}: {
  project: Project;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState(project.title);
  const [date, setDate] = useState(project.date);
  const [intro, setIntro] = useState(project.intro.join("\n\n"));
  const [facts, setFacts] = useState({ ...project.facts });
  const [images, setImages] = useState<ProjectImage[]>(project.images);
  const [published, setPublished] = useState(project.published);
  const [note, setNote] = useState(project.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/generate", {
        method: "POST",
        body: JSON.stringify({ slug: project.slug }),
      });
      const data = (await res.json()) as
        | { ok: true; draft: { intro: string[]; facts: Record<FactKey, string> } }
        | { ok: false; error: string };
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setIntro(data.draft.intro.join("\n\n"));
      setFacts((current) => ({ ...current, ...data.draft.facts }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({
        title,
        date,
        note,
        published,
        intro: intro
          .split(/\n{2,}/)
          .map((part) => part.trim())
          .filter(Boolean),
        facts,
        images,
      });
    } finally {
      setBusy(false);
    }
  };

  const moveImage = (index: number, delta: number) => {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
  };

  return (
    <div className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>编辑 · {project.slug}</h2>
        <button className="btn btn-ghost" onClick={onClose}>
          收起
        </button>
      </div>

      <div className="split">
        <div>
          <div className="field">
            <label htmlFor="edit-title">标题</label>
            <input id="edit-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="edit-date">日期</label>
            <input id="edit-date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="edit-intro">介绍（空一行分段）</label>
            <textarea
              id="edit-intro"
              value={intro}
              style={{ minHeight: 220 }}
              onChange={(event) => setIntro(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-note">备注（下次重新生成会用到）</label>
            <textarea id="edit-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            四格
          </div>
          {FACT_KEYS.map((item) => (
            <div className="field" key={item.key}>
              <label htmlFor={`fact-${item.key}`}>{item.label}</label>
              <input
                id={`fact-${item.key}`}
                value={facts[item.key] ?? ""}
                onChange={(event) => setFacts({ ...facts, [item.key]: event.target.value })}
              />
            </div>
          ))}

          <div className="muted" style={{ fontSize: 12, marginBottom: 8, marginTop: 18 }}>
            图片（{images.length}）
          </div>
          {images.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>没有图片，详情页只显示文字。</p> : null}
          {images.map((image, index) => (
            <div key={image.src} style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <img src={image.src} alt={image.alt} className="thumb" />
                <div style={{ flex: 1 }}>
                  <input
                    value={image.caption}
                    placeholder="图注（可留空）"
                    onChange={(event) => {
                      const next = [...images];
                      next[index] = { ...image, caption: event.target.value };
                      setImages(next);
                    }}
                  />
                </div>
                <button className="btn btn-ghost" type="button" onClick={() => moveImage(index, -1)}>
                  ↑
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => moveImage(index, 1)}>
                  ↓
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setImages(images.filter((item) => item.src !== image.src))}
                >
                  去掉
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="muted" style={{ fontSize: 13 }}>{error}</p> : null}

      <div className="btn-row" style={{ marginTop: 18 }}>
        <button className="btn" onClick={() => void save()} disabled={busy}>
          {busy ? "保存中…" : "保存"}
        </button>
        <button className="btn btn-ghost" onClick={() => void regenerate()} disabled={busy}>
          重新生成介绍
        </button>
        <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={published}
            onChange={(event) => setPublished(event.target.checked)}
            style={{ width: "auto" }}
          />
          公开到首页
        </label>
      </div>
    </div>
  );
}
