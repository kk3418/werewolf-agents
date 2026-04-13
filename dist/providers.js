"use strict";
/**
 * providers.ts — LLM provider abstraction
 *
 * Set LLM_PROVIDER in .env to select a provider:
 *   anthropic (default) | openai | google | ollama
 *
 * Set LLM_MODEL to override the default model for each provider.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProvider = createProvider;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const openai_1 = __importDefault(require("openai"));
const generative_ai_1 = require("@google/generative-ai");
// ── Anthropic (Claude) ─────────────────────────────────────────────────────
class AnthropicProvider {
    constructor() {
        this.client = new sdk_1.default();
        this.model = process.env.LLM_MODEL || "claude-sonnet-4-6";
    }
    async complete(system, prompt, maxTokens) {
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: prompt }],
        });
        const block = response.content.find((b) => b.type === "text");
        return block?.type === "text" ? block.text : "";
    }
}
// ── OpenAI (GPT-4o, etc.) ──────────────────────────────────────────────────
class OpenAIProvider {
    constructor() {
        this.client = new openai_1.default();
        this.model = process.env.LLM_MODEL || "gpt-4o";
    }
    async complete(system, prompt, maxTokens) {
        const response = await this.client.chat.completions.create({
            model: this.model,
            max_tokens: maxTokens,
            messages: [
                { role: "system", content: system },
                { role: "user", content: prompt },
            ],
        });
        return response.choices[0]?.message.content ?? "";
    }
}
// ── Google Gemini ──────────────────────────────────────────────────────────
class GoogleProvider {
    constructor() {
        this.genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? "");
        this.modelName = process.env.LLM_MODEL || "gemini-2.0-flash";
    }
    async complete(system, prompt, maxTokens) {
        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            systemInstruction: system,
        });
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens },
        });
        return result.response.text();
    }
}
// ── Ollama (local, OpenAI-compatible) ─────────────────────────────────────
class OllamaProvider {
    constructor() {
        this.client = new openai_1.default({
            baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
            apiKey: "ollama", // required by SDK but ignored by Ollama
        });
        this.model = process.env.LLM_MODEL || "llama3.1";
    }
    async complete(system, prompt, maxTokens) {
        const response = await this.client.chat.completions.create({
            model: this.model,
            max_tokens: maxTokens,
            messages: [
                { role: "system", content: system },
                { role: "user", content: prompt },
            ],
        });
        return response.choices[0]?.message.content ?? "";
    }
}
// ── Factory ────────────────────────────────────────────────────────────────
const PROVIDERS = {
    anthropic: () => new AnthropicProvider(),
    openai: () => new OpenAIProvider(),
    google: () => new GoogleProvider(),
    ollama: () => new OllamaProvider(),
};
function createProvider() {
    const name = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
    const factory = PROVIDERS[name];
    if (!factory) {
        const valid = Object.keys(PROVIDERS).join(", ");
        throw new Error(`Unknown LLM_PROVIDER: "${name}"。可用選項：${valid}`);
    }
    const model = process.env.LLM_MODEL || "(provider default)";
    console.log(`🤖 LLM provider: ${name}  model: ${model}`);
    return factory();
}
