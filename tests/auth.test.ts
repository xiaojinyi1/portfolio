import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_COOKIE, authCookieHeader, checkPassword, isAuthed, signToken } from "@/lib/auth";

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "portfolio";
});

test("口令正确才通过", () => {
  assert.equal(checkPassword("portfolio"), true);
  assert.equal(checkPassword("wrong"), false);
});

test("没配置 ADMIN_PASSWORD 时一律不通过", () => {
  delete process.env.ADMIN_PASSWORD;
  assert.equal(checkPassword(""), false);
  assert.equal(checkPassword("portfolio"), false);
});

test("带正确 cookie 的请求算已登录", () => {
  const req = new Request("http://x/admin", { headers: { cookie: authCookieHeader() } });
  assert.equal(isAuthed(req), true);
});

test("没 cookie 或 cookie 不对都算未登录", () => {
  assert.equal(isAuthed(new Request("http://x/admin")), false);
  assert.equal(
    isAuthed(new Request("http://x/admin", { headers: { cookie: `${ADMIN_COOKIE}=deadbeef` } })),
    false,
  );
});

test("token 是口令的哈希前 32 位，不泄露明文", () => {
  const token = signToken();
  assert.equal(token.length, 32);
  assert.equal(token.includes("portfolio"), false);
  assert.match(authCookieHeader(), /HttpOnly/);
  assert.match(authCookieHeader(), /SameSite=Lax/);
});
