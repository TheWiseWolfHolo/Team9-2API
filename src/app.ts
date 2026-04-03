import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { join } from "node:path";
import {
  createSessionCookieValue,
  extractBearerToken,
  isValidAdminBearer,
  verifySessionCookieValue,
} from "./lib/auth.js";
import { buildChatCompletionResponse, buildModelsResponse } from "./openai/responses.js";
import { buildStreamingChunks, serializeOpenAIMessages } from "./openai/streaming.js";
import type { Team9Provider } from "./provider/team9/client.js";
import type { CatalogStore } from "./store/catalog-store.js";

type CreateAppOptions = {
  adminApiKey: string;
  sessionSigningKey: string;
  provider: Team9Provider;
  store: CatalogStore;
  sessionCookieSecure?: boolean;
  sessionTtlSeconds?: number;
};

type ChatCompletionBody = {
  model?: string;
  stream?: boolean;
  messages?: Array<{ role: string; content: string }>;
};

type AuthorizedRequest = FastifyRequest & {
  authMode?: "bearer" | "session";
};

const SESSION_COOKIE_NAME = "team9_admin_session";
const publicDir = join(process.cwd(), "public");

async function ensureCatalog(
  provider: Team9Provider,
  store: CatalogStore,
) {
  const existing = await store.loadCatalog();
  if (existing.models.length > 0) {
    return existing.models;
  }

  const models = await provider.discoverModels();
  await store.saveCatalog({
    models,
    discoveredAt: new Date().toISOString(),
  });
  return models;
}

function sendUnauthorized(reply: FastifyReply) {
  return reply.code(401).send({
    error: {
      message: "Unauthorized",
      type: "authentication_error",
      param: null,
      code: null,
    },
  });
}

export function createApp(options: CreateAppOptions) {
  const app = Fastify({ logger: true });
  app.register(cookie, {
    hook: "onRequest",
  });
  app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/public/",
  });

  const requireBearer = async (
    request: AuthorizedRequest,
    reply: FastifyReply,
  ) => {
    if (!isValidAdminBearer(request.headers.authorization, options.adminApiKey)) {
      return sendUnauthorized(reply);
    }
    request.authMode = "bearer";
  };

  const requireSessionOrBearer = async (
    request: AuthorizedRequest,
    reply: FastifyReply,
  ) => {
    if (isValidAdminBearer(request.headers.authorization, options.adminApiKey)) {
      request.authMode = "bearer";
      return;
    }

    const cookieValue = request.cookies[SESSION_COOKIE_NAME];
    const isValidSession = await verifySessionCookieValue(
      cookieValue,
      options.sessionSigningKey,
    );
    if (!isValidSession) {
      return sendUnauthorized(reply);
    }
    request.authMode = "session";
  };

  app.get("/healthz", async () => ({ ok: true }));

  app.post("/api/admin/login", async (request, reply) => {
    const body = (request.body ?? {}) as { key?: string };
    if (body.key !== options.adminApiKey) {
      return sendUnauthorized(reply);
    }

    const sessionValue = await createSessionCookieValue(
      options.sessionSigningKey,
      options.sessionTtlSeconds ?? 60 * 60 * 8,
    );

    reply.setCookie(SESSION_COOKIE_NAME, sessionValue, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: options.sessionCookieSecure ?? false,
    });

    return reply.send({ authenticated: true });
  });

  app.post(
    "/api/admin/logout",
    { preHandler: requireSessionOrBearer },
    async (_request, reply) => {
      reply.clearCookie(SESSION_COOKIE_NAME, {
        path: "/",
      });
      return reply.send({ authenticated: false });
    },
  );

  app.get(
    "/api/admin/me",
    { preHandler: requireSessionOrBearer },
    async () => ({ authenticated: true }),
  );

  app.get(
    "/api/admin/models",
    { preHandler: requireSessionOrBearer },
    async () => {
      const models = await ensureCatalog(options.provider, options.store);
      return {
        discoveredAt: (await options.store.loadCatalog()).discoveredAt,
        models,
      };
    },
  );

  app.post(
    "/api/admin/models/discover",
    { preHandler: requireSessionOrBearer },
    async () => {
      const models = await options.provider.discoverModels();
      const discoveredAt = new Date().toISOString();
      await options.store.saveCatalog({ models, discoveredAt });
      return { discoveredAt, models };
    },
  );

  app.post(
    "/api/admin/models/refresh",
    { preHandler: requireSessionOrBearer },
    async () => {
      const models = await options.provider.discoverModels();
      const discoveredAt = new Date().toISOString();
      await options.store.saveCatalog({ models, discoveredAt });
      return { discoveredAt, models };
    },
  );

  app.post(
    "/api/admin/probe/send",
    { preHandler: requireSessionOrBearer },
    async (request) => {
      const body = (request.body ?? {}) as { model?: string; prompt?: string };
      if (!body.model || !body.prompt) {
        throw new Error("Probe requires model and prompt");
      }
      return await options.provider.sendPrompt({
        modelId: body.model,
        prompt: body.prompt,
      });
    },
  );

  app.get(
    "/v1/models",
    { preHandler: requireBearer },
    async () => {
      const models = await ensureCatalog(options.provider, options.store);
      return buildModelsResponse(models);
    },
  );

  app.post(
    "/v1/chat/completions",
    { preHandler: requireBearer },
    async (request, reply) => {
      const body = (request.body ?? {}) as ChatCompletionBody;

      if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
        return reply.code(400).send({
          error: {
            message: "model and messages are required",
            type: "invalid_request_error",
            param: null,
            code: null,
          },
        });
      }

      const models = await ensureCatalog(options.provider, options.store);
      const model = models.find((item) => item.id === body.model);
      if (!model) {
        return reply.code(400).send({
          error: {
            message: `Unknown model: ${body.model}`,
            type: "invalid_request_error",
            param: "model",
            code: null,
          },
        });
      }

      const prompt = serializeOpenAIMessages(body.messages);
      const upstream = await options.provider.sendPrompt({
        modelId: model.id,
        channelId: model.channelId,
        prompt,
      });

      if (body.stream === true) {
        const chunks = buildStreamingChunks({
          id: `chatcmpl-${randomUUID()}`,
          model: model.id,
          content: upstream.reply,
          created: Math.floor(Date.now() / 1000),
        });

        reply.header("Content-Type", "text/event-stream; charset=utf-8");
        reply.header("Cache-Control", "no-cache, no-transform");
        reply.header("Connection", "keep-alive");
        return reply.send(Readable.from(chunks));
      }

      return reply.send(
        buildChatCompletionResponse({
          id: `chatcmpl-${randomUUID()}`,
          model: model.id,
          content: upstream.reply,
        }),
      );
    },
  );

  app.get("/", async (request, reply) => {
    const sessionValue = request.cookies[SESSION_COOKIE_NAME];
    const hasSession = await verifySessionCookieValue(
      sessionValue,
      options.sessionSigningKey,
    );
    return reply.redirect(hasSession ? "/admin" : "/login");
  });

  app.get("/login", async (_request, reply) => {
    return reply.sendFile("login.html");
  });

  app.get("/admin", { preHandler: requireSessionOrBearer }, async (_request, reply) => {
    return reply.sendFile("admin.html");
  });

  return app;
}
