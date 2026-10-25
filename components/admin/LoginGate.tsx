"use client";

import { useState } from "react";

export function LoginGate({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onDone();
        return;
      }
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" style={{ maxWidth: 380 }} onSubmit={submit}>
      <h2>口令</h2>
      <div className="field">
        <label htmlFor="password">后台口令（.env.local 里的 ADMIN_PASSWORD）</label>
        <input
          id="password"
          type="password"
          value={password}
          autoFocus
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p className="muted" style={{ fontSize: 13 }}>{error}</p> : null}
      <button className="btn" type="submit" disabled={busy || !password}>
        {busy ? "验证中…" : "进入"}
      </button>
    </form>
  );
}
