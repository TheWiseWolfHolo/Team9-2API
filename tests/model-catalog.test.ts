import { describe, expect, it } from "vitest";
import {
  buildModelCatalog,
  type Team9ChannelSummary,
} from "../src/provider/team9/models.js";

describe("model catalog", () => {
  it("keeps only direct bot channels", () => {
    const channels: Team9ChannelSummary[] = [
      {
        id: "chan-public",
        type: "public",
        name: "welcome",
        otherUser: null,
      },
      {
        id: "chan-claude",
        type: "direct",
        name: null,
        otherUser: {
          id: "bot-1",
          username: "claude_bot",
          displayName: "Claude",
          userType: "bot",
          agentType: "base_model",
        },
      },
      {
        id: "chan-human",
        type: "direct",
        name: null,
        otherUser: {
          id: "user-1",
          username: "alice",
          displayName: "Alice",
          userType: "human",
          agentType: null,
        },
      },
    ];

    const models = buildModelCatalog(channels);

    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe("claude");
    expect(models[0]?.channelId).toBe("chan-claude");
    expect(models[0]?.displayName).toBe("Claude");
  });

  it("disambiguates duplicate bot names with channel suffix", () => {
    const channels: Team9ChannelSummary[] = [
      {
        id: "019d53fb-7581-747f-bbc8-81b22ace9237",
        type: "direct",
        name: null,
        otherUser: {
          id: "bot-1",
          username: "claude_bot_one",
          displayName: "Claude",
          userType: "bot",
          agentType: "base_model",
        },
      },
      {
        id: "019d53fb-7601-71fa-a293-fafbed390e45",
        type: "direct",
        name: null,
        otherUser: {
          id: "bot-2",
          username: "claude_bot_two",
          displayName: "Claude",
          userType: "bot",
          agentType: "base_model",
        },
      },
    ];

    const models = buildModelCatalog(channels);

    expect(models).toHaveLength(2);
    expect(models[0]?.id).toBe("claude");
    expect(models[1]?.id).toBe("claude-2");
  });
});
