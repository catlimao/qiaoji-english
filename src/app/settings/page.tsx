"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ApiConfig, ProviderId } from "@/lib/types";
import { getApiConfig, saveApiConfig } from "@/lib/storage";
import {
  DEFAULT_API_CONFIG,
  getPreset,
  PROVIDER_PRESETS,
} from "@/lib/providers";

export default function SettingsPage() {
  const [config, setConfig] = useState<ApiConfig>(DEFAULT_API_CONFIG);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    // 设置页只展示用户自己保存的配置，不回填内置 Key
    const savedCfg = getApiConfig();
    setConfig({
      ...savedCfg,
      // 若本机没有用户自填 Key，保持「默认通道」视图
      apiKey: (savedCfg.apiKey || "").trim() ? savedCfg.apiKey : "",
    });
  }, []);

  const selectProvider = (provider: ProviderId) => {
    if (provider === "free") {
      setConfig({ ...DEFAULT_API_CONFIG, apiKey: "" });
      setSaved(false);
      return;
    }
    const preset = getPreset(provider);
    setConfig((prev) => ({
      ...prev,
      provider,
      baseUrl: provider === "custom" ? prev.baseUrl : preset.baseUrl,
      model:
        provider === "custom"
          ? prev.model
          : prev.provider === provider && prev.model
            ? prev.model
            : preset.defaultModel,
      // 切换渠道时不带出任何内置密钥
      apiKey: prev.provider === provider ? prev.apiKey : "",
    }));
    setSaved(false);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // 默认通道不把空 Key 写成脏配置
    if (config.provider === "free" || !(config.apiKey || "").trim()) {
      saveApiConfig({ ...DEFAULT_API_CONFIG });
    } else {
      saveApiConfig(config);
    }
    setSaved(true);
  };

  const preset = getPreset(config.provider);
  const isDefault = config.provider === "free" || !(config.apiKey || "").trim();
  const paidProviders = PROVIDER_PRESETS.filter((p) => p.id !== "free");

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink-900">
          API 配置
        </h1>
        <p className="mt-2 font-body text-sm leading-relaxed text-ink-600">
          默认已可直接生成，无需填写密钥。仅在想换用自己的接口时再配置下方选项。
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-ink-200 bg-paper p-5 sm:p-6"
      >
        <div
          className={`rounded-xl border px-4 py-3 ${
            isDefault
              ? "border-ink-800 bg-ink-900 text-paper"
              : "border-ink-200 bg-white/50"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                className={`font-body text-sm font-medium ${
                  isDefault ? "text-paper" : "text-ink-900"
                }`}
              >
                默认通道（推荐）
              </p>
              <p
                className={`mt-1 font-body text-xs ${
                  isDefault ? "text-paper/75" : "text-ink-500"
                }`}
              >
                开箱即用，无需填写 API Key
              </p>
            </div>
            {!isDefault && (
              <button
                type="button"
                onClick={() => selectProvider("free")}
                className="shrink-0 rounded-lg bg-ink-900 px-3 py-1.5 text-xs text-paper"
              >
                切回默认
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-dashed border-ink-300 bg-ink-50/60 p-4">
          <p className="font-body text-sm font-medium text-ink-800">
            可选：使用自己的 API
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {paidProviders.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProvider(p.id)}
                className={`rounded-xl border px-3 py-2.5 text-left font-body text-sm transition ${
                  !isDefault && config.provider === p.id
                    ? "border-ink-800 bg-ink-900 text-paper"
                    : "border-ink-200 bg-white/50 text-ink-800 hover:border-ink-300"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {!isDefault && (
            <>
              <p className="font-body text-xs text-ink-500">{preset.hint}</p>
              <label className="block">
                <span className="mb-1.5 block font-body text-xs font-medium uppercase tracking-wide text-ink-500">
                  Base URL
                </span>
                <input
                  type="url"
                  value={config.baseUrl}
                  onChange={(e) => {
                    setConfig({ ...config, baseUrl: e.target.value });
                    setSaved(false);
                  }}
                  placeholder="https://api.example.com/v1"
                  className="w-full rounded-xl border border-ink-200 bg-white/70 px-3 py-2.5 font-body text-sm outline-none ring-accent/30 focus:ring-2"
                  required={config.provider === "custom"}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-body text-xs font-medium uppercase tracking-wide text-ink-500">
                  模型
                </span>
                <input
                  type="text"
                  value={config.model}
                  onChange={(e) => {
                    setConfig({ ...config, model: e.target.value });
                    setSaved(false);
                  }}
                  placeholder={preset.defaultModel || "model-name"}
                  className="w-full rounded-xl border border-ink-200 bg-white/70 px-3 py-2.5 font-body text-sm outline-none ring-accent/30 focus:ring-2"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-body text-xs font-medium uppercase tracking-wide text-ink-500">
                  API Key
                </span>
                <div className="flex gap-2">
                  <input
                    type={showKey ? "text" : "password"}
                    value={config.apiKey}
                    onChange={(e) => {
                      setConfig({ ...config, apiKey: e.target.value });
                      setSaved(false);
                    }}
                    placeholder="在此填写你自己的 Key"
                    autoComplete="off"
                    className="w-full rounded-xl border border-ink-200 bg-white/70 px-3 py-2.5 font-body text-sm outline-none ring-accent/30 focus:ring-2"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="shrink-0 rounded-xl bg-ink-100 px-3 text-sm text-ink-700 hover:bg-ink-200"
                  >
                    {showKey ? "隐藏" : "显示"}
                  </button>
                </div>
              </label>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            className="rounded-xl bg-accent px-5 py-2.5 font-body text-sm font-medium text-white hover:bg-accent-deep"
          >
            保存配置
          </button>
          {saved && (
            <span className="font-body text-sm text-green-700">已保存到本机</span>
          )}
        </div>
      </form>
    </div>
  );
}
