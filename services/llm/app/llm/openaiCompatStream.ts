/**
 * Minimal OpenAI-compatible chat-completions streaming provider.
 *
 * Adapted from @earendil-works/pi-ai (MIT License, Copyright (c) 2025 Mario Zechner)
 * — src/api/openai-completions.ts, stripped to the single-endpoint case the
 * Overleaf Copilot runs against (an OpenAI-compatible proxy such as GLM /
 * DeepSeek / any custom baseUrl the user configures):
 *
 *   - no provider auto-detection matrix (compat knobs are explicit on the
 *     Model descriptor: `maxTokensField`, `includeUsage`)
 *   - no images / cache control / session affinity / routing preferences
 *   - no thinking-parameter mapping (the provider default applies); streamed
 *     `reasoning_content` / `reasoning` deltas ARE parsed into thinking blocks
 *     and replayed verbatim on multi-turn histories, which is what GLM-style
 *     endpoints expect
 *
 * The stream contract matches the vendored agent core: never throw; failures
 * are encoded as a final AssistantMessage with stopReason "error" | "aborted".
 */

import OpenAI from "openai";
import type {
	AssistantMessage,
	Context,
	Message,
	Model,
	SimpleStreamOptions,
	StopReason,
	TextContent,
	ThinkingContent,
	Tool,
	ToolCall,
} from "../agent/core/llm-types.js";
import { EMPTY_USAGE } from "../agent/core/llm-types.js";
import { AssistantMessageEventStream } from "../agent/core/event-stream.js";
import { parseStreamingJson } from "../agent/core/json-parse.js";
import { formatProviderError, normalizeProviderError } from "../agent/core/error-body.js";
import { sanitizeSurrogates } from "../agent/core/sanitize-unicode.js";

export const OPENAI_COMPAT_API = "openai-completions";

/** Build the Model descriptor the agent loop carries for one (baseUrl, modelId) pair. */
export function createOpenAICompatModel({
	baseUrl,
	modelId,
	maxTokensField = "max_tokens",
	contextWindow = 128_000,
	maxTokens = 5000,
}: {
	baseUrl: string;
	modelId: string;
	maxTokensField?: "max_tokens" | "max_completion_tokens";
	contextWindow?: number;
	maxTokens?: number;
}): Model<typeof OPENAI_COMPAT_API> {
	return {
		id: modelId,
		name: modelId,
		api: OPENAI_COMPAT_API,
		provider: "openai-compat",
		baseUrl,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens,
		compat: { maxTokensField, includeUsage: true },
	};
}

function hasToolHistory(messages: Message[]): boolean {
	for (const msg of messages) {
		if (msg.role === "toolResult") {
			return true;
		}
		if (msg.role === "assistant" && msg.content.some((block) => block.type === "toolCall")) {
			return true;
		}
	}
	return false;
}

function isTextContentBlock(block: { type: string }): block is TextContent {
	return block.type === "text";
}

function isThinkingContentBlock(block: { type: string }): block is ThinkingContent {
	return block.type === "thinking";
}

function isToolCallBlock(block: { type: string }): block is ToolCall {
	return block.type === "toolCall";
}

function convertMessages(context: Context): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
	const params: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

	if (context.systemPrompt) {
		params.push({ role: "system", content: sanitizeSurrogates(context.systemPrompt) });
	}

	for (const msg of context.messages) {
		if (msg.role === "user") {
			if (typeof msg.content === "string") {
				params.push({ role: "user", content: sanitizeSurrogates(msg.content) });
			} else {
				const text = msg.content
					.filter(isTextContentBlock)
					.map((block) => block.text)
					.join("\n");
				if (text.length === 0) continue;
				params.push({ role: "user", content: sanitizeSurrogates(text) });
			}
			continue;
		}

		if (msg.role === "assistant") {
			const assistantText = msg.content
				.filter(isTextContentBlock)
				.filter((block) => block.text.trim().length > 0)
				.map((block) => sanitizeSurrogates(block.text))
				.join("");

			const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
				role: "assistant",
				content: assistantText.length > 0 ? assistantText : null,
			};

			// Replay thinking content the endpoint streamed back to us (GLM-style
			// reasoning_content): multi-turn tool-calling endpoints expect the
			// reasoning that preceded a tool call to round-trip.
			const thinkingText = msg.content
				.filter(isThinkingContentBlock)
				.filter((block) => block.thinking.trim().length > 0)
				.map((block) => block.thinking)
				.join("\n");
			if (thinkingText.length > 0) {
				const signature = msg.content.filter(isThinkingContentBlock)[0]?.thinkingSignature;
				(assistantMsg as any)[signature && signature.length > 0 ? signature : "reasoning_content"] = thinkingText;
			}

			const toolCalls = msg.content.filter(isToolCallBlock);
			if (toolCalls.length > 0) {
				assistantMsg.tool_calls = toolCalls.map((tc) => ({
					id: tc.id,
					type: "function" as const,
					function: {
						name: tc.name,
						arguments: JSON.stringify(tc.arguments),
					},
				}));
			}

			// Skip assistant messages that have neither content nor tool calls —
			// strict providers reject empty assistant turns (e.g. an aborted
			// response that produced nothing).
			const hasContent = typeof assistantMsg.content === "string" && assistantMsg.content.length > 0;
			if (!hasContent && !assistantMsg.tool_calls) {
				continue;
			}
			params.push(assistantMsg);
			continue;
		}

		if (msg.role === "toolResult") {
			const textResult = msg.content
				.filter(isTextContentBlock)
				.map((block) => block.text)
				.join("\n");
			params.push({
				role: "tool",
				content: sanitizeSurrogates(textResult.length > 0 ? textResult : "(no tool output)"),
				tool_call_id: msg.toolCallId,
			});
			continue;
		}
	}

	return params;
}

function convertTools(tools: Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters as any, // JSON Schema
		},
	}));
}

function parseChunkUsage(rawUsage: {
	prompt_tokens?: number;
	completion_tokens?: number;
	prompt_cache_hit_tokens?: number;
	prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
	completion_tokens_details?: { reasoning_tokens?: number };
}): AssistantMessage["usage"] {
	const promptTokens = rawUsage.prompt_tokens || 0;
	const cacheReadTokens = rawUsage.prompt_tokens_details?.cached_tokens ?? rawUsage.prompt_cache_hit_tokens ?? 0;
	const cacheWriteTokens = rawUsage.prompt_tokens_details?.cache_write_tokens || 0;
	const input = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
	const outputTokens = rawUsage.completion_tokens || 0;
	return {
		input,
		output: outputTokens,
		cacheRead: cacheReadTokens,
		cacheWrite: cacheWriteTokens,
		reasoning: rawUsage.completion_tokens_details?.reasoning_tokens || 0,
		totalTokens: input + outputTokens + cacheReadTokens + cacheWriteTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function mapStopReason(reason: string | null): { stopReason: StopReason; errorMessage?: string } {
	if (reason === null) return { stopReason: "stop" };
	switch (reason) {
		case "stop":
		case "end":
			return { stopReason: "stop" };
		case "length":
			return { stopReason: "length" };
		case "function_call":
		case "tool_calls":
			return { stopReason: "toolUse" };
		case "content_filter":
			return { stopReason: "error", errorMessage: "Provider finish_reason: content_filter" };
		case "network_error":
			return { stopReason: "error", errorMessage: "Provider finish_reason: network_error" };
		default:
			return {
				stopReason: "error",
				errorMessage: `Provider finish_reason: ${reason}`,
			};
	}
}

/**
 * Stream an assistant response from an OpenAI-compatible chat-completions
 * endpoint. Satisfies the vendored core's StreamFn contract: MUST NOT throw —
 * failures are encoded in the returned stream's terminal message.
 */
export function streamOpenAICompat(
	model: Model<typeof OPENAI_COMPAT_API>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: { ...EMPTY_USAGE, cost: { ...EMPTY_USAGE.cost } },
			stopReason: "stop",
			timestamp: Date.now(),
		};

		try {
			const apiKey = options?.apiKey;
			if (!apiKey) {
				throw new Error(`No API key for provider: ${model.provider}`);
			}
			const client = new OpenAI({
				apiKey,
				baseURL: model.baseUrl,
				defaultHeaders: model.headers,
			});

			const messages = convertMessages(context);
			const params: Record<string, unknown> = {
				model: model.id,
				messages,
				stream: true,
			};
			if (model.compat?.includeUsage !== false) {
				params.stream_options = { include_usage: true };
			}
			const maxTokens = options?.maxTokens ?? model.maxTokens;
			if (maxTokens) {
				params[model.compat?.maxTokensField ?? "max_tokens"] = maxTokens;
			}
			if (options?.temperature !== undefined) {
				params.temperature = options.temperature;
			}
			if (context.tools && context.tools.length > 0) {
				params.tools = convertTools(context.tools);
			} else if (hasToolHistory(context.messages)) {
				// Some proxies require the tools param when the conversation carries
				// tool_calls / tool results.
				params.tools = [];
			}

			const openaiStream = await client.chat.completions.create(
				params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
				{
					...(options?.signal ? { signal: options.signal } : {}),
					...(options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
					maxRetries: options?.maxRetries ?? 2,
				},
			);

			stream.push({ type: "start", partial: output });

			interface StreamingToolCallBlock extends ToolCall {
				partialArgs?: string;
				streamIndex?: number;
			}
			type StreamingBlock = TextContent | ThinkingContent | StreamingToolCallBlock;

			let textBlock: TextContent | null = null;
			let thinkingBlock: ThinkingContent | null = null;
			let hasFinishReason = false;
			const toolCallBlocksByIndex = new Map<number, StreamingToolCallBlock>();
			const toolCallBlocksById = new Map<string, StreamingToolCallBlock>();
			const blocks = output.content as StreamingBlock[];
			const getContentIndex = (block: StreamingBlock) => blocks.indexOf(block);
			const finishBlock = (block: StreamingBlock) => {
				const contentIndex = getContentIndex(block);
				if (contentIndex === -1) {
					return;
				}
				if (block.type === "text") {
					stream.push({ type: "text_end", contentIndex, content: block.text, partial: output });
				} else if (block.type === "thinking") {
					stream.push({ type: "thinking_end", contentIndex, content: block.thinking, partial: output });
				} else if (block.type === "toolCall") {
					block.arguments = parseStreamingJson(block.partialArgs);
					// Finalize in-place and strip the scratch buffers so replay only
					// carries parsed arguments.
					delete block.partialArgs;
					delete block.streamIndex;
					stream.push({ type: "toolcall_end", contentIndex, toolCall: block, partial: output });
				}
			};
			const ensureTextBlock = () => {
				if (!textBlock) {
					textBlock = { type: "text", text: "" };
					blocks.push(textBlock);
					stream.push({ type: "text_start", contentIndex: getContentIndex(textBlock), partial: output });
				}
				return textBlock;
			};
			const ensureThinkingBlock = (thinkingSignature: string) => {
				if (!thinkingBlock) {
					thinkingBlock = { type: "thinking", thinking: "", thinkingSignature };
					blocks.push(thinkingBlock);
					stream.push({ type: "thinking_start", contentIndex: getContentIndex(thinkingBlock), partial: output });
				}
				return thinkingBlock;
			};
			// Structural view of a streamed tool_call delta (avoids depending on
			// the openai SDK's deep type paths).
			type ToolCallDelta = {
				index?: number;
				id?: string;
				function?: { name?: string; arguments?: string };
			};
			const ensureToolCallBlock = (toolCall: ToolCallDelta) => {
				const streamIndex = typeof toolCall.index === "number" ? toolCall.index : undefined;
				let block = streamIndex !== undefined ? toolCallBlocksByIndex.get(streamIndex) : undefined;
				if (!block && toolCall.id) {
					block = toolCallBlocksById.get(toolCall.id);
				}
				if (!block) {
					block = {
						type: "toolCall",
						id: toolCall.id || "",
						name: toolCall.function?.name || "",
						arguments: {},
						partialArgs: "",
						streamIndex,
					};
					if (streamIndex !== undefined) {
						toolCallBlocksByIndex.set(streamIndex, block);
					}
					if (toolCall.id) {
						toolCallBlocksById.set(toolCall.id, block);
					}
					blocks.push(block);
					stream.push({ type: "toolcall_start", contentIndex: getContentIndex(block), partial: output });
				}
				return block;
			};

			for await (const chunk of openaiStream) {
				if (!chunk || typeof chunk !== "object") continue;

				output.responseId ||= chunk.id;
				if (typeof chunk.model === "string" && chunk.model.length > 0 && chunk.model !== model.id) {
					output.responseModel ||= chunk.model;
				}
				if (chunk.usage) {
					output.usage = parseChunkUsage(chunk.usage);
				}

				const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
				if (!choice) continue;

				// Some providers return usage on the choice instead of the chunk.
				if (!chunk.usage && (choice as any).usage) {
					output.usage = parseChunkUsage((choice as any).usage);
				}

				if (choice.finish_reason) {
					const finishReasonResult = mapStopReason(choice.finish_reason);
					output.stopReason = finishReasonResult.stopReason;
					if (finishReasonResult.errorMessage) {
						output.errorMessage = finishReasonResult.errorMessage;
					}
					hasFinishReason = true;
				}

				if (choice.delta) {
					if (
						choice.delta.content !== null &&
						choice.delta.content !== undefined &&
						choice.delta.content.length > 0
					) {
						const block = ensureTextBlock();
						block.text += choice.delta.content;
						stream.push({
							type: "text_delta",
							contentIndex: getContentIndex(block),
							delta: choice.delta.content,
							partial: output,
						});
					}

					// Reasoning streams arrive as reasoning_content (GLM, llama.cpp)
					// or reasoning / reasoning_text (other OpenAI-compatible
					// endpoints). Use the first non-empty field to avoid duplication.
					const deltaFields = choice.delta as Record<string, unknown>;
					let reasoningDelta = "";
					let reasoningField: string | null = null;
					for (const field of ["reasoning_content", "reasoning", "reasoning_text"]) {
						const value = deltaFields[field];
						if (typeof value === "string" && value.length > 0) {
							reasoningDelta = value;
							reasoningField = field;
							break;
						}
					}
					if (reasoningDelta && reasoningField) {
						const block = ensureThinkingBlock(reasoningField);
						block.thinking += reasoningDelta;
						stream.push({
							type: "thinking_delta",
							contentIndex: getContentIndex(block),
							delta: reasoningDelta,
							partial: output,
						});
					}

					if (choice.delta.tool_calls) {
						for (const toolCall of choice.delta.tool_calls) {
							const block = ensureToolCallBlock(toolCall);
							if (!block.id && toolCall.id) {
								block.id = toolCall.id;
								toolCallBlocksById.set(toolCall.id, block);
							}
							if (!block.name && toolCall.function?.name) {
								block.name = toolCall.function.name;
							}

							let delta = "";
							if (toolCall.function?.arguments) {
								delta = toolCall.function.arguments;
								block.partialArgs = (block.partialArgs ?? "") + toolCall.function.arguments;
								block.arguments = parseStreamingJson(block.partialArgs);
							}
							stream.push({
								type: "toolcall_delta",
								contentIndex: getContentIndex(block),
								delta,
								partial: output,
							});
						}
					}
				}
			}

			for (const block of blocks) {
				finishBlock(block);
			}
			if (options?.signal?.aborted) {
				throw new Error("Request was aborted");
			}

			if (output.stopReason === "aborted") {
				throw new Error("Request was aborted");
			}
			if (output.stopReason === "error") {
				throw new Error(output.errorMessage || "Provider returned an error stop reason");
			}
			if (!hasFinishReason) {
				throw new Error("Stream ended without finish_reason");
			}

			stream.push({ type: "done", reason: output.stopReason as "stop" | "length" | "toolUse", message: output });
			stream.end();
		} catch (error) {
			for (const block of output.content) {
				delete (block as { partialArgs?: string }).partialArgs;
				delete (block as { streamIndex?: number }).streamIndex;
			}
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = formatProviderError(normalizeProviderError(error));
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
}

/**
 * Non-streaming convenience used by the long-term-memory / summarization side
 * queries: run the stream to completion and hand back the final message. The
 * error contract is the same — check `stopReason` / `errorMessage` on the
 * result instead of catching.
 */
export async function completeOpenAICompat(
	model: Model<typeof OPENAI_COMPAT_API>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const stream = streamOpenAICompat(model, context, options);
	// Drain the event stream so the underlying request is consumed.
	for await (const _event of stream) {
		// discard partial events
	}
	return stream.result();
}

/** Extract the joined text of an assistant message ("" for non-text content). */
export function assistantTextOf(message: AssistantMessage | undefined | null): string {
	if (!message) return "";
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("")
		.trim();
}
