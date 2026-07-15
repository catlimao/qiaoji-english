import type { ApiConfig } from "./types";

/**
 * 免费通道失败时的内置备用（DeepSeek）。
 * 注意：写在前端代码里会被公开可见，仅适合个人站点；泄露后请到平台轮换 Key。
 */
export const BUILTIN_FALLBACK_API: ApiConfig = {
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "sk-89131961be704a71a7b07cd0892a3b5e",
  model: "deepseek-chat",
};
