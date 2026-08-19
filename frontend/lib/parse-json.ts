/**
 * JSON 修复工具 — 从 LLM 响应中提取并修复 JSON
 */
export function extractJSON(text: string): string {
  // 尝试移除 ```json ... ``` 代码块
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim()
  }
  // 尝试找到第一个 { 到最后一个 }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1)
  }
  return text.trim()
}

/**
 * 修复常见的 JSON 格式问题
 */
export function repairJSON(text: string): string {
  const s = text
    .trim()
    // 修复 smart quotes
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // 移除尾部的逗号
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    // 修复连续逗号
    .replace(/,\s*,/g, ',')
    // 移除注释（单行 // 和多行 /* */）
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 修复不带引号的键名
    .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
    // 替换单引号为双引号（仅在键/字符串值中）
    .replace(/:\s*'([^']*?)'/g, ': "$1"')

  return s.trim()
}

/**
 * 安全解析 JSON，失败时返回 null
 */
export function safeParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/**
 * 从 LLM 响应中提取并解析 JSON，包含修复逻辑
 */
export function parseJSONFromLLM<T>(raw: string): T | null {
  // 尝试直接解析
  const direct = safeParse<T>(raw)
  if (direct) return direct

  // 尝试提取 + 修复后解析
  const extracted = extractJSON(raw)
  if (extracted !== raw) {
    const extractedResult = safeParse<T>(extracted)
    if (extractedResult) return extractedResult
  }

  // 尝试修复后解析
  const repaired = repairJSON(extracted)
  if (repaired !== extracted) {
    const repairedResult = safeParse<T>(repaired)
    if (repairedResult) return repairedResult
  }

  return null
}
