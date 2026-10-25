export type Runtime =
  | { kind: "static"; dir: string }
  | { kind: "process"; cwd: string; start: string; healthPath?: string }
  | { kind: "remote"; url: string; mirrored: boolean };

export type FactKey = "time" | "role" | "stack" | "status";

export type ProjectFacts = Record<FactKey, string>;

export interface ProjectImage {
  src: string;
  caption: string;
  alt: string;
}

export interface Project {
  slug: string;
  title: string;
  date: string;
  intro: string[];
  facts: ProjectFacts;
  images: ProjectImage[];
  note?: string;
  runtime: Runtime;
  port?: number;
  sourceLabel: string;
  published: boolean;
  createdAt: string;
  order: number;
}

export interface Draft {
  intro: string[];
  facts: ProjectFacts;
}

export const FACT_LABELS: Record<FactKey, string> = {
  time: "时间",
  role: "我的角色",
  stack: "用了什么",
  status: "现状",
};
