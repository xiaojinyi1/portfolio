"use client";

import { useEffect, useRef, useState } from "react";

interface PreviewFrameProps {
  slug: string;
  port?: number;
  externalUrl?: string;
}

export function PreviewFrame({ slug, port, externalUrl }: PreviewFrameProps) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const url = port ? `http://127.0.0.1:${port}/` : (externalUrl ?? null);

  useEffect(() => {
    if (!url) {
      setState("failed");
      return;
    }
    setState("loading");
    timer.current = setTimeout(
      () => setState((current) => (current === "ready" ? current : "failed")),
      8000,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [url, attempt]);

  if (!url) {
    return (
      <div className="preview">
        <div className="preview-bar">
          <span>没有可用的地址</span>
        </div>
        <div className="preview-note">这件作品既没有本地端口，也没有可嵌入的链接。</div>
      </div>
    );
  }

  const label = port ? `127.0.0.1:${port}` : new URL(url).host;

  return (
    <div className="preview">
      <div className="preview-bar">
        <span>
          {state === "ready" ? "正在运行" : state === "loading" ? "加载中…" : "没有响应"} · {label}
        </span>
        <span className="muted">{slug}</span>
      </div>

      {state === "failed" ? (
        <div className="preview-note">
          这个地址现在没响应。可能是作品还没启动，或者它自己崩了。
          <br />
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            重试一次
          </button>
        </div>
      ) : (
        <iframe
          key={attempt}
          className="preview-frame"
          src={url}
          title={`${slug} 的现场预览`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={() => {
            if (timer.current) clearTimeout(timer.current);
            setState("ready");
          }}
        />
      )}
    </div>
  );
}
