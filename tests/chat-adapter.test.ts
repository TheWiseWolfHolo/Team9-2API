import { describe, expect, it } from "vitest";
import { buildStreamingChunks, serializeOpenAIMessages } from "../src/openai/streaming.js";
import {
  collectAssistantReply,
  type Team9Message,
} from "../src/provider/team9/messages.js";

describe("chat adapter", () => {
  it("serializes OpenAI messages in role order", () => {
    const serialized = serializeOpenAIMessages([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi!" },
      { role: "user", content: "what can you do?" },
    ]);

    expect(serialized).toBe(
      [
        "[system]",
        "You are helpful.",
        "",
        "[user]",
        "hello",
        "",
        "[assistant]",
        "hi!",
        "",
        "[user]",
        "what can you do?",
      ].join("\n"),
    );
  });

  it("ignores status-only messages and returns assistant content", () => {
    const messages: Team9Message[] = [
      {
        id: "assistant-2",
        senderId: "bot-user",
        content: "Execution complete.",
        createdAt: "2026-04-03T16:18:46.161Z",
        metadata: { status: "completed", agentEventType: "agent_end" },
      },
      {
        id: "assistant-1",
        senderId: "bot-user",
        content: "Hello, Tymin! 👋",
        createdAt: "2026-04-03T16:18:45.962Z",
        metadata: null,
      },
      {
        id: "human-1",
        senderId: "human-user",
        content: "hello from probe",
        createdAt: "2026-04-03T16:18:40.800Z",
        metadata: null,
      },
    ];

    expect(
      collectAssistantReply(messages, {
        currentUserId: "human-user",
        sentAt: "2026-04-03T16:18:40.800Z",
      }),
    ).toBe("Hello, Tymin! 👋");
  });

  it("deduplicates identical assistant replies within the same turn", () => {
    const messages: Team9Message[] = [
      {
        id: "assistant-dup-1",
        senderId: "bot-user",
        content: "Same final answer",
        createdAt: "2026-04-03T18:26:12.317Z",
        metadata: null,
      },
      {
        id: "assistant-dup-2",
        senderId: "bot-user",
        content: "Same final answer",
        createdAt: "2026-04-03T18:26:12.318Z",
        metadata: null,
      },
      {
        id: "assistant-tool",
        senderId: "bot-user",
        content: "SendToChannel",
        createdAt: "2026-04-03T18:26:12.526Z",
        metadata: {
          status: "completed",
          agentEventType: "tool_call",
        },
      },
    ];

    expect(
      collectAssistantReply(messages, {
        currentUserId: "human-user",
        sentAt: "2026-04-03T18:26:12.000Z",
      }),
    ).toBe("Same final answer");
  });

  it("builds OpenAI-compatible SSE chunks", () => {
    const chunks = buildStreamingChunks({
      id: "chatcmpl-test",
      model: "claude",
      content: "Hello world!",
      created: 1775233123,
    });

    expect(chunks[0]).toContain('"role":"assistant"');
    expect(chunks.some((chunk) => chunk.includes("Hello"))).toBe(true);
    expect(chunks.at(-2)).toContain('"finish_reason":"stop"');
    expect(chunks.at(-1)).toBe("data: [DONE]\n\n");
  });
});
