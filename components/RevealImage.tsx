"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

interface RevealImageProps {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  /** 首屏第一张图可以给 true，省掉一次观察 */
  priority?: boolean;
  style?: CSSProperties;
}

export function RevealImage({ src, alt, caption, className, priority, style }: RevealImageProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(Boolean(priority));

  useEffect(() => {
    if (priority) return;
    const node = ref.current;
    if (!node) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setShown(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [priority]);

  const frame = (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={["reveal", className].filter(Boolean).join(" ")}
      data-in={shown ? "true" : "false"}
      style={style}
    >
      <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} />
    </div>
  );

  if (!caption) return frame;

  return (
    <figure>
      {frame}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
