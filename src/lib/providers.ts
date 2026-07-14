import type { ApiConfig, ProviderId } from "./types";

export type ProviderPreset = {
  id: ProviderId;
  name: string;
  baseUrl: string;
  defaultModel: string;
  hint: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "free",
    name: "免费模型（默认）",
    baseUrl: "",
    defaultModel: "",
    hint: "无需配置，开箱即用；若不可用可改用下方自备 API",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    hint: "在 platform.deepseek.com 获取 API Key",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    hint: "在 platform.openai.com 获取 API Key",
  },
  {
    id: "qwen",
    name: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    hint: "在阿里云百炼 / DashScope 获取 API Key",
  },
  {
    id: "custom",
    name: "自定义（OpenAI 兼容）",
    baseUrl: "",
    defaultModel: "",
    hint: "填写兼容 OpenAI Chat Completions 的 Base URL",
  },
];

export const DEFAULT_API_CONFIG: ApiConfig = {
  provider: "free",
  baseUrl: "",
  apiKey: "",
  model: "",
};

export function getPreset(id: ProviderId): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[0];
}

export function resolveBaseUrl(
  config: Pick<ApiConfig, "provider" | "baseUrl">
): string {
  if (config.provider === "free") return "";
  if (config.provider === "custom") {
    return (config.baseUrl || "").replace(/\/$/, "");
  }
  const preset = getPreset(config.provider);
  return (config.baseUrl || preset.baseUrl).replace(/\/$/, "");
}
