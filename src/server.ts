import { join } from "node:path";
import { createApp } from "./app.js";
import { Team9HttpProvider } from "./provider/team9/client.js";
import { FileCatalogStore } from "./store/catalog-store.js";

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const port = Number(process.env.PORT ?? "3000");
const dataDir = process.env.DATA_DIR ?? "/app/data";
const sessionCookieSecure = process.env.SESSION_COOKIE_SECURE !== "false";
const sessionTtlSeconds = Number(process.env.ADMIN_SESSION_TTL_SECONDS ?? "28800");

const app = createApp({
  adminApiKey: getEnv("ADMIN_API_KEY"),
  sessionSigningKey: getEnv("SESSION_SIGNING_KEY"),
  provider: new Team9HttpProvider({
    apiBaseUrl: process.env.TEAM9_API_BASE_URL ?? "https://api.team9.ai/api",
    authToken: getEnv("TEAM9_AUTH_TOKEN"),
    refreshToken: getEnv("TEAM9_REFRESH_TOKEN"),
    tenantId: getEnv("TEAM9_TENANT_ID"),
  }),
  store: new FileCatalogStore(join(dataDir, "catalog.json")),
  sessionCookieSecure,
  sessionTtlSeconds,
});

app.listen({ host: "0.0.0.0", port }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
