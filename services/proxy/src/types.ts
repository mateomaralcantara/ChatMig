export type Provider =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "cohere"
  | "bedrock-meta";

export type Role = "user" | "assistant" | "system";

export interface ChatMessagePayload {
  role: Role;
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages?: ChatMessagePayload[];
  query?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  meta?: Record<string, unknown>;
}

export interface Adapter {
  stream(req: Required<ChatRequest>, res: import("express").Response): Promise<void>;
  complete(req: Required<ChatRequest>): Promise<string>;
}

