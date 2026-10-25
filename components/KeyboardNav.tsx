"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface KeyboardNavProps {
  prevHref: string | null;
  nextHref: string | null;
  homeHref: string;
}

/** 翻页笔也能用：← 上一件、→ 下一件、Esc 回首页、F 全屏 */
export function KeyboardNav({ prevHref, nextHref, homeHref }: KeyboardNavProps) {
  const router = useRouter();
  const [hintVisible, setHintVisible] = useState(true);

  // 提示只在开头出现几秒，之后收起来，别挡着作品
  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), 6000);
    const show = () => {
      setHintVisible(true);
      setTimeout(() => setHintVisible(false), 6000);
    };
    window.addEventListener("pointermove", show, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", show);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "ArrowLeft" && prevHref) {
        event.preventDefault();
        router.push(prevHref);
      } else if (event.key === "ArrowRight" && nextHref) {
        event.preventDefault();
        router.push(nextHref);
      } else if (event.key === "Escape") {
        router.push(homeHref);
      } else if (event.key === "f" || event.key === "F") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => undefined);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, homeHref, router]);

  return (
    <div className="kbd-hint" data-visible={hintVisible} aria-hidden="true">
      ← → 翻作品 · Esc 回首页 · F 全屏
    </div>
  );
}
