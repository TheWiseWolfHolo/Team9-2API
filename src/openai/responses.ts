import type { DiscoveredModel } from "../provider/team9/models.js";

type ChatCompletionArgs = {
  id: string;
  model: string;
  content: string;
  created?: number;
};

export function buildModelsResponse(models: DiscoveredModel[]) {
  return {
    object: "list",
    data: models.map((model) => ({
      id: model.id,
      object: "model",
      created: 0,
      owned_by: "team9",
    })),
  };
}

export function buildChatCompletionResponse(args: ChatCompletionArgs) {
  const created = args.created ?? Math.floor(Date.now() / 1000);
  return {
    id: args.id,
    object: "chat.completion",
    created,
    model: args.model,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: args.content,
        },
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
