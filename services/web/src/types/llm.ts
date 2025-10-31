/* ============================================================================
   Tipos + Catálogo multi-LLM (frontend)
   - Proveedores soportados y normalización de alias
   - Metadatos de modelos (context window, max tokens, capacidades)
   - Utilidades para escoger provider/model, clamping de tokens, etc.
   ========================================================================== */

   export type Provider =
   | "openai"
   | "anthropic"
   | "google"   // Gemini
   | "mistral"
   | "cohere"
   | "bedrock"; // AWS Bedrock
 
 export type StyleFormat = "sections" | "bullets" | "paragraphs";
 
 export interface ChatStyle {
   tone?: string;
   useEmojis?: boolean;
   lengthWords?: number;
   format?: StyleFormat;
   audience?: string;
   language?: string;
   guidelines?: string;
 }
 
 export interface ChatMessagePayload {
   role: "system" | "user" | "assistant" | "tool";
   content: string;
 }
 
 export interface ChatRequest {
   // Usa UNO: query (texto plano) o messages (chat estructurado)
   query?: string;
   messages?: ChatMessagePayload[];
   style?: ChatStyle;
   model?: string;
   temperature?: number;
   top_p?: number;
   max_tokens?: number; // tokens de salida deseados
   meta?: Record<string, unknown>;
 }
 
 export interface ModelInfo {
   id: string;
   label?: string;
   family?: string;
   contextWindow?: number;
   maxOutputTokens?: number;
   supportsJson?: boolean;
   supportsVision?: boolean;
   supportsAudio?: boolean;
 }
 
 export interface ProviderInfo {
   id: Provider;
   label: string;
   models: ModelInfo[];
   defaultModel: string;
 }
 
 export const LLM_STORAGE_KEYS = {
   provider: "chatmig.llm.provider",
   model: "chatmig.llm.model",
 };
 
 /* --------------------------------- Catálogo -------------------------------- */
 
 const OPENAI_MODELS: ModelInfo[] = [
   { id: "gpt-4o",                family: "gpt-4", contextWindow: 128_000, maxOutputTokens: 16_000, supportsVision: true,  supportsJson: true },
   { id: "gpt-4o-mini",           family: "gpt-4", contextWindow: 128_000, maxOutputTokens: 16_000, supportsVision: true,  supportsJson: true },
   { id: "gpt-4.1",               family: "gpt-4", contextWindow: 128_000, maxOutputTokens: 16_000, supportsVision: true,  supportsJson: true },
   { id: "gpt-4.1-mini",          family: "gpt-4", contextWindow: 128_000, maxOutputTokens: 16_000, supportsVision: true,  supportsJson: true },
   { id: "gpt-3.5-turbo",         family: "gpt-3.5", contextWindow: 16_000, maxOutputTokens: 4_096, supportsJson: true },
 ];
 
 const ANTHROPIC_MODELS: ModelInfo[] = [
   { id: "claude-3-5-sonnet-20240620", family: "claude-3.5", contextWindow: 200_000, maxOutputTokens: 8_192, supportsVision: true },
   { id: "claude-3-opus-20240229",     family: "claude-3",   contextWindow: 200_000, maxOutputTokens: 8_192, supportsVision: true },
   { id: "claude-3-haiku-20240307",    family: "claude-3",   contextWindow: 200_000, maxOutputTokens: 4_096, supportsVision: true },
 ];
 
 const GOOGLE_MODELS: ModelInfo[] = [
   { id: "gemini-1.5-pro",   family: "gemini-1.5", contextWindow: 1_000_000, maxOutputTokens: 8_192, supportsVision: true, supportsAudio: true },
   { id: "gemini-1.5-flash", family: "gemini-1.5", contextWindow: 1_000_000, maxOutputTokens: 8_192, supportsVision: true, supportsAudio: true },
 ];
 
 const MISTRAL_MODELS: ModelInfo[] = [
   { id: "mistral-large-latest", family: "mistral", contextWindow: 32_000, maxOutputTokens: 8_192, supportsJson: true },
   { id: "mistral-small-latest", family: "mistral", contextWindow: 32_000, maxOutputTokens: 8_192, supportsJson: true },
   { id: "codestral-latest",     family: "mistral", contextWindow: 32_000, maxOutputTokens: 8_192, supportsJson: true },
 ];
 
 const COHERE_MODELS: ModelInfo[] = [
   { id: "command-r-plus", family: "command", contextWindow: 128_000, maxOutputTokens: 4_096, supportsJson: true },
   { id: "command-r",      family: "command", contextWindow: 128_000, maxOutputTokens: 4_096, supportsJson: true },
   { id: "command",        family: "command", contextWindow:  8_192,  maxOutputTokens: 2_048, supportsJson: true },
 ];
 
 const BEDROCK_MODELS: ModelInfo[] = [
   // Ajusta a tu región: ids de Bedrock pueden variar.
   { id: "meta.llama3-70b-instruct-v1:0", family: "llama3", contextWindow: 8_192,  maxOutputTokens: 4_096, supportsJson: true },
   { id: "meta.llama3-8b-instruct-v1:0",  family: "llama3", contextWindow: 8_192,  maxOutputTokens: 4_096, supportsJson: true },
 ];
 
 export const PROVIDERS: ProviderInfo[] = [
   { id: "openai",     label: "OpenAI",          models: OPENAI_MODELS,     defaultModel: "gpt-4o-mini" },
   { id: "anthropic",  label: "Anthropic",       models: ANTHROPIC_MODELS,  defaultModel: "claude-3-5-sonnet-20240620" },
   { id: "google",     label: "Google (Gemini)", models: GOOGLE_MODELS,     defaultModel: "gemini-1.5-pro" },
   { id: "mistral",    label: "Mistral",         models: MISTRAL_MODELS,    defaultModel: "mistral-large-latest" },
   { id: "cohere",     label: "Cohere",          models: COHERE_MODELS,     defaultModel: "command-r" },
   { id: "bedrock",    label: "AWS Bedrock",     models: BEDROCK_MODELS,    defaultModel: "meta.llama3-70b-instruct-v1:0" },
 ];
 
 /* ----------------------------- Normalización ------------------------------ */
 
 export function normalizeProvider(input?: string): Provider {
   const s = (input || "").toLowerCase().trim();
   if (["gemini", "google", "googleai"].includes(s)) return "google";
   if (["aws", "bedrock", "amazon"].includes(s)) return "bedrock";
   if (s === "anthropic") return "anthropic";
   if (s === "mistral") return "mistral";
   if (s === "cohere") return "cohere";
   return "openai";
 }
 
 export function getProviderInfo(p: Provider): ProviderInfo {
   return PROVIDERS.find((x) => x.id === p)!;
 }
 
 export function listModels(p: Provider): string[] {
   return getProviderInfo(p).models.map((m) => m.id);
 }
 
 export function getModelInfo(p: Provider, model?: string): ModelInfo | undefined {
   const cat = getProviderInfo(p).models;
   if (!model) return cat.find((m) => m.id === getProviderInfo(p).defaultModel);
   return cat.find((m) => m.id === model);
 }
 
 export function resolveModel(provider: Provider, candidate?: string): string {
   const cat = listModels(provider);
   if (candidate && cat.includes(candidate)) return candidate;
   return getProviderInfo(provider).defaultModel;
 }
 
 /* ------------------------------ Token helpers ----------------------------- */
 
 export function clampOutputTokens(
   provider: Provider,
   model: string | undefined,
   desired?: number
 ): number | undefined {
   const info = getModelInfo(provider, model);
   if (!info) return desired;
   if (!desired) return info.maxOutputTokens;
   if (!info.maxOutputTokens) return desired;
   return Math.min(desired, info.maxOutputTokens);
 }
 
 /* --------------------------- Conversión de estilos ------------------------- */
 
 export function buildSystemFromStyle(style?: ChatStyle): string | undefined {
   if (!style) return;
   const parts: string[] = [];
   if (style.tone) parts.push(`Tono: ${style.tone}.`);
   if (style.format) parts.push(`Formato: ${style.format}.`);
   if (style.audience) parts.push(`Audiencia: ${style.audience}.`);
   if (style.lengthWords) parts.push(`Extensión aprox.: ${style.lengthWords} palabras.`);
   if (style.guidelines) parts.push(style.guidelines);
   if (!parts.length) return;
   return parts.join(" ");
 }
 
 /**
  * Si te pasan query (texto plano) y quieres convertir a messages para un proxy
  * que prefiere chat estructurado.
  */
 export function toMessagesFromQuery(query: string, style?: ChatStyle): ChatMessagePayload[] {
   const sys = buildSystemFromStyle(style);
   const msgs: ChatMessagePayload[] = [];
   if (sys) msgs.push({ role: "system", content: sys });
   msgs.push({ role: "user", content: query });
   return msgs;
 }
 
