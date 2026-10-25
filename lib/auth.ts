import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "pf_admin";

function adminPassword(): string {
  return (process.env.ADMIN_PASSWORD ?? "").trim();
}

export function checkPassword(pw: string): boolean {
  const expected = adminPassword();
  if (!expected) return false;
  const given = (pw ?? "").trim();
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** cookie 里不存明文口令，只存它的哈希前缀 */
export function signToken(): string {
  return createHash("sha256").update(adminPassword()).digest("hex").slice(0, 32);
}

function cookieValue(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function isAuthed(req: Request): boolean {
  const expected = signToken();
  if (!adminPassword()) return false;
  const given = cookieValue(req, ADMIN_COOKIE);
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function authCookieHeader(): string {
  return `${ADMIN_COOKIE}=${signToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}
