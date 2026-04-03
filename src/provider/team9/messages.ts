export type Team9Message = {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

type ReplySelectionContext = {
  currentUserId: string;
  sentAt: string;
};

function isStatusOnlyMessage(message: Team9Message): boolean {
  const agentEventType = message.metadata?.agentEventType;
  const status = message.metadata?.status;

  return message.content.trim() === "Execution complete." ||
    agentEventType === "agent_end" ||
    status === "completed";
}

export function collectAssistantReply(
  messages: Team9Message[],
  context: ReplySelectionContext,
): string | null {
  const sentAtMs = Date.parse(context.sentAt);
  const collected = messages
    .filter((message) =>
      message.senderId !== context.currentUserId &&
      Date.parse(message.createdAt) >= sentAtMs &&
      !isStatusOnlyMessage(message) &&
      message.content.trim()
    )
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .map((message) => message.content.trim());

  const deduplicated: string[] = [];
  const seen = new Set<string>();
  for (const content of collected) {
    if (seen.has(content)) continue;
    seen.add(content);
    deduplicated.push(content);
  }

  return deduplicated.length > 0 ? deduplicated.join("\n\n") : null;
}
