/**
 * LLM message/model/stream types for the vendored agent core.
 *
 * Adapted from @earendil-works/pi-ai (MIT License, Copyright (c) 2025 Mario Zechner)
 * — the subset of src/types.ts the Overleaf Copilot agent needs: text/thinking
 * content, tool calls, usage accounting, the assistant event protocol, and the
 * Model/Context/Tool shapes the loop passes to the stream function. Multimodal
 * images are kept in the type union for forward compatibility but are never
 * produced by the current tools.
 */

import type { TSchema } from "typebox";

export type Api = string;
export type ProviderId = string;

export interface TextContent {
	type: "text";
	text: string;
	textSignature?: string;
}

export interface ThinkingContent {
	type: "thinking";
	thinking: string;
	thinkingSignature?: string;
	redacted?: boolean;
}

export interface ImageContent {
	type: "image";
	data: string; // base64 encoded image data
	mimeType: string; // e.g. "image/jpeg", "image/png"
}

export interface ToolCall {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, any>;
	thoughtSignature?: string;
}

export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	reasoning?: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
}

export const EMPTY_USAGE: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export interface UserMessage {
	role: "user";
	content: string | (TextContent | ImageContent)[];
	timestamp: number; // Unix timestamp in milliseconds
}

export interface AssistantMessage {
	role: "assistant";
	content: (TextContent | ThinkingContent | ToolCall)[];
	api: Api;
	provider: ProviderId;
	model: string;
	responseModel?: string;
	responseId?: string;
	usage: Usage;
	stopReason: StopReason;
	errorMessage?: string;
	timestamp: number; // Unix timestamp in milliseconds
}

export interface ToolResultMessage<TDetails = any> {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (TextContent | ImageContent)[];
	details?: TDetails;
	usage?: Usage;
	addedToolNames?: string[];
	isError: boolean;
	timestamp: number; // Unix timestamp in milliseconds
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface Tool<TParameters extends TSchema = TSchema> {
	name: string;
	description: string;
	parameters: TParameters;
}

export interface Context {
	systemPrompt?: string;
	messages: Message[];
	tools?: Tool[];
}

/**
 * Event protocol for AssistantMessageEventStream.
 *
 * Streams emit `start` before partial updates, then terminate with either
 * `done` (final successful AssistantMessage) or `error` (final AssistantMessage
 * with stopReason "error" | "aborted" and errorMessage).
 */
export type AssistantMessageEvent =
	| { type: "start"; partial: AssistantMessage }
	| { type: "text_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
	| { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
	| { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
	| { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
	| { type: "done"; reason: Extract<StopReason, "stop" | "length" | "toolUse">; message: AssistantMessage }
	| { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage };

/** Token budgets for each thinking level (token-based providers only). */
export interface ThinkingBudgets {
	minimal?: number;
	low?: number;
	medium?: number;
	high?: number;
}

export type Transport = "sse" | "websocket" | "websocket-cached" | "auto";

export interface ProviderResponse {
	status: number;
	headers: Record<string, string>;
}

/**
 * Options the agent loop forwards to the stream function. The transport /
 * thinking / payload-inspection knobs are part of the upstream loop contract;
 * the local OpenAI-compatible provider ignores them (single transport, no
 * reasoning effort control) but they are kept so the vendored loop stays
 * byte-comparable to upstream.
 */
export interface SimpleStreamOptions {
	temperature?: number;
	maxTokens?: number;
	signal?: AbortSignal;
	apiKey?: string;
	sessionId?: string;
	/** HTTP request timeout (ms) for the underlying provider client. */
	timeoutMs?: number;
	/** Client-side retry attempts for transient failures. */
	maxRetries?: number;
	transport?: Transport;
	reasoning?: string;
	thinkingBudgets?: ThinkingBudgets;
	maxRetryDelayMs?: number;
	onPayload?: (payload: unknown, model: Model<Api>) => unknown | undefined | Promise<unknown | undefined>;
	onResponse?: (response: ProviderResponse, model: Model<Api>) => void | Promise<void>;
}

/**
 * Compatibility overrides for OpenAI-compatible chat-completions endpoints.
 * Auto-detection is overkill for the single GLM-proxy target, so the model
 * descriptor carries explicit values.
 */
export interface OpenAICompatOptions {
	/** Which request field carries the output token cap. Default "max_tokens". */
	maxTokensField?: "max_tokens" | "max_completion_tokens";
	/** Send `stream_options: { include_usage: true }`. Default true. */
	includeUsage?: boolean;
}

export interface ModelCostRates {
	input: number; // $/million tokens
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface Model<TApi extends Api = Api> {
	id: string;
	name: string;
	api: TApi;
	provider: ProviderId;
	baseUrl: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: ModelCostRates;
	contextWindow: number;
	maxTokens: number;
	headers?: Record<string, string>;
	compat?: OpenAICompatOptions;
}
