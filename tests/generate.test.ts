import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDraft, buildPrompt } from "@/lib/generate";

const emptyMaterial = { headings: [] as string[], text: "", files: [] as string[], readme: "" };

process.env.DEEPSEEK_API_KEY ||= "test-key";

test("生成的 JSON 被校验并规范化", async () => {
  const content = JSON.stringify({
    intro: [" 第一段 ", "第二段"],
    facts: { time: "2026 年 5 月", role: "我一个人做的", stack: "React", status: "已上线" },
  });
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    })) as unknown as typeof fetch;

  const draft = await generateDraft(
    { title: "实时美食榜单", material: { ...emptyMaterial, headings: ["今日最佳"] }, note: "最难的是并发" },
    fakeFetch,
  );

  assert.deepEqual(draft.intro, ["第一段", "第二段"]);
  assert.equal(draft.facts.stack, "React");
  assert.equal(draft.facts.status, "已上线");
});

test("模型返回的 JSON 被 ``` 包裹时也能解析", async () => {
  const content = '```json\n{"intro":["只有一段"],"facts":{"time":"","role":"","stack":"","status":""}}\n```';
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) as unknown as typeof fetch;

  const draft = await generateDraft({ title: "x", material: emptyMaterial, note: "" }, fakeFetch);
  assert.deepEqual(draft.intro, ["只有一段"]);
});

test("两次都失败时抛出可读错误", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "不是 JSON" } }] }), {
      status: 200,
    })) as unknown as typeof fetch;

  await assert.rejects(
    generateDraft({ title: "x", material: emptyMaterial, note: "" }, fakeFetch),
    /生成失败/,
  );
});

test("提示词带上标题、标题结构与备注", () => {
  const { system, user } = buildPrompt({
    title: "实时美食榜单",
    material: { ...emptyMaterial, headings: ["今日最佳", "附近"] },
    note: "最难的是数据更新",
  });
  assert.match(system, /第一人称/);
  assert.match(user, /实时美食榜单/);
  assert.match(user, /今日最佳/);
  assert.match(user, /最难的是数据更新/);
});
