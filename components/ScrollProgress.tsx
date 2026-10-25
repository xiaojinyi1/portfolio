"use client";

import { useEffect, useState } from "react";

/** 右侧竖向进度：0.00 → 1.00，跟着滚动走 */
export function ScrollProgress() {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;

    const compute = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      setValue(ratio);
      doc.style.setProperty("--progress", `${Math.round(ratio * 100)}%`);
      frame = 0;
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="scroll-progress" aria-hidden="true">
      <span />
      {value.toFixed(2)}
    </div>
  );
}
