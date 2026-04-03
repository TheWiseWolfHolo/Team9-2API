import { describe, expect, it } from "vitest";
import {
  createSessionCookieValue,
  extractBearerToken,
  isValidAdminBearer,
  verifySessionCookieValue,
} from "../src/lib/auth.js";

describe("auth helpers", () => {
  it("extracts bearer token only from valid headers", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    expect(extractBearerToken("bearer xyz")).toBe("xyz");
    expect(extractBearerToken("Token abc123")).toBeNull();
    expect(extractBearerToken("")).toBeNull();
  });

  it("validates exact admin bearer token", () => {
    const adminKey = "sk-878030051Xsz...";
    expect(isValidAdminBearer("Bearer sk-878030051Xsz...", adminKey)).toBe(true);
    expect(isValidAdminBearer("Bearer wrong", adminKey)).toBe(false);
  });

  it("creates signed session cookies that verify", async () => {
    const secret = "session-signing-secret";
    const cookie = await createSessionCookieValue(secret, 60);

    expect(cookie.split(".")).toHaveLength(2);
    await expect(verifySessionCookieValue(cookie, secret)).resolves.toBe(true);
    await expect(verifySessionCookieValue(cookie, "wrong-secret")).resolves.toBe(
      false,
    );
  });

  it("rejects expired session cookies", async () => {
    const secret = "session-signing-secret";
    const cookie = await createSessionCookieValue(secret, -1);

    await expect(verifySessionCookieValue(cookie, secret)).resolves.toBe(false);
  });
});
