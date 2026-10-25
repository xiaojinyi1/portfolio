"use client";

import { useState } from "react";
import Link from "next/link";
import { FloatingCover } from "./FloatingCover";
import type { Project } from "@/lib/types";

interface ProjectListProps {
  projects: Project[];
}

function yearOf(project: Project): string {
  const match = /(\d{4})/.exec(project.date ?? "");
  return match ? match[1] : "其他";
}

export function ProjectList({ projects }: ProjectListProps) {
  const [active, setActive] = useState<string | null>(null);

  const sorted = [...projects].sort((a, b) => {
    const byDate = (b.date ?? "").localeCompare(a.date ?? "", "zh");
    return byDate || a.order - b.order;
  });

  const groups: Array<{ year: string; items: Project[] }> = [];
  for (const project of sorted) {
    const year = yearOf(project);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.items.push(project);
    else groups.push({ year, items: [project] });
  }

  const activeProject = sorted.find((project) => project.slug === active);

  return (
    <>
      <FloatingCover
        src={activeProject?.images[0]?.src ?? null}
        alt={activeProject?.title ?? ""}
        activeKey={active}
      />

      {groups.map((group) => (
        <section key={group.year} aria-label={`${group.year} 年的作品`}>
          <p className="work-year">{group.year}</p>
          <ul className="work-list">
            {group.items.map((project) => (
              <li
                key={project.slug}
                className="work-item"
                onPointerEnter={() => setActive(project.slug)}
                onPointerLeave={() => setActive((current) => (current === project.slug ? null : current))}
              >
                <Link className="work-link" href={`/work/${project.slug}`}>
                  <span className="work-title">{project.title}</span>
                  <span className="work-date">{project.date}</span>
                  <span className="work-view">View →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
