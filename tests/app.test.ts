import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Team9Provider } from "../src/provider/team9/client.js";
import type { CatalogStore } from "../src/store/catalog-store.js";

function createProviderStub(): Team9Provider {
  return {
    getCurrentUser: async () => ({
      id: "human-user",
      email: "test@example.com",
      username: "tester",
      displayName: "Tester",
    }),
    discoverModels: async () => [
      {
        id: "chatgpt",
        channelId: "chan-chatgpt",
        displayName: "ChatGPT",
        username: "chatgpt_bot",
      },
      {
        id: "gemini",
        channelId: "chan-gemini",
        displayName: "Gemini",
        username: "gemini_bot",
      },
      {
        id: "claude",
        channelId: "chan-claude",
        displayName: "Claude",
        username: "claude_bot",
      },
    ],
    sendPrompt: async ({ modelId, prompt }) => ({
      modelId,
      prompt,
      reply: `reply:${prompt}`,
      sentAt: "2026-04-04T01:00:00.000Z",
      channelId: `chan-${modelId}`,
    }),
  };
}

function createStoreStub(): CatalogStore {
  let models = [
    {
      id: "chatgpt",
      channelId: "chan-chatgpt",
      displayName: "ChatGPT",
      username: "chatgpt_bot",
    },
    {
      id: "gemini",
      channelId: "chan-gemini",
      displayName: "Gemini",
      username: "gemini_bot",
    },
    {
      id: "claude",
      channelId: "chan-claude",
      displayName: "Claude",
      username: "claude_bot",
    },
  ];
  let discoveredAt: string | null = "2026-04-04T01:00:00.000Z";

  return {
    async loadCatalog() {
      return { models, discoveredAt };
    },
    async saveCatalog(next) {
      models = next.models;
      discoveredAt = next.discoveredAt;
    },
  };
}

describe("app routes", () => {
  const adminKey = "sk-878030051Xsz...";

  it("serves healthz without auth", async () => {
    const app = createApp({
      adminApiKey: adminKey,
      sessionSigningKey: "session-secret",
      provider: createProviderStub(),
      store: createStoreStub(),
    });

    const response = await app.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it("protects models endpoint with bearer auth", async () => {
    const app = createApp({
      adminApiKey: adminKey,
      sessionSigningKey: "session-secret",
      provider: createProviderStub(),
      store: createStoreStub(),
    });

    const unauthorized = await app.inject({
      method: "GET",
      url: "/v1/models",
    });
    expect(unauthorized.statusCode).toBe(401);

    const authorized = await app.inject({
      method: "GET",
      url: "/v1/models",
      headers: {
        authorization: `Bearer ${adminKey}`,
      },
    });

    expect(authorized.statusCode).toBe(200);
    expect(authorized.json().data.map((item: { id: string }) => item.id)).toEqual([
      "chatgpt",
      "gemini",
      "claude",
    ]);
    await app.close();
  });

  it("supports non-stream chat completions", async () => {
    const app = createApp({
      adminApiKey: adminKey,
      sessionSigningKey: "session-secret",
      provider: createProviderStub(),
      store: createStoreStub(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: `Bearer ${adminKey}`,
      },
      payload: {
        model: "claude",
        stream: false,
        messages: [{ role: "user", content: "hello" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("reply:[user]\nhello");
    await app.close();
  });

  it("supports stream chat completions", async () => {
    const app = createApp({
      adminApiKey: adminKey,
      sessionSigningKey: "session-secret",
      provider: createProviderStub(),
      store: createStoreStub(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        authorization: `Bearer ${adminKey}`,
      },
      payload: {
        model: "claude",
        stream: true,
        messages: [{ role: "user", content: "hello" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("chat.completion.chunk");
    expect(response.body).toContain("[DONE]");
    await app.close();
  });

  it("creates session cookie for admin login and reuses it on admin endpoints", async () => {
    const app = createApp({
      adminApiKey: adminKey,
      sessionSigningKey: "session-secret",
      provider: createProviderStub(),
      store: createStoreStub(),
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/admin/login",
      payload: { key: adminKey },
    });

    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((item) => item.name === "team9_admin_session");
    expect(cookie?.value).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      cookies: {
        team9_admin_session: cookie!.value,
      },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ authenticated: true });
    await app.close();
  });
});
