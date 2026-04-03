type OpenAIMessage = {
  role: string;
  content: string;
};

type StreamingChunkInput = {
  id: string;
  model: string;
  content: string;
  created: number;
};

function createChunkEnvelope(
  input: StreamingChunkInput,
  delta: Record<string, unknown>,
  finishReason: string | null,
): string {
  return `data: ${JSON.stringify({
    id: input.id,
    object: "chat.completion.chunk",
    created: input.created,
    model: input.model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  })}\n\n`;
}

function splitForStreaming(content: string): string[] {
  const sentenceChunks = content
    .split(/(?<=[.!?。！？])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (sentenceChunks.length > 1) {
    return sentenceChunks;
  }

  const wordChunks = content
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (wordChunks.length > 1) {
    return wordChunks.map((part, index) =>
      index === wordChunks.length - 1 ? part : `${part} `
    );
  }

  return [content];
}

export function serializeOpenAIMessages(messages: OpenAIMessage[]): string {
  return messages.flatMap((message) => [ `[${message.role}]`, message.content, "" ])
    .slice(0, -1)
    .join("\n");
}

export function buildStreamingChunks(input: StreamingChunkInput): string[] {
  const chunks: string[] = [];

  chunks.push(
    createChunkEnvelope(input, { role: "assistant" }, null),
  );

  for (const part of splitForStreaming(input.content)) {
    chunks.push(
      createChunkEnvelope(input, { content: part }, null),
    );
  }

  chunks.push(
    createChunkEnvelope(input, {}, "stop"),
  );
  chunks.push("data: [DONE]\n\n");
  return chunks;
}
