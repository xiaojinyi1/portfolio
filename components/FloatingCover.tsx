"use client";

import { useEffect, useRef, useState } from "react";

interface FloatingCoverProps {
  src: string | null;
  alt: string;
  /** 当前悬停项的稳定 key，变化时重置位置 */
  activeKey: string | null;
}

/** 悬停作品行时跟随光标的封面：只动 transform/opacity，不引起布局 */
export function FloatingCover({ src, alt, activeKey }: FloatingCoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!src) return;

    const onMove = (event: PointerEvent) => {
      target.current = { x: event.clientX, y: event.clientY };
    };

    let frame = 0;
    let last = { x: -999, y: -999 };

    const loop = () => {
      const { x, y } = target.current;
      const node = ref.current;
      if (node) {
        // 跟手但不硬贴：留一点滞后，看起来像被拖动的纸片
        last = { x: last.x + (x - last.x) * 0.18, y: last.y + (y - last.y) * 0.18 };
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        node.style.transform = `translate3d(${Math.round(last.x - width * 0.5)}px, ${Math.round(
          last.y - height * 0.62,
        )}px, 0) scale(1)`;
      }
      frame = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [src]);

  if (!src) return null;

  return (
    <div ref={ref} className="floating-cover" data-visible="true" aria-hidden="true" key={activeKey ?? ""}>
      <img src={src} alt={alt} />
    </div>
  );
}
