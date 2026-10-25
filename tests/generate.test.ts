import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDraft, buildPrompt } from "@/lib/generate";

const emptyMaterial = { headings: [] as string[], text: "", files: [] as string[], readme: "" };

// 所有测试共用一个进程，环境变量会互相污染：每条测试开头重设
function withKey(): void {
  process.env.DEEPSEEK_API_KEY = "test-key";
}

test("生成的 JSON 被校验并规范化", async () => {
  withKey();
  const content = JSON.stringify({
    intro: [" 第一段 ", "第二段"],
    facts: { time: "2026 年 5 月", role: "我一个人做的", stack: "React", status: "已上线" },
  });
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    })) as unknown as typeof fetch;

  const draft = await generateDraft(
    { title: "相册", material: emptyMaterial, note: "" },
    fakeFetch,
  );

  assert.deepEqual(draft.intro, ["第一段", "第二段"]);
  assert.equal(draft.facts.stack, "React");
});

test("模型返回的 JSON 被 ``` 包裹时也能解析", async () => {
  withKey();
  const content = '```json\n{"intro":["一段"],"facts":{"time":"","role":"","stack":"","status":""}}\n```';
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    })) as unknown as typeof fetch;

  const draft = await generateDraft({ title: "相册", material: emptyMaterial, note: "" }, fakeFetch);
  assert.deepEqual(draft.intro, ["一段"]);
});

test("两次都失败时抛出可读错误", async () => {
  withKey();
  let calls = 0;
  const fakeFetch = (async () => {
    calls += 1;
    return new Response("bad", { status: 500 });
  }) as unknown as typeof fetch;

  await assert.rejects(
    () => generateDraft({ title: "相册", material: emptyMaterial, note: "" }, fakeFetch),
    /生成失败/,
  );
  assert.equal(calls, 2);
});

test("提示词带上标题、标题结构与备注", () => {
  const { system, user } = buildPrompt({
    title: "实时美食榜单",
    material: { headings: ["校门口吃什么"], text: "正文", files: ["index.html"], readme: "" },
    note: "最难的是榜单更新时不要闪",
  });

  assert.match(user, /实时美食榜单/);
  assert.match(user, /校门口吃什么/);
  assert.match(user, /不要闪/);
  assert.match(system, /赋能/);
  assert.match(system, /JSON/);
});
