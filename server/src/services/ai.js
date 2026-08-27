import OpenAI from "openai";
import db from "../db/index.js";
import { getCached, setCached, hashInput } from "./cache.js";

const apiKey = process.env.USER_LLM_API_KEY;
const baseURL = process.env.USER_LLM_BASE_URL || "https://api.deepseek.com/v1";
const defaultModel = process.env.USER_LLM_MODEL || "deepseek-chat";

const cheapModel = process.env.USER_LLM_CHEAP_MODEL || defaultModel;
const strongModel = process.env.USER_LLM_STRONG_MODEL || defaultModel;

export const aiEnabled = Boolean(apiKey);

const client = apiKey
  ? new OpenAI({ apiKey, baseURL })
  : null;

const MODEL_PRICES = {
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
};

function priceFor(model, inputTokens, outputTokens) {
  const p = MODEL_PRICES[model];
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

function recordCost(teacherId, model, task, inputTokens, outputTokens) {
  const cost = priceFor(model, inputTokens, outputTokens);
  db.prepare(
    `INSERT INTO ai_costs (teacher_id, model, task, input_tokens, output_tokens, cost)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(teacherId, model, task, inputTokens, outputTokens, cost);
  return cost;
}

export function pickModel(task, complexity = "auto") {
  if (complexity === "strong") return strongModel;
  if (complexity === "cheap") return cheapModel;
  const complexTasks = ["analysis", "report", "reasoning", "error-analysis", "adaptive", "summary"];
  return complexTasks.includes(task) ? strongModel : cheapModel;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const target = fenced ? fenced[1] : text;
  try {
    return JSON.parse(target);
  } catch {
    const start = target.indexOf("{");
    const end = target.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      return JSON.parse(target.slice(start, end + 1));
    }
    throw new Error("AI javobi JSON formatida emas");
  }
}

export async function chat(teacherId, messages, { task = "general", complexity = "auto", temperature = 0.7, json = false, maxTokens = 4000, cacheable = false } = {}) {
  if (cacheable) {
    const key = `ai:${pickModel(task, complexity)}:${task}:${hashInput(JSON.stringify(messages))}`;
    const cached = getCached(key);
    if (cached) return cached;
    const fresh = await doChat(teacherId, messages, { task, complexity, temperature, json, maxTokens });
    return setCached(key, fresh);
  }
  return doChat(teacherId, messages, { task, complexity, temperature, json, maxTokens });
}

async function doChat(teacherId, messages, { task, complexity, temperature, json, maxTokens }) {
  if (!client) {
    throw new Error(
      "AI kaliti sozlanmagan. Iltimos .env faylida USER_LLM_API_KEY ni o'rnating."
    );
  }
  const model = pickModel(task, complexity);
  const finalMessages = json
    ? [...messages, { role: "system", content: "Javobni faqat JSON formatida qaytar." }]
    : messages;

  const response = await client.chat.completions.create({
    model,
    messages: finalMessages,
    temperature,
    max_tokens: maxTokens,
  });

  const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
  recordCost(teacherId, model, task, usage.prompt_tokens || 0, usage.completion_tokens || 0);

  const content = response.choices[0]?.message?.content || "";
  return json ? extractJson(content) : content;
}

export async function generateJson(teacherId, messages, opts = {}) {
  return chat(teacherId, messages, { ...opts, json: true });
}

export function getUsageStats(teacherId, { period = "all" } = {}) {
  let where = "WHERE teacher_id = ?";
  const params = [teacherId];
  if (period === "day") {
    where += " AND date(created_at) = date('now', 'localtime')";
  } else if (period === "month") {
    where += " AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')";
  }
  const rows = db.prepare(`SELECT * FROM ai_costs ${where}`).all(...params);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalTokens = rows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0);
  const byModel = {};
  for (const r of rows) {
    byModel[r.model] = (byModel[r.model] || 0) + r.cost;
  }
  return { requests: rows.length, totalCost, totalTokens, byModel };
}
