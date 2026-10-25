"use client";

import { useRef, useState } from "react";
import type { Project } from "@/lib/types";

type Mode = "zip" | "folder" | "path" | "remote";

interface ImportSummary {
  project: Project;
  warnings: string[];
}

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "zip", label: "zip 包", hint: "把打包好的站点（含 index.html）拖进来" },
  { id: "folder", label: "文件夹", hint: "整个站点目录，浏览器会让你确认上传范围" },
  { id: "path", label: "本机路径", hint: "作品本来就在这台电脑上，直接填路径，不复制" },
  { id: "remote", label: "静态网址", hint: "作品已经在线上了，贴 URL；可选镜像到本地离线也能看" },
];

/** 文件夹上传：webkitdirectory，统计出所有文件的相对路径 */
function readFolderFiles(entries: FileList): Array<{ file: File; path: string }> {
  return Array.from(entries).map((file) => {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return { file, path: relative || file.name };
  });
}

export function ImportWizard({ onImported }: { onImported: (result: ImportSummary) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("zip");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 7).replace("-", "."));
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [mirror, setMirror] = useState(true);
  const [localPath, setLocalPath] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<Array<{ file: File; path: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);

  const ready =
    title.trim().length > 0 &&
    ((mode === "zip" && zipFile) ||
      (mode === "folder" && folderFiles.length > 0) ||
      (mode === "path" && localPath.trim().length > 0) ||
      (mode === "remote" && /^https?:\/\//i.test(url.trim())));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);

    try {
      let res: Response;

      if (mode === "remote") {
        res = await fetch("/api/admin/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "remote", title, date, note, url, mirror }),
        });
      } else if (mode === "path") {
        res = await fetch("/api/admin/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "path", title, date, note, path: localPath }),
        });
      } else if (mode === "folder") {
        // 浏览器没有「目录路径」，把整棵目录按相对路径重新打包成 zip 再传
        const form = new FormData();
        form.set("kind", "folder-upload");
        form.set("title", title);
        form.set("date", date);
        form.set("note", note);
        for (const entry of folderFiles) form.append("files", entry.file, entry.path);
        res = await fetch("/api/admin/projects/folder", { method: "POST", body: form });
      } else {
        const form = new FormData();
        form.set("kind", "zip");
        form.set("title", title);
        form.set("date", date);
        form.set("note", note);
        form.set("file", zipFile!);
        res = await fetch("/api/admin/projects", { method: "POST", body: form });
      }

      const data = (await res.json()) as ImportSummary | { error: string };
      if (!res.ok) {
        setError("error" in data ? data.error : "导入失败");
        return;
      }

      await onImported(data as ImportSummary);
      setTitle("");
      setNote("");
      setUrl("");
      setLocalPath("");
      setZipFile(null);
      setFolderFiles([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit}>
      <h2>新增作品</h2>

      <div className="tabs">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="tab"
            data-active={mode === item.id}
            onClick={() => setMode(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        {MODES.find((item) => item.id === mode)?.hint}
      </p>

      <div className="split">
        <div>
          <div className="field">
            <label htmlFor="title">标题</label>
            <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="校门口美食榜单" />
          </div>
          <div className="field">
            <label htmlFor="date">日期</label>
            <input id="date" value={date} onChange={(event) => setDate(event.target.value)} placeholder="2025.06" />
          </div>
          <div className="field">
            <label htmlFor="note">备注（可选，但写了介绍会更具体）</label>
            <textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="比如：最麻烦的是榜单实时更新时列表一直闪，后来改成只有变化的那一行重绘"
            />
          </div>
        </div>

        <div>
          {mode === "zip" ? (
            <div className="field">
              <label htmlFor="zip">zip 文件</label>
              <input
                id="zip"
                type="file"
                accept=".zip"
                onChange={(event) => setZipFile(event.target.files?.[0] ?? null)}
              />
              {zipFile ? <span className="muted" style={{ fontSize: 12 }}>{zipFile.name}</span> : null}
            </div>
          ) : null}

          {mode === "folder" ? (
            <div className="field">
              <label htmlFor="folder">站点目录</label>
              <input
                id="folder"
                ref={folderInput}
                type="file"
                multiple
                // @ts-expect-error 非标准属性，但 Chromium/Edge 都支持
                webkitdirectory=""
                onChange={(event) => {
                  setFolderFiles(event.target.files ? readFolderFiles(event.target.files) : []);
                }}
              />
              {folderFiles.length > 0 ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  选中 {folderFiles.length} 个文件
                </span>
              ) : null}
            </div>
          ) : null}

          {mode === "path" ? (
            <div className="field">
              <label htmlFor="path">本机绝对路径</label>
              <input
                id="path"
                value={localPath}
                onChange={(event) => setLocalPath(event.target.value)}
                placeholder="D:\projects\food-rank"
              />
            </div>
          ) : null}

          {mode === "remote" ? (
            <>
              <div className="field">
                <label htmlFor="url">网址</label>
                <input id="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
              </div>
              <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={mirror}
                  onChange={(event) => setMirror(event.target.checked)}
                  style={{ width: "auto" }}
                />
                镜像到本地（断网也能演示）
              </label>
            </>
          ) : null}

          {error ? <p className="muted" style={{ fontSize: 13 }}>{error}</p> : null}

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn" type="submit" disabled={!ready || busy}>
              {busy ? "导入中，可能要几十秒…" : "导入并生成介绍"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
