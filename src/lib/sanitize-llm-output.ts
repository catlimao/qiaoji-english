/**
 * 清洗免费模型常见「推理草稿 / JSON 壳」乱码，尽量只留下小说正文。
 */

function chineseLen(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) || []).length;
}

function looksLikeReasoningDump(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/"reasoning"\s*:/i.test(t) && chineseLen(t) < 120) return true;
  if (/^\s*\{[\s\S]{0,80}"role"\s*:\s*"assistant"/i.test(t)) return true;
  if (
    /\b(We need (to )?write|Let's draft|Let's craft|Must embed|Must produce only|Continue\.\s*\n\s*Make sure|Ensure \d+-\d+ Chinese)\b/i.test(
      t
    )
  ) {
    return true;
  }
  const zh = chineseLen(t);
  const enLong = (t.match(/\b[A-Za-z]{5,}\b/g) || []).length;
  // 大量英文规划、几乎没有中文正文
  if (zh < 80 && enLong > 35) return true;
  if (zh < 40 && /embedded words|Chinese characters|No parentheses/i.test(t)) {
    return true;
  }
  return false;
}

function tryExtractFromJson(text: string): string {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return "";
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const msg = (data.message ?? data) as Record<string, unknown>;
    const candidates = [
      msg.content,
      msg.text,
      data.content,
      data.text,
      data.response,
      data.output,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && chineseLen(c) >= 40) return c.trim();
    }
    // 有的接口把整段正文塞进 choices
    const choices = data.choices;
    if (Array.isArray(choices) && choices[0]) {
      const first = choices[0] as Record<string, unknown>;
      const m = first.message as Record<string, unknown> | undefined;
      const c = m?.content ?? first.content ?? first.text;
      if (typeof c === "string" && chineseLen(c) >= 40) return c.trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

/** 从英/中混杂草稿里捞出偏中文的故事段落 */
function extractChineseDominantBlock(text: string): string {
  // 按空行切段，选汉字多、英文推理少的段落
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paras.length >= 1) {
    const storyParas = paras.filter((p) => {
      const zh = chineseLen(p);
      if (zh < 20) return false;
      if (/\b(We need|Let's draft|Must embed|reasoning)\b/i.test(p)) return false;
      if (/"role"\s*:/i.test(p)) return false;
      return zh > (p.match(/\b[A-Za-z]{5,}\b/g) || []).length;
    });
    if (storyParas.length) return storyParas.join("\n\n");
  }

  // 删掉开头英文推理：从第一个汉字开始
  const idx = text.search(/[\u4e00-\u9fff]/);
  if (idx >= 0) {
    let t = text.slice(idx).trim();
    t = t.replace(
      /\n\s*(?:Let's|We need|Must |Ensure |Continue\.|Count approximate)[\s\S]*$/i,
      ""
    );
    return t.trim();
  }
  return text.trim();
}

/**
 * 返回可用于展示/解析的正文；若无法挽救则返回空串。
 */
export function sanitizeLlmStoryOutput(raw: string): string {
  if (!raw?.trim()) return "";

  let text = raw.trim();

  // 去掉 markdown 代码围栏
  text = text.replace(/^```(?:json|text|markdown)?\s*/i, "").replace(/```$/i, "");

  const fromJson = tryExtractFromJson(text);
  if (fromJson) text = fromJson;

  // 去掉开头 assistant/role 伪 JSON 前缀
  text = text.replace(
    /^\s*\{[\s\S]*?"(?:reasoning|content)"\s*:\s*"/,
    ""
  );

  if (looksLikeReasoningDump(text) || chineseLen(text) < 60) {
    const recovered = extractChineseDominantBlock(raw);
    if (chineseLen(recovered) >= 40) text = recovered;
  } else if (chineseLen(text) >= 60 && /\bWe need (to )?write|Let's draft/i.test(text)) {
    // 推理 + 正文黏在一起
    const recovered = extractChineseDominantBlock(text);
    if (chineseLen(recovered) > chineseLen(text) * 0.4) text = recovered;
  }

  // 清掉残 JSON 碎片
  text = text
    .replace(/^\s*"role"\s*:\s*"assistant"\s*,?/gim, "")
    .replace(/^\s*"reasoning"\s*:\s*"[^"]*"\s*,?/gim, "")
    .trim();

  if (chineseLen(text) < 30 && looksLikeReasoningDump(text)) return "";
  return text.trim();
}

export function isUnusableStoryOutput(raw: string): boolean {
  const clean = sanitizeLlmStoryOutput(raw);
  if (!clean) return true;
  if (chineseLen(clean) < 40) return true;
  if (looksLikeReasoningDump(clean) && chineseLen(clean) < 120) return true;
  return false;
}
