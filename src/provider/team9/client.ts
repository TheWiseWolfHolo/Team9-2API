import { setTimeout as delay } from "node:timers/promises";
import { buildModelCatalog, type DiscoveredModel, type Team9ChannelSummary } from "./models.js";
import { collectAssistantReply, type Team9Message } from "./messages.js";

export type Team9User = {
  id: string;
  email: string;
  username: string;
  displayName?: string;
};

export type SendPromptArgs = {
  modelId: string;
  channelId?: string;
  prompt: string;
};

export type SendPromptResult = {
  modelId: string;
  channelId: string;
  prompt: string;
  reply: string;
  sentAt: string;
};

export interface Team9Provider {
  getCurrentUser(): Promise<Team9User>;
  discoverModels(): Promise<DiscoveredModel[]>;
  sendPrompt(args: SendPromptArgs): Promise<SendPromptResult>;
}

type ProviderConfig = {
  apiBaseUrl: string;
  authToken: string;
  refreshToken: string;
  tenantId: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

type SendMessageResponse = {
  channelId: string;
  content: string;
  createdAt: string;
};

function ensureOk(response: Response, message: string): void {
  if (!response.ok) {
    throw new Error(`${message}: ${response.status} ${response.statusText}`);
  }
}

export class Team9HttpProvider implements Team9Provider {
  private authToken: string;
  private refreshToken: string;
  private currentUserCache: Team9User | null = null;

  constructor(private readonly config: ProviderConfig) {
    this.authToken = config.authToken;
    this.refreshToken = config.refreshToken;
  }

  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(`${this.config.apiBaseUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    ensureOk(response, "Failed to refresh Team9 token");
    const body = await response.json() as RefreshResponse;
    this.authToken = body.accessToken;
    this.refreshToken = body.refreshToken;
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const execute = async () => {
      const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.authToken}`,
          "X-Tenant-Id": this.config.tenantId,
          ...(init?.headers ?? {}),
        },
      });

      if (response.status === 401) {
        await this.refreshAccessToken();
        return null;
      }

      ensureOk(response, `Team9 request failed for ${path}`);
      return await response.json() as T;
    };

    const first = await execute();
    if (first !== null) return first;

    const retried = await fetch(`${this.config.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
        "X-Tenant-Id": this.config.tenantId,
        ...(init?.headers ?? {}),
      },
    });
    ensureOk(retried, `Team9 retry failed for ${path}`);
    return await retried.json() as T;
  }

  async getCurrentUser(): Promise<Team9User> {
    if (this.currentUserCache) return this.currentUserCache;
    const user = await this.fetchJson<Team9User>("/v1/auth/me");
    this.currentUserCache = user;
    return user;
  }

  async discoverModels(): Promise<DiscoveredModel[]> {
    const channels = await this.fetchJson<Team9ChannelSummary[]>("/v1/im/channels");
    return buildModelCatalog(channels);
  }

  private async getMessages(channelId: string, limit = 20): Promise<Team9Message[]> {
    return await this.fetchJson<Team9Message[]>(
      `/v1/im/channels/${channelId}/messages?limit=${limit}`,
    );
  }

  private async sendMessage(channelId: string, prompt: string): Promise<SendMessageResponse> {
    return await this.fetchJson<SendMessageResponse>(
      `/v1/im/channels/${channelId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content: prompt,
          type: "text",
        }),
      },
    );
  }

  async sendPrompt(args: SendPromptArgs): Promise<SendPromptResult> {
    const user = await this.getCurrentUser();
    const catalog = await this.discoverModels();
    const target = catalog.find((item) => item.id === args.modelId);
    const channelId = args.channelId ?? target?.channelId;

    if (!channelId) {
      throw new Error(`Unknown model id: ${args.modelId}`);
    }

    const sent = await this.sendMessage(channelId, args.prompt);
    const sentAt = sent.createdAt;
    const deadline = Date.now() + (this.config.pollTimeoutMs ?? 45_000);

    while (Date.now() < deadline) {
      const messages = await this.getMessages(channelId);
      const reply = collectAssistantReply(messages, {
        currentUserId: user.id,
        sentAt,
      });

      if (reply) {
        return {
          modelId: args.modelId,
          channelId,
          prompt: args.prompt,
          reply,
          sentAt,
        };
      }

      await delay(this.config.pollIntervalMs ?? 1_000);
    }

    throw new Error(`Timed out waiting for Team9 reply for model ${args.modelId}`);
  }
}
