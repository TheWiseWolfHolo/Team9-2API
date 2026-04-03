export type Team9OtherUser = {
  id: string;
  username: string;
  displayName: string | null;
  userType: "bot" | "human" | string;
  agentType: string | null;
};

export type Team9ChannelSummary = {
  id: string;
  type: "direct" | "public" | string;
  name: string | null;
  otherUser: Team9OtherUser | null;
};

export type DiscoveredModel = {
  id: string;
  channelId: string;
  displayName: string;
  username: string;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function canonicalizeModelName(rawName: string): string {
  const lower = rawName.toLowerCase();
  if (lower.includes("chatgpt")) return "chatgpt";
  if (lower.includes("gemini")) return "gemini";
  if (lower.includes("claude")) return "claude";
  return slugify(rawName) || "team9-model";
}

function pickSourceName(channel: Team9ChannelSummary): string {
  return channel.otherUser?.displayName?.trim() ||
    channel.otherUser?.username?.trim() ||
    channel.name?.trim() ||
    channel.id;
}

export function buildModelCatalog(
  channels: Team9ChannelSummary[],
): DiscoveredModel[] {
  const botChannels = channels.filter((channel) =>
    channel.type === "direct" &&
    channel.otherUser?.userType === "bot"
  );

  const counts = new Map<string, number>();

  return botChannels.map((channel) => {
    const sourceName = pickSourceName(channel);
    const canonical = canonicalizeModelName(sourceName);
    const nextIndex = (counts.get(canonical) ?? 0) + 1;
    counts.set(canonical, nextIndex);

    return {
      id: nextIndex === 1 ? canonical : `${canonical}-${nextIndex}`,
      channelId: channel.id,
      displayName: channel.otherUser?.displayName || sourceName,
      username: channel.otherUser?.username || canonical,
    };
  });
}
