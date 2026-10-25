import type { Draft, FactKey } from "./types";

export interface SiteMaterial {
  headings: string[];
  text: string;
  files: string[];
  readme: string;
}

export interface GenerateInput {
  title: string;
  material: SiteMaterial;
  note: string;
}

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const SYSTEM_PROMPT = `你是一名学生在写自己的课程作品集。你会读到某个网站的结构化摘要，然后写一段中文项目介绍。

硬性要求：
1. 用第一人称（"我"），像在讲自己做的东西，不像产品文案。
2. 两段。第一段说"这是什么、给谁用、打开来会看到什么"；第二段说"最费劲的地方是什么、我怎么取舍的"。
3. 只用素材里真实存在的信息。技术栈、数据来源、功能点，素材里没有就不要写。绝不编造数字、用户量、获奖、上线时间。
4. 不出现"赋能、打造、一站式、深度融合、致力于、旨在"这类词；不出现"本项目""赋能用户"这种腔调；不提 AI；不要念文件清单（不写"页面就三个文件：index.html…"）。
5. 每段 60–120 个汉字，句子短，允许口语。
6. 如果素材不足以写第二段，就只写第一段，不要凑字数。

只输出一个 JSON 对象，不要解释：
{"intro": ["第一段", "第二段"], "facts": {"time": "…", "role": "…", "stack": "…", "status": "…"}}

facts 的四个字段：只写素材里能直接看出来的东西。time 写大致时间范围；role 写我具体做了什么；stack 只写素材里出现过的技术名；status 写现状。素材里没有依据的字段，必须留空字符串——尤其 time 和 status 不要猜，不要因为"看起来像课程作业"就写"课程作业"。`;

export function buildPrompt(input: GenerateInput): { system: string; user: string } {
  const { title, material, note } = input;
  const parts = [
    `标题：${title}`,
    material.headings.length ? `页面上的标题（按出现顺序）：\n${material.headings.slice(0, 30).join("\n")}` : "",
    material.text ? `正文开头：\n${material.text.slice(0, 2000)}` : "",
    material.files.length ? `站点里的主要文件：\n${material.files.slice(0, 40).join("\n")}` : "",
    material.readme ? `README / 说明：\n${material.readme.slice(0, 3000)}` : "",
    note ? `我自己补充的说明（最可信，优先采用）：\n${note}` : "",
  ];
  return { system: SYSTEM_PROMPT, user: parts.filter(Boolean).join("\n\n") };
}

function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeDraft(raw: unknown): Draft {
  if (!raw || typeof raw !== "object") throw new Error("模型输出不是对象");
  const obj = raw as { intro?: unknown; facts?: unknown };

  const intro = Array.isArray(obj.intro)
    ? obj.intro.map(asString).filter(Boolean).slice(0, 3)
    : typeof obj.intro === "string" && obj.intro.trim()
      ? [obj.intro.trim()]
      : [];

  if (intro.length === 0) throw new Error("模型没给出 intro");

  const factsRaw = (obj.facts ?? {}) as Record<string, unknown>;
  const keys: FactKey[] = ["time", "role", "stack", "status"];
  const facts = Object.fromEntries(keys.map((k) => [k, asString(factsRaw[k])])) as Record<
    FactKey,
    string
  >;

  return { intro, facts };
}

async function callModel(input: GenerateInput, fetchImpl: typeof fetch): Promise<string> {
  const { system, user } = buildPrompt(input);
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("未配置 DEEPSEEK_API_KEY");

  const res = await fetchImpl(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) throw new Error(`接口返回 ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("接口没有返回内容");
  return content;
}

/** 生成一段项目介绍；失败重试一次，两次都失败就抛错（由调用方存空介绍） */
export async function generateDraft(
  input: GenerateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<Draft> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await callModel(input, fetchImpl);
      return normalizeDraft(JSON.parse(stripFence(content)));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`生成失败：${(lastError as Error)?.message ?? "未知错误"}`);
}
