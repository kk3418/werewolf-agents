/**
 * providers.ts — LLM provider abstraction
 *
 * Set LLM_PROVIDER in .env to select a provider:
 *   anthropic (default) | openai | google | ollama
 *
 * Set LLM_MODEL to override the default model for each provider.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ── Interface ──────────────────────────────────────────────────────────────

export interface LLMProvider {
  complete(system: string, userPrompt: string, maxTokens: number): Promise<string>;
}

// ── Anthropic (Claude) ─────────────────────────────────────────────────────

class AnthropicProvider implements LLMProvider {
  private client = new Anthropic();
  private model = process.env.LLM_MODEL || "claude-sonnet-4-6";

  async complete(system: string, prompt: string, maxTokens: number): Promise<string> {
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

class OpenAIProvider implements LLMProvider {
  private client = new OpenAI();
  private model = process.env.LLM_MODEL || "gpt-4o";

  async complete(system: string, prompt: string, maxTokens: number): Promise<string> {
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

class GoogleProvider implements LLMProvider {
  private genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? "");
  private modelName = process.env.LLM_MODEL || "gemini-2.0-flash";

  async complete(system: string, prompt: string, maxTokens: number): Promise<string> {
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

class OllamaProvider implements LLMProvider {
  private client = new OpenAI({
    baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    apiKey: "ollama", // required by SDK but ignored by Ollama
  });
  private model = process.env.LLM_MODEL || "llama3.1";

  async complete(system: string, prompt: string, maxTokens: number): Promise<string> {
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

const PROVIDERS: Record<string, () => LLMProvider> = {
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAIProvider(),
  google: () => new GoogleProvider(),
  ollama: () => new OllamaProvider(),
};

export function createProvider(): LLMProvider {
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
