import { db } from './db'
import { normalizeMathDelimiters } from './latex'

// AI Personality Modes
export type AIMode = 'strict' | 'friendly' | 'exam'

interface AIContext {
  subject?: string
  chapter?: string
  userId: string
  mode: AIMode
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

interface AIResponse {
  response: string
  modelUsed: string
  tokensUsed: number
}

type ChatRole = 'system' | 'user' | 'assistant'

interface ChatMessage {
  role: ChatRole
  content: string
}

interface ChatOptions {
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  preferReasoning?: boolean
}

type Provider = 'openrouter' | 'sambanova' | 'deepseek' | 'groq' | 'cohere' | 'huggingface'

export type ProviderStatus = {
  provider: Provider
  configured: boolean
  model: string
  reasoningModel: string
  status: 'ok' | 'error' | 'disabled' | 'unknown'
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
  limitHint: string | null
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim() || ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL?.trim() || 'openai/gpt-4o-mini'
const OPENROUTER_REASONING_MODEL = process.env.OPENROUTER_REASONING_MODEL?.trim() || 'deepseek/deepseek-r1'
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL?.trim() || ''
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME?.trim() || 'JEE Study Buddy'

const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY?.trim() || ''
const SAMBANOVA_MODEL = process.env.SAMBANOVA_MODEL?.trim() || 'Meta-Llama-3.3-70B-Instruct'
const SAMBANOVA_REASONING_MODEL = process.env.SAMBANOVA_REASONING_MODEL?.trim() || SAMBANOVA_MODEL
const SAMBANOVA_BASE_URL = process.env.SAMBANOVA_BASE_URL?.trim() || 'https://api.sambanova.ai/v1/chat/completions'

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim() || ''
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat'
const DEEPSEEK_REASONING_MODEL = process.env.DEEPSEEK_REASONING_MODEL?.trim() || 'deepseek-reasoner'

const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() || ''
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || 'llama-3.1-8b-instant'
const GROQ_REASONING_MODEL = process.env.GROQ_REASONING_MODEL?.trim() || GROQ_MODEL

const COHERE_API_KEY = process.env.COHERE_API_KEY?.trim() || ''
const COHERE_MODEL = process.env.COHERE_MODEL?.trim() || 'command-r'
const COHERE_REASONING_MODEL = process.env.COHERE_REASONING_MODEL?.trim() || COHERE_MODEL

const HF_TOKEN =
  process.env.HF_TOKEN?.trim() ||
  process.env.HUGGINGFACE_API_KEY?.trim() ||
  process.env.HUGGING_FACE_HUB_TOKEN?.trim() ||
  ''
const HF_MODEL = process.env.HF_MODEL?.trim() || 'meta-llama/Llama-3.1-8B-Instruct'
const HF_REASONING_MODEL = process.env.HF_REASONING_MODEL?.trim() || HF_MODEL
const AI_PROVIDER = (process.env.AI_PROVIDER || 'auto').toLowerCase()

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const AI_MAX_TOKENS_SHORT = readPositiveInt(process.env.AI_MAX_TOKENS_SHORT, 700)
const AI_MAX_TOKENS_LONG = readPositiveInt(process.env.AI_MAX_TOKENS_LONG, 8192)
const AI_MAX_TOKENS_NOTES = readPositiveInt(process.env.AI_MAX_TOKENS_NOTES, 8192)
const AI_MAX_TOKENS_HINT = readPositiveInt(process.env.AI_MAX_TOKENS_HINT, 1024)
const AI_MAX_TOKENS_CHAT = Math.min(readPositiveInt(process.env.AI_MAX_TOKENS_CHAT, 700), AI_MAX_TOKENS_SHORT)
const AI_HISTORY_WINDOW = readPositiveInt(process.env.AI_HISTORY_WINDOW, 10)

const providerStats: Record<Provider, { lastSuccessAt: number | null; lastErrorAt: number | null; lastError: string | null; lastModelUsed: string | null }> = {
  openrouter: { lastSuccessAt: null, lastErrorAt: null, lastError: null, lastModelUsed: null },
  sambanova: { lastSuccessAt: null, lastErrorAt: null, lastError: null, lastModelUsed: null },
  deepseek: { lastSuccessAt: null, lastErrorAt: null, lastError: null, lastModelUsed: null },
  groq: { lastSuccessAt: null, lastErrorAt: null, lastError: null, lastModelUsed: null },
  cohere: { lastSuccessAt: null, lastErrorAt: null, lastError: null, lastModelUsed: null },
  huggingface: { lastSuccessAt: null, lastErrorAt: null, lastError: null, lastModelUsed: null },
}

function recordProviderSuccess(provider: Provider, modelUsed: string) {
  providerStats[provider].lastSuccessAt = Date.now()
  providerStats[provider].lastModelUsed = modelUsed
}

function recordProviderFailure(provider: Provider, error: any) {
  providerStats[provider].lastErrorAt = Date.now()
  providerStats[provider].lastError = error?.message || String(error || 'Unknown error')
}

function deriveLimitHint(error: string | null): string | null {
  if (!error) return null
  const lower = error.toLowerCase()
  if (lower.includes('insufficient') || lower.includes('out of credits') || lower.includes('402')) {
    return 'Likely out of credits'
  }
  if (lower.includes('rate limit') || lower.includes('429')) {
    return 'Rate limited'
  }
  if (lower.includes('blocked') || lower.includes('forbidden') || lower.includes('403')) {
    return 'Blocked by provider'
  }
  if (lower.includes('removed') || lower.includes('not found') || lower.includes('404')) {
    return 'Model not available'
  }
  return null
}

export function getAiProviderStatus(): {
  aiProvider: string
  providerOrder: Provider[]
  limits: {
    short: number
    long: number
    notes: number
    hint: number
    chat: number
    history: number
  }
  providers: ProviderStatus[]
} {
  const configs: Record<Provider, { configured: boolean; model: string; reasoningModel: string }> = {
    openrouter: { configured: Boolean(OPENROUTER_API_KEY), model: OPENROUTER_MODEL, reasoningModel: OPENROUTER_REASONING_MODEL },
    sambanova: { configured: Boolean(SAMBANOVA_API_KEY), model: SAMBANOVA_MODEL, reasoningModel: SAMBANOVA_REASONING_MODEL },
    deepseek: { configured: Boolean(DEEPSEEK_API_KEY), model: DEEPSEEK_MODEL, reasoningModel: DEEPSEEK_REASONING_MODEL },
    groq: { configured: Boolean(GROQ_API_KEY), model: GROQ_MODEL, reasoningModel: GROQ_REASONING_MODEL },
    cohere: { configured: Boolean(COHERE_API_KEY), model: COHERE_MODEL, reasoningModel: COHERE_REASONING_MODEL },
    huggingface: { configured: Boolean(HF_TOKEN), model: HF_MODEL, reasoningModel: HF_REASONING_MODEL },
  }

  const providers = (Object.keys(configs) as Provider[]).map((provider) => {
    const config = configs[provider]
    const stats = providerStats[provider]
    const lastSuccessAt = stats.lastSuccessAt ? new Date(stats.lastSuccessAt).toISOString() : null
    const lastErrorAt = stats.lastErrorAt ? new Date(stats.lastErrorAt).toISOString() : null
    let status: ProviderStatus['status'] = 'unknown'
    if (!config.configured) {
      status = 'disabled'
    } else if (lastSuccessAt && (!lastErrorAt || stats.lastSuccessAt! >= stats.lastErrorAt!)) {
      status = 'ok'
    } else if (lastErrorAt) {
      status = 'error'
    }

    return {
      provider,
      configured: config.configured,
      model: stats.lastModelUsed || config.model,
      reasoningModel: config.reasoningModel,
      status,
      lastSuccessAt,
      lastErrorAt,
      lastError: stats.lastError,
      limitHint: deriveLimitHint(stats.lastError),
    }
  })

  return {
    aiProvider: AI_PROVIDER,
    providerOrder: resolveProviderOrder(),
    limits: {
      short: AI_MAX_TOKENS_SHORT,
      long: AI_MAX_TOKENS_LONG,
      notes: AI_MAX_TOKENS_NOTES,
      hint: AI_MAX_TOKENS_HINT,
      chat: AI_MAX_TOKENS_CHAT,
      history: AI_HISTORY_WINDOW,
    },
    providers,
  }
}

function chooseModel(
  defaultModel: string,
  reasoningModel: string,
  preferReasoning: boolean | undefined
): string {
  if (preferReasoning && reasoningModel) {
    return reasoningModel
  }
  return defaultModel
}

function extractApiError(payload: any): string {
  if (!payload) return 'Unknown API error'
  if (typeof payload === 'string') return payload
  return (
    payload.error?.message ||
    payload.error ||
    payload.message ||
    JSON.stringify(payload)
  )
}

async function parseJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function readOpenAICompatibleStream(
  response: Response,
  onDelta: (delta: string) => void,
  onThinking?: (thinking: string) => void
): Promise<{ content: string; thinking: string; tokens: number }> {
  if (!response.body) {
    throw new Error('Streaming response body is empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let thinking = ''
  let tokens = 0

  const stringifyReasoning = (value: any): string => {
    if (!value) return ''
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value.map(item => stringifyReasoning(item)).filter(Boolean).join('')
    }
    if (typeof value === 'object') {
      if (typeof value.text === 'string') return value.text
      if (typeof value.content === 'string') return value.content
      if (Array.isArray(value.content)) {
        return value.content.map((item: any) => stringifyReasoning(item)).filter(Boolean).join('')
      }
      if (typeof value.reasoning === 'string') return value.reasoning
      if (typeof value.reasoning_content === 'string') return value.reasoning_content
    }
    return ''
  }

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith('data:')) return

    const raw = trimmed.slice(5).trim()
    if (!raw || raw === '[DONE]') return

    try {
      const payload = JSON.parse(raw)
      const delta = payload?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) {
        content += delta
        onDelta(delta)
      }

      const reasoning = stringifyReasoning(
        payload?.choices?.[0]?.delta?.reasoning_content ??
          payload?.choices?.[0]?.delta?.reasoning ??
          payload?.choices?.[0]?.delta?.reasoning_text ??
          payload?.choices?.[0]?.message?.reasoning_content ??
          payload?.choices?.[0]?.message?.reasoning ??
          payload?.choices?.[0]?.reasoning
      )
      if (reasoning.length > 0) {
        thinking += reasoning
        onThinking?.(reasoning)
      }

      const usageTokens = payload?.usage?.total_tokens
      if (typeof usageTokens === 'number' && usageTokens > 0) {
        tokens = usageTokens
      }
    } catch {
      // Ignore malformed streaming chunks
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      handleLine(line)
    }
  }

  if (buffer.trim()) {
    handleLine(buffer)
  }

  return { content, thinking, tokens }
}

async function callOpenRouter(options: ChatOptions): Promise<{ content: string; tokens: number; modelUsed: string }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }
  const selectedModel = chooseModel(
    OPENROUTER_MODEL,
    OPENROUTER_REASONING_MODEL,
    options.preferReasoning
  )

  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'X-Title': OPENROUTER_APP_NAME,
  }
  if (OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = OPENROUTER_SITE_URL
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
  })

  const payload = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(`OpenRouter request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('OpenRouter response did not contain assistant content')
  }

  return {
    content,
    tokens: payload?.usage?.total_tokens || 0,
    modelUsed: `openrouter:${selectedModel}`,
  }
}

async function callSambaNova(options: ChatOptions): Promise<{ content: string; tokens: number; modelUsed: string }> {
  if (!SAMBANOVA_API_KEY) {
    throw new Error('SAMBANOVA_API_KEY is not configured')
  }

  const selectedModel = chooseModel(
    SAMBANOVA_MODEL,
    SAMBANOVA_REASONING_MODEL,
    options.preferReasoning
  )

  const response = await fetch(SAMBANOVA_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SAMBANOVA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
  })

  const payload = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(`SambaNova request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('SambaNova response did not contain assistant content')
  }

  return {
    content,
    tokens: payload?.usage?.total_tokens || 0,
    modelUsed: `sambanova:${selectedModel}`,
  }
}

async function callGroq(options: ChatOptions): Promise<{ content: string; tokens: number; modelUsed: string }> {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured')
  }
  const selectedModel = chooseModel(
    GROQ_MODEL,
    GROQ_REASONING_MODEL,
    options.preferReasoning
  )

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
  })

  const payload = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(`Groq request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Groq response did not contain assistant content')
  }

  return {
    content,
    tokens: payload?.usage?.total_tokens || 0,
    modelUsed: `groq:${selectedModel}`,
  }
}

async function callDeepSeek(options: ChatOptions): Promise<{ content: string; tokens: number; modelUsed: string }> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured')
  }
  const selectedModel = chooseModel(
    DEEPSEEK_MODEL,
    DEEPSEEK_REASONING_MODEL,
    options.preferReasoning
  )

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
  })

  const payload = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(`DeepSeek request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('DeepSeek response did not contain assistant content')
  }

  return {
    content,
    tokens: payload?.usage?.total_tokens || 0,
    modelUsed: `deepseek:${selectedModel}`,
  }
}

async function callCohere(options: ChatOptions): Promise<{ content: string; tokens: number; modelUsed: string }> {
  if (!COHERE_API_KEY) {
    throw new Error('COHERE_API_KEY is not configured')
  }
  const selectedModel = chooseModel(
    COHERE_MODEL,
    COHERE_REASONING_MODEL,
    options.preferReasoning
  )

  const response = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
  })

  const payload = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(`Cohere request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const content =
    payload?.message?.content?.[0]?.text ||
    payload?.text ||
    payload?.choices?.[0]?.message?.content

  if (!content || typeof content !== 'string') {
    throw new Error('Cohere response did not contain assistant content')
  }

  const inputTokens = payload?.usage?.tokens?.input_tokens || 0
  const outputTokens = payload?.usage?.tokens?.output_tokens || 0

  return {
    content,
    tokens: inputTokens + outputTokens,
    modelUsed: `cohere:${selectedModel}`,
  }
}

async function callHuggingFace(options: ChatOptions): Promise<{ content: string; tokens: number; modelUsed: string }> {
  if (!HF_TOKEN) {
    throw new Error('HF_TOKEN is not configured')
  }
  const selectedModel = chooseModel(
    HF_MODEL,
    HF_REASONING_MODEL,
    options.preferReasoning
  )

  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
  })

  const payload = await parseJsonSafe(response)
  if (!response.ok) {
    throw new Error(`Hugging Face request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Hugging Face response did not contain assistant content')
  }

  return {
    content,
    tokens: payload?.usage?.total_tokens || 0,
    modelUsed: `huggingface:${selectedModel}`,
  }
}

async function callOpenRouterStream(
  options: ChatOptions,
  onDelta: (delta: string) => void,
  onThinking?: (thinking: string) => void
): Promise<{ content: string; thinking: string; tokens: number; modelUsed: string }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  const selectedModel = chooseModel(
    OPENROUTER_MODEL,
    OPENROUTER_REASONING_MODEL,
    options.preferReasoning
  )

  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'X-Title': OPENROUTER_APP_NAME,
  }
  if (OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = OPENROUTER_SITE_URL
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const payload = await parseJsonSafe(response)
    throw new Error(`OpenRouter request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const streamed = await readOpenAICompatibleStream(response, onDelta, onThinking)
  return {
    content: streamed.content,
    thinking: streamed.thinking,
    tokens: streamed.tokens,
    modelUsed: `openrouter:${selectedModel}`,
  }
}

async function callSambaNovaStream(
  options: ChatOptions,
  onDelta: (delta: string) => void,
  onThinking?: (thinking: string) => void
): Promise<{ content: string; thinking: string; tokens: number; modelUsed: string }> {
  if (!SAMBANOVA_API_KEY) {
    throw new Error('SAMBANOVA_API_KEY is not configured')
  }

  const selectedModel = chooseModel(
    SAMBANOVA_MODEL,
    SAMBANOVA_REASONING_MODEL,
    options.preferReasoning
  )

  const response = await fetch(SAMBANOVA_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SAMBANOVA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const payload = await parseJsonSafe(response)
    throw new Error(`SambaNova request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const streamed = await readOpenAICompatibleStream(response, onDelta, onThinking)
  return {
    content: streamed.content,
    thinking: streamed.thinking,
    tokens: streamed.tokens,
    modelUsed: `sambanova:${selectedModel}`,
  }
}

async function callDeepSeekStream(
  options: ChatOptions,
  onDelta: (delta: string) => void,
  onThinking?: (thinking: string) => void
): Promise<{ content: string; thinking: string; tokens: number; modelUsed: string }> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured')
  }

  const selectedModel = chooseModel(
    DEEPSEEK_MODEL,
    DEEPSEEK_REASONING_MODEL,
    options.preferReasoning
  )

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const payload = await parseJsonSafe(response)
    throw new Error(`DeepSeek request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const streamed = await readOpenAICompatibleStream(response, onDelta, onThinking)
  return {
    content: streamed.content,
    thinking: streamed.thinking,
    tokens: streamed.tokens,
    modelUsed: `deepseek:${selectedModel}`,
  }
}

async function callGroqStream(
  options: ChatOptions,
  onDelta: (delta: string) => void,
  onThinking?: (thinking: string) => void
): Promise<{ content: string; thinking: string; tokens: number; modelUsed: string }> {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  const selectedModel = chooseModel(
    GROQ_MODEL,
    GROQ_REASONING_MODEL,
    options.preferReasoning
  )

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const payload = await parseJsonSafe(response)
    throw new Error(`Groq request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const streamed = await readOpenAICompatibleStream(response, onDelta, onThinking)
  return {
    content: streamed.content,
    thinking: streamed.thinking,
    tokens: streamed.tokens,
    modelUsed: `groq:${selectedModel}`,
  }
}

async function callHuggingFaceStream(
  options: ChatOptions,
  onDelta: (delta: string) => void,
  onThinking?: (thinking: string) => void
): Promise<{ content: string; thinking: string; tokens: number; modelUsed: string }> {
  if (!HF_TOKEN) {
    throw new Error('HF_TOKEN is not configured')
  }

  const selectedModel = chooseModel(
    HF_MODEL,
    HF_REASONING_MODEL,
    options.preferReasoning
  )

  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!response.ok) {
    const payload = await parseJsonSafe(response)
    throw new Error(`Hugging Face request failed (${response.status}): ${extractApiError(payload)}`)
  }

  const streamed = await readOpenAICompatibleStream(response, onDelta, onThinking)
  return {
    content: streamed.content,
    thinking: streamed.thinking,
    tokens: streamed.tokens,
    modelUsed: `huggingface:${selectedModel}`,
  }
}

async function callCohereStream(
  options: ChatOptions,
  onDelta: (delta: string) => void,
  onThinking?: (thinking: string) => void
): Promise<{ content: string; thinking: string; tokens: number; modelUsed: string }> {
  // Fallback: Cohere chat non-stream response is emitted as one chunk.
  const result = await callCohere(options)
  if (result.content) {
    onDelta(result.content)
  }
  return { ...result, thinking: '' }
}

function resolveProviderOrder(): Provider[] {
  const hasOpenRouter = Boolean(OPENROUTER_API_KEY)
  const hasSambaNova = Boolean(SAMBANOVA_API_KEY)
  const hasDeepSeek = Boolean(DEEPSEEK_API_KEY)
  const hasGroq = Boolean(GROQ_API_KEY)
  const hasCohere = Boolean(COHERE_API_KEY)
  const hasHF = Boolean(HF_TOKEN)

  if (AI_PROVIDER === 'openrouter' || AI_PROVIDER === 'or') {
    const ordered: Provider[] = ['openrouter']
    if (hasSambaNova) ordered.push('sambanova')
    if (hasDeepSeek) ordered.push('deepseek')
    if (hasGroq) ordered.push('groq')
    if (hasCohere) ordered.push('cohere')
    if (hasHF) ordered.push('huggingface')
    return ordered
  }
  if (AI_PROVIDER === 'sambanova' || AI_PROVIDER === 'sn') {
    const ordered: Provider[] = ['sambanova']
    if (hasOpenRouter) ordered.push('openrouter')
    if (hasDeepSeek) ordered.push('deepseek')
    if (hasGroq) ordered.push('groq')
    if (hasCohere) ordered.push('cohere')
    if (hasHF) ordered.push('huggingface')
    return ordered
  }
  if (AI_PROVIDER === 'deepseek' || AI_PROVIDER === 'ds') {
    const ordered: Provider[] = ['deepseek']
    if (hasOpenRouter) ordered.push('openrouter')
    if (hasSambaNova) ordered.push('sambanova')
    if (hasGroq) ordered.push('groq')
    if (hasCohere) ordered.push('cohere')
    if (hasHF) ordered.push('huggingface')
    return ordered
  }
  if (AI_PROVIDER === 'groq') {
    const ordered: Provider[] = ['groq']
    if (hasOpenRouter) ordered.push('openrouter')
    if (hasSambaNova) ordered.push('sambanova')
    if (hasDeepSeek) ordered.push('deepseek')
    if (hasCohere) ordered.push('cohere')
    if (hasHF) ordered.push('huggingface')
    return ordered
  }
  if (AI_PROVIDER === 'cohere') {
    const ordered: Provider[] = ['cohere']
    if (hasOpenRouter) ordered.push('openrouter')
    if (hasSambaNova) ordered.push('sambanova')
    if (hasDeepSeek) ordered.push('deepseek')
    if (hasGroq) ordered.push('groq')
    if (hasHF) ordered.push('huggingface')
    return ordered
  }
  if (AI_PROVIDER === 'huggingface' || AI_PROVIDER === 'hf') {
    const ordered: Provider[] = ['huggingface']
    if (hasOpenRouter) ordered.push('openrouter')
    if (hasSambaNova) ordered.push('sambanova')
    if (hasDeepSeek) ordered.push('deepseek')
    if (hasGroq) ordered.push('groq')
    if (hasCohere) ordered.push('cohere')
    return ordered
  }

  const ordered: Provider[] = []
  if (hasOpenRouter) ordered.push('openrouter')
  if (hasSambaNova) ordered.push('sambanova')
  if (hasDeepSeek) ordered.push('deepseek')
  if (hasGroq) ordered.push('groq')
  if (hasCohere) ordered.push('cohere')
  if (hasHF) ordered.push('huggingface')
  return ordered
}

async function generateWithProviders(options: ChatOptions): Promise<{ content: string; tokens: number; modelUsed: string }> {
  const providers = resolveProviderOrder()
  if (providers.length === 0) {
    throw new Error('No AI provider configured. Set SAMBANOVA_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY, COHERE_API_KEY, or HF_TOKEN in .env.')
  }

  const failures: string[] = []
  for (const provider of providers) {
    try {
      if (provider === 'openrouter') {
        const result = await callOpenRouter(options)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      if (provider === 'sambanova') {
        const result = await callSambaNova(options)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      if (provider === 'deepseek') {
        const result = await callDeepSeek(options)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      if (provider === 'groq') {
        const result = await callGroq(options)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      if (provider === 'cohere') {
        const result = await callCohere(options)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      const result = await callHuggingFace(options)
      recordProviderSuccess(provider, result.modelUsed)
      return result
    } catch (error: any) {
      recordProviderFailure(provider, error)
      if (options.preferReasoning) {
        try {
          const fallbackOptions = {
            ...options,
            preferReasoning: false,
            maxTokens: Math.min(options.maxTokens, AI_MAX_TOKENS_SHORT),
          }
          if (provider === 'openrouter') {
            const result = await callOpenRouter(fallbackOptions)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          if (provider === 'sambanova') {
            const result = await callSambaNova(fallbackOptions)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          if (provider === 'deepseek') {
            const result = await callDeepSeek(fallbackOptions)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          if (provider === 'groq') {
            const result = await callGroq(fallbackOptions)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          if (provider === 'cohere') {
            const result = await callCohere(fallbackOptions)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          const result = await callHuggingFace(fallbackOptions)
          recordProviderSuccess(provider, result.modelUsed)
          return result
        } catch (fallbackError: any) {
          recordProviderFailure(provider, fallbackError)
          failures.push(`${provider} (reasoning): ${error?.message || 'Unknown error'}`)
          failures.push(`${provider} (fallback): ${fallbackError?.message || 'Unknown error'}`)
          continue
        }
      }
      failures.push(`${provider}: ${error?.message || 'Unknown error'}`)
    }
  }

  throw new Error(`All providers failed. ${failures.join(' | ')}`)
}

async function generateWithProvidersStream(
  options: ChatOptions,
  onDelta: (delta: string) => void,
  onThinking?: (thinking: string) => void
): Promise<{ content: string; thinking: string; tokens: number; modelUsed: string }> {
  const providers = resolveProviderOrder()
  if (providers.length === 0) {
    throw new Error('No AI provider configured. Set SAMBANOVA_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY, COHERE_API_KEY, or HF_TOKEN in .env.')
  }

  const failures: string[] = []
  for (const provider of providers) {
    let emitted = false
    const trackedDelta = (delta: string) => {
      if (!delta) return
      emitted = true
      onDelta(delta)
    }

    try {
      if (provider === 'openrouter') {
        const result = await callOpenRouterStream(options, trackedDelta, onThinking)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      if (provider === 'sambanova') {
        const result = await callSambaNovaStream(options, trackedDelta, onThinking)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      if (provider === 'deepseek') {
        const result = await callDeepSeekStream(options, trackedDelta, onThinking)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      if (provider === 'groq') {
        const result = await callGroqStream(options, trackedDelta, onThinking)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      if (provider === 'cohere') {
        const result = await callCohereStream(options, trackedDelta, onThinking)
        recordProviderSuccess(provider, result.modelUsed)
        return result
      }
      const result = await callHuggingFaceStream(options, trackedDelta, onThinking)
      recordProviderSuccess(provider, result.modelUsed)
      return result
    } catch (error: any) {
      if (emitted) {
        throw error
      }
      recordProviderFailure(provider, error)
      if (options.preferReasoning) {
        try {
          const fallbackOptions = {
            ...options,
            preferReasoning: false,
            maxTokens: Math.min(options.maxTokens, AI_MAX_TOKENS_SHORT),
          }
          if (provider === 'openrouter') {
            const result = await callOpenRouterStream(fallbackOptions, trackedDelta, onThinking)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          if (provider === 'sambanova') {
            const result = await callSambaNovaStream(fallbackOptions, trackedDelta, onThinking)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          if (provider === 'deepseek') {
            const result = await callDeepSeekStream(fallbackOptions, trackedDelta, onThinking)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          if (provider === 'groq') {
            const result = await callGroqStream(fallbackOptions, trackedDelta, onThinking)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          if (provider === 'cohere') {
            const result = await callCohereStream(fallbackOptions, trackedDelta, onThinking)
            recordProviderSuccess(provider, result.modelUsed)
            return result
          }
          const result = await callHuggingFaceStream(fallbackOptions, trackedDelta, onThinking)
          recordProviderSuccess(provider, result.modelUsed)
          return result
        } catch (fallbackError: any) {
          recordProviderFailure(provider, fallbackError)
          failures.push(`${provider} (reasoning): ${error?.message || 'Unknown error'}`)
          failures.push(`${provider} (fallback): ${fallbackError?.message || 'Unknown error'}`)
          continue
        }
      }
      failures.push(`${provider}: ${error?.message || 'Unknown error'}`)
    }
  }

  throw new Error(`All providers failed. ${failures.join(' | ')}`)
}

// Personality prompts for each mode
const PERSONALITY_PROMPTS: Record<AIMode, string> = {
  strict: `You are AI Buddy in strict mode: a no-nonsense but supportive JEE mentor.

CRITICAL RULES:
- Keep the tone firm but respectful, like a senior friend who wants you to improve.
- Use clear structure with numbered steps.
- Focus on accuracy, common mistakes, and clean reasoning.
- Keep it concise and method-driven.
- If the student repeats a mistake, diagnose the cause and give a fix strategy.

Example response style:
"Nice try. The sign is off. Let's fix it step by step and lock the method."

Format all mathematical expressions in LaTeX using $ for inline and $$ for block formulas.`,

  friendly: `You are AI Buddy, a friendly JEE prep companion.

CRITICAL RULES:
- Talk like a supportive friend (simple Hinglish is OK).
- Keep it warm, casual, and motivating without losing correctness.
- Start with intuition, then show the clean steps.
- Appreciate effort, then refine the approach.
- If the student repeats a mistake, guide them gently to a better method.

Example response style:
"Chill, ye doable hai. Pehle concept pakadte hain, phir formula lagaate hain."

Format all mathematical expressions in LaTeX using $ for inline and $$ for block formulas.`,

  exam: `You are AI Buddy in exam mode: quick, high-yield, and still friendly.

CRITICAL RULES:
- Keep answers short, sharp, and correct.
- Highlight shortcuts, traps, and scoring logic.
- End with the final answer clearly.
- If the student repeats a mistake, give a short anti-error checklist.

Example response style:
"Fast method: use symmetry. Trap: sign convention. Final answer below."

Format all mathematical expressions in LaTeX using $ for inline and $$ for block formulas.`
}

const UNIVERSAL_TUTOR_RULES = `
UNIVERSAL OUTPUT RULES:
- You are AI Buddy for JEE preparation.
- Keep explanations correct, clear, and friendly.
- Every mathematical expression must use LaTeX delimiters: inline $...$ and display $$...$$.
- Never leave formulas as plain text without LaTeX delimiters.
- Do not output any <thinking>...</thinking> tags or hidden-reasoning blocks in the final response.
- Keep length aligned with the user's request (short if asked, detailed if needed).
- Treat the student as a JEE aspirant; keep difficulty at JEE Main/Advanced level (not class-10/board level).
- For practice questions, ensure multi-step reasoning and (when possible) combine at least two concepts.
- When helpful, end with a quick practice question and a brief 3-5 step solution.
`

// System prompt that combines personality with context
function buildSystemPrompt(context: AIContext): string {
  const personalityPrompt = PERSONALITY_PROMPTS[context.mode]
  
  let contextPrompt = `${personalityPrompt}\n\n${UNIVERSAL_TUTOR_RULES}`
  
  if (context.subject) {
    contextPrompt += `\n\nCurrent subject: ${context.subject}`
  }
  
  if (context.chapter) {
    contextPrompt += `\nCurrent chapter: ${context.chapter}`
  }
  
  contextPrompt += `\nTarget difficulty: JEE Main/Advanced (not board-level).`
  
  return contextPrompt
}

function buildThinkingSummary(message: string, context: AIContext): string {
  const topic = context.chapter || context.subject || ''
  const topicLine = topic ? `Identify the topic focus (${topic}) and the target quantity.` : 'Identify the topic focus and the target quantity.'
  const bullets = [
    topicLine,
    'Select the most direct JEE method and the governing formulas.',
    'Solve with clean steps, units, and sign checks.',
    'Conclude with a verified final answer and exam takeaways.'
  ]

  const trimmedMessage = message?.trim() || ''
  const shortList = trimmedMessage.length < 12 ? bullets.slice(0, 2) : bullets.slice(0, 3)
  return shortList.map(item => `- ${item}`).join('\n')
}

function stripThinkingSummary(response: string): {
  cleanedResponse: string
  extractedThinking: string
} {
  if (!response) return { cleanedResponse: '', extractedThinking: '' }

  let extractedThinking = ''
  const cleanedResponse = response
    .replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (_, inner: string) => {
      if (!extractedThinking) {
        extractedThinking = (inner || '').trim()
      }
      return ''
    })
    .trim()

  return {
    cleanedResponse: cleanedResponse || response.trim(),
    extractedThinking,
  }
}

// Get user's learning patterns from history
async function getUserPatterns(userId: string): Promise<{
  weakAreas: string[]
  recentTopics: string[]
  commonMistakes: string[]
}> {
  const recentHistory = await db.aIHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      subject: true,
      chapter: true,
      userMessage: true,
      aiResponse: true
    }
  })
  
  const weakAreas: string[] = []
  const recentTopics: string[] = []
  const commonMistakes: string[] = []
  
  for (const entry of recentHistory) {
    if (entry.chapter && !recentTopics.includes(entry.chapter)) {
      recentTopics.push(entry.chapter)
    }
    
    // Detect weak areas from responses mentioning mistakes
    const mistakeMatch = entry.aiResponse?.toLowerCase().match(/(incorrect|wrong|mistake|error|misconception|confusion)/i)
    if (mistakeMatch && entry.chapter) {
      if (!weakAreas.includes(entry.chapter)) {
        weakAreas.push(entry.chapter)
      }
    }
  }
  
  return { weakAreas, recentTopics, commonMistakes }
}

// Detect subject and chapter from message
function detectContext(message: string): { subject?: string; chapter?: string } {
  const subjects = {
    Physics: ['mechanics', 'electromagnetism', 'optics', 'thermodynamics', 'modern physics', 'waves', 'kinematics', 'dynamics', 'electrostatics', 'magnetism', 'current', 'induction'],
    Chemistry: ['organic', 'inorganic', 'physical', 'chemical bonding', 'equilibrium', 'kinetics', 'electrochemistry', 'thermodynamics', 'coordination', 'hydrocarbons', 'periodic'],
    Mathematics: ['calculus', 'algebra', 'geometry', 'trigonometry', 'probability', 'matrices', 'determinants', 'functions', 'limits', 'derivatives', 'integrals', 'vectors', 'coordinate']
  }
  
  const lowerMessage = message.toLowerCase()
  
  for (const [subject, keywords] of Object.entries(subjects)) {
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        return { subject }
      }
    }
  }
  
  return {}
}

interface PreparedRouteQuery {
  subject?: string
  chapter?: string
  messages: ChatMessage[]
  preferReasoning: boolean
}

async function prepareRouteQuery(
  message: string,
  context: AIContext
): Promise<PreparedRouteQuery> {
  const detected = detectContext(message)
  const subject = context.subject || detected.subject
  const chapter = context.chapter || detected.chapter

  const patterns = await getUserPatterns(context.userId)
  let enhancedMessage = message
  if (patterns.weakAreas.length > 0 && chapter && patterns.weakAreas.includes(chapter)) {
    enhancedMessage = `[Context: This student has shown weakness in ${chapter} before. Reference their learning pattern.]\n\n${message}`
  }
  enhancedMessage += `\n\n[Mandatory Output Format: End this response with a "Practice Question (JEE Advanced, multi-step)" section and a "Step-by-Step Solution" section. The practice question must be JEE Main/Advanced level (not class-10/board), include multi-step reasoning, and ideally combine at least two concepts. In every solution step, explicitly write "Method Used" and "Formula Used".]`

  const preferReasoning = false

  const systemPrompt = buildSystemPrompt({ ...context, subject, chapter })
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]

  if (context.conversationHistory && context.conversationHistory.length > 0) {
    for (const msg of context.conversationHistory.slice(-AI_HISTORY_WINDOW)) {
      messages.push(msg)
    }
  }
  messages.push({ role: 'user', content: enhancedMessage })

  return { subject, chapter, messages, preferReasoning }
}

async function persistAIHistory(
  userId: string,
  subject: string | undefined,
  chapter: string | undefined,
  mode: AIMode,
  userMessage: string,
  aiResponse: string,
  modelUsed: string,
  tokensUsed: number
) {
  await db.aIHistory.create({
    data: {
      userId,
      subject: subject || null,
      chapter: chapter || null,
      mode,
      userMessage,
      aiResponse,
      modelUsed,
      tokensUsed,
    },
  })
}

// Main AI Router - determines which model to use based on complexity
export async function routeAIQuery(
  message: string,
  context: AIContext
): Promise<AIResponse> {
  try {
    const prepared = await prepareRouteQuery(message, context)
    const completion = await generateWithProviders({
      messages: prepared.messages,
      temperature: context.mode === 'strict' ? 0.3 : context.mode === 'friendly' ? 0.7 : 0.5,
      maxTokens: prepared.preferReasoning ? AI_MAX_TOKENS_LONG : AI_MAX_TOKENS_CHAT,
      preferReasoning: prepared.preferReasoning,
    })

    const rawResponse = normalizeMathDelimiters(
      completion.content || 'Unable to generate response.'
    )
    const { cleanedResponse } = stripThinkingSummary(rawResponse)
    await persistAIHistory(
      context.userId,
      prepared.subject,
      prepared.chapter,
      context.mode,
      message,
      cleanedResponse,
      completion.modelUsed,
      completion.tokens
    )

    return {
      response: cleanedResponse,
      modelUsed: completion.modelUsed,
      tokensUsed: completion.tokens,
    }
  } catch (error: any) {
    console.error('AI Error:', error)
    const fallbackResponse = generateFallbackResponse(message, context.mode)
    return {
      response: fallbackResponse,
      modelUsed: 'fallback',
      tokensUsed: 0,
    }
  }
}

export async function routeAIQueryStream(
  message: string,
  context: AIContext,
  handlers: { onDelta: (delta: string) => void; onThinking?: (thinking: string) => void }
): Promise<AIResponse> {
  let emitted = false
  let thoughtEmitted = false
  let prepared: Awaited<ReturnType<typeof prepareRouteQuery>> | null = null
  const trackedDelta = (delta: string) => {
    if (!delta) return
    emitted = true
    handlers.onDelta(delta)
  }
  const trackedThinking = (thinking: string) => {
    if (!thinking) return
    thoughtEmitted = true
    handlers.onThinking?.(thinking)
  }

  try {
    prepared = await prepareRouteQuery(message, context)
    trackedThinking(buildThinkingSummary(message, context))
    const completion = await generateWithProvidersStream(
      {
        messages: prepared.messages,
        temperature: context.mode === 'strict' ? 0.3 : context.mode === 'friendly' ? 0.7 : 0.5,
        maxTokens: AI_MAX_TOKENS_CHAT,
        preferReasoning: false,
      },
      trackedDelta,
      trackedThinking
    )

    const rawResponse = normalizeMathDelimiters(
      completion.content || 'Unable to generate response.'
    )
    const { cleanedResponse, extractedThinking } = stripThinkingSummary(rawResponse)
    if (extractedThinking && !thoughtEmitted) {
      trackedThinking(extractedThinking)
    }
    await persistAIHistory(
      context.userId,
      prepared.subject,
      prepared.chapter,
      context.mode,
      message,
      cleanedResponse,
      completion.modelUsed,
      completion.tokens
    )

    return {
      response: cleanedResponse,
      modelUsed: completion.modelUsed,
      tokensUsed: completion.tokens,
    }
  } catch (error: any) {
    console.error('AI Stream Error:', error)
    if (emitted) {
      throw error
    }
    if (prepared) {
      try {
        const completion = await generateWithProviders({
          messages: prepared.messages,
          temperature: context.mode === 'strict' ? 0.3 : context.mode === 'friendly' ? 0.7 : 0.5,
          maxTokens: AI_MAX_TOKENS_CHAT,
          preferReasoning: false,
        })
        const rawResponse = normalizeMathDelimiters(
          completion.content || 'Unable to generate response.'
        )
        const { cleanedResponse, extractedThinking } = stripThinkingSummary(rawResponse)
        if (extractedThinking && !thoughtEmitted) {
          trackedThinking(extractedThinking)
        }
        trackedDelta(cleanedResponse)
        await persistAIHistory(
          context.userId,
          prepared.subject,
          prepared.chapter,
          context.mode,
          message,
          cleanedResponse,
          completion.modelUsed,
          completion.tokens
        )
        return {
          response: cleanedResponse,
          modelUsed: completion.modelUsed,
          tokensUsed: completion.tokens,
        }
      } catch (fallbackError: any) {
        console.error('AI Stream Fallback Error:', fallbackError)
      }
    }
    const fallbackResponse = generateFallbackResponse(message, context.mode)
    if (!thoughtEmitted) {
      trackedThinking(buildThinkingSummary(message, context))
    }
    trackedDelta(fallbackResponse)
    return {
      response: fallbackResponse,
      modelUsed: 'fallback',
      tokensUsed: 0,
    }
  }
}

// Fallback response when AI is unavailable
function generateFallbackResponse(message: string, mode: AIMode): string {
  const lowerMessage = message.toLowerCase()
  
  if (mode === 'strict') {
    if (lowerMessage.includes('help') || lowerMessage.includes('explain')) {
      return 'AI Buddy needs a precise question. What concept or problem requires clarification?'
    }
    return 'AI Buddy needs more context. Rephrase your question with a specific topic.'
  }
  
  if (mode === 'friendly') {
    return 'AI Buddy is having a quick hiccup right now. Could you rephrase your question or try again in a moment? I want to help you properly.'
  }
  
  // Exam mode
  return 'AI Buddy is temporarily unavailable. While I am away, revise core concepts and solve a few PYQs. Please try again in a moment.'
}

function buildOfflineRevisionNotes(
  subject: string,
  chapter: string,
  examType: 'JEE Main' | 'JEE Advanced'
): string {
  const safeSubject = (subject || 'General Science').trim()
  const safeChapter = (chapter || 'Current Topic').trim()
  const subjectKey = safeSubject.toLowerCase()

  let conceptMap: string[] = [
    'List core topic -> subtopic -> typical JEE question type.',
    'Connect definitions to standard result/formula use-cases.',
    'Link chapter ideas to neighboring chapters for mixed questions.'
  ]

  let keyConcepts: string[] = [
    'Define every core term and identify where it is used in standard JEE problems.',
    'Map the chapter into sub-topics and connect each sub-topic to one solved example.',
    'Focus on unit consistency, approximation limits, and common assumptions made in exam questions.'
  ]

  let coreTheory: string[] = [
    'Write the main laws/principles and their validity conditions.',
    'State assumptions clearly before using any formula.',
    'Mention the physical/chemical meaning of each term.'
  ]

  let formulas: string[] = [
    '$$\\text{Result} = \\text{Concept} + \\text{Condition} + \\text{Correct Units}$$',
    '$$\\text{Error \\%} = \\frac{|\\text{Expected} - \\text{Observed}|}{\\text{Expected}}\\times 100$$'
  ]

  let derivations: string[] = [
    'Start from definitions or fundamental laws and show step-by-step transformations.',
    'Highlight approximations or boundary conditions used during derivation.',
    'Confirm final expression with dimensional/units check.'
  ]

  let specialCases: string[] = [
    'Identify low/high limit behavior and common simplifying cases.',
    'State where formulas reduce to simpler known results.'
  ]

  let graphs: string[] = [
    'Note any standard graph shapes, slopes, intercepts, and turning points.'
  ]

  let pyqPatterns: string[] = [
    'Concept identification + direct substitution question.',
    'Mixed-concept question that combines this chapter with one neighboring chapter.',
    'Numerical estimation question with unit/trend check.'
  ]

  let commonMistakes: string[] = [
    'Jumping to formulas without writing known/given quantities first.',
    'Using the right formula in the wrong validity range.',
    'Skipping dimensional/unit checks in final step.'
  ]

  let checklist: string[] = [
    'I can solve 3 standard PYQ patterns of this chapter without hints.',
    'I can write all core formulas/definitions from memory in under 3 minutes.',
    'I can explain why each common trap answer is wrong.'
  ]

  if (subjectKey.includes('math')) {
    conceptMap = [
      'Function type -> standard identities -> typical simplification tasks.',
      'Algebraic manipulation -> domain/range checks -> solution validation.',
      'Calculus tools -> monotonicity/optimization -> graph interpretation.'
    ]
    keyConcepts = [
      'Identify the function/object type first (algebraic, trigonometric, vector, coordinate, etc.).',
      'Track domain restrictions and special cases before algebraic manipulation.',
      'Use graph/geometry intuition to validate algebraic output.'
    ]
    coreTheory = [
      'List core definitions, theorems, and standard identities used in this chapter.',
      'State conditions of validity for each identity/theorem.',
      'Explain how each tool connects to typical JEE problems.'
    ]
    formulas = [
      '$$\\frac{d}{dx}(x^n)=nx^{n-1},\\quad \\int x^n\\,dx=\\frac{x^{n+1}}{n+1}+C$$',
      '$$\\sin^2\\theta+\\cos^2\\theta=1,\\quad 1+\\tan^2\\theta=\\sec^2\\theta$$',
      '$$a_n=a_1+(n-1)d,\\quad S_n=\\frac{n}{2}[2a_1+(n-1)d]$$'
    ]
    derivations = [
      'Derive core identities from definitions or standard theorems.',
      'Show step-by-step calculus derivations for key results.',
      'Explain domain constraints during transformations.'
    ]
    specialCases = [
      'Handle boundary values, asymptotes, and discontinuities.',
      'Check behavior at special angles/limits.'
    ]
    graphs = [
      'Sketch key function shapes and highlight slopes/critical points.',
      'Map algebraic results to graph behavior.'
    ]
    pyqPatterns = [
      'Identity transformation followed by simplification.',
      'Parameter-based equation with validity/domain condition.',
      'Multi-step calculus/algebra question where one smart substitution reduces effort.'
    ]
    commonMistakes = [
      'Ignoring domain/range while squaring or cross-multiplying.',
      'Dropping constant/sign during differentiation/integration steps.',
      'Over-expanding expressions instead of spotting standard identities.'
    ]
    checklist = [
      'I can solve one moderate and one difficult chapter question with full steps.',
      'I can state all chapter-specific identities/formulas from memory.',
      'I verify domain and special values in every final answer.'
    ]
  } else if (subjectKey.includes('chem')) {
    conceptMap = [
      'Structure/periodicity -> properties -> typical MCQ patterns.',
      'Equilibrium/thermo -> quantitative relations -> numericals.',
      'Organic reactions -> mechanism -> product prediction.'
    ]
    keyConcepts = [
      'Separate factual memory points from conceptual reasoning parts.',
      'Use periodic trends/equilibrium/thermo logic to justify outcomes.',
      'Write reaction conditions explicitly before predicting products.'
    ]
    coreTheory = [
      'List governing laws (thermo, equilibrium, kinetics) with conditions.',
      'State definitions of key terms and their standard units.',
      'Explain how trends or mechanisms drive outcomes.'
    ]
    formulas = [
      '$$\\Delta G=\\Delta H-T\\Delta S$$',
      '$$\\mathrm{pH}=-\\log_{10}[H^+],\\quad \\mathrm{pOH}=-\\log_{10}[OH^-]$$',
      '$$K=e^{-\\Delta G^{\\circ}/RT}$$'
    ]
    derivations = [
      'Show derivations of standard thermodynamic/equilibrium relations.',
      'Explain algebraic rearrangements and assumptions clearly.'
    ]
    specialCases = [
      'Note standard approximations used in buffer/solubility problems.',
      'Highlight temperature/pressure limits for equilibrium shifts.'
    ]
    graphs = [
      'Include common plots (e.g., ln K vs 1/T) and their interpretation.'
    ]
    pyqPatterns = [
      'Trend-based conceptual MCQ (periodicity/bonding/stability).',
      'Reaction pathway + product major/minor selection question.',
      'Numerical question using mole concept/equilibrium/thermo relation.'
    ]
    commonMistakes = [
      'Applying exceptions incorrectly in periodic/organic trends.',
      'Forgetting reaction conditions (solvent, temperature, catalyst).',
      'Unit conversion errors in concentration/thermo numericals.'
    ]
    checklist = [
      'I can classify chapter reactions/mechanisms into clear buckets.',
      'I can solve standard chapter numericals without formula lookup.',
      'I revise named reactions/exceptions once before mock tests.'
    ]
  } else if (subjectKey.includes('phys')) {
    conceptMap = [
      'Forces/fields -> equations of motion -> energy relations.',
      'Constraints -> system equations -> solved outcomes.',
      'Graph interpretation -> physical meaning -> quick checks.'
    ]
    keyConcepts = [
      'Draw force/field/energy diagram before writing equations.',
      'Choose a consistent sign convention and coordinate axis early.',
      'Check limiting cases to validate final physical behavior.'
    ]
    coreTheory = [
      'State the fundamental laws (Newton, energy, momentum) and validity.',
      'Define system boundaries and internal/external forces.',
      'List assumptions made (rigid, frictionless, small angle, etc.).'
    ]
    formulas = [
      '$$F=ma,\\quad W=\\Delta K$$',
      '$$v=u+at,\\quad s=ut+\\frac{1}{2}at^2,\\quad v^2-u^2=2as$$',
      '$$P=\\frac{W}{t},\\quad \\eta=\\frac{\\text{useful output}}{\\text{input}}\\times 100\\%$$'
    ]
    derivations = [
      'Derive results from Newton\'s laws or energy principles step-by-step.',
      'Show the logic behind kinematic relations and conservation laws.',
      'Validate with dimensional analysis.'
    ]
    specialCases = [
      'Small-angle approximations, low/high speed limits, frictionless cases.',
      'Common boundary conditions used in JEE problems.'
    ]
    graphs = [
      'Highlight slope/area meanings in v-t, a-t, x-t graphs.',
      'Connect graph features to physical behavior.'
    ]
    pyqPatterns = [
      'Direct formula + unit consistency question.',
      'Constraint-based multi-body/system question.',
      'Conceptual graph/statement-based interpretation question.'
    ]
    commonMistakes = [
      'Wrong sign convention between displacement/velocity/acceleration.',
      'Mixing scalar and vector treatment in the same step.',
      'Skipping free-body or energy balance setup before calculation.'
    ]
    checklist = [
      'I can solve one timed PYQ each for conceptual and numerical format.',
      'I can derive the most-used chapter formula once without notes.',
      'I check dimensions and direction before final answer lock.'
    ]
  }

  return `## Chapter Overview
${safeChapter} is an important ${safeSubject} topic for ${examType}. Focus on concept clarity, quick formula recall, and timed problem solving with error checks.

## Concept Map
${conceptMap.map(item => `- ${item}`).join('\n')}

## Key Concepts
${keyConcepts.map(item => `- ${item}`).join('\n')}

## Core Theory (Concise but Complete)
${coreTheory.map(item => `- ${item}`).join('\n')}

## Formula Sheet (Complete)
${formulas.map(item => `- ${item}`).join('\n')}

## Derivations (Step-by-step)
${derivations.map(item => `- ${item}`).join('\n')}

## Special Cases & Limits
${specialCases.map(item => `- ${item}`).join('\n')}

## Graphs / Trends (if applicable)
${graphs.map(item => `- ${item}`).join('\n')}

## PYQ Patterns
${pyqPatterns.map(item => `- ${item}`).join('\n')}

## Common Mistakes
${commonMistakes.map(item => `- ${item}`).join('\n')}

## Quick Revision Checklist
${checklist.map(item => `- [ ] ${item}`).join('\n')}
`
}

// Generate revision notes
export async function generateRevisionNotes(
  subject: string,
  chapter: string,
  examType: 'JEE Main' | 'JEE Advanced',
  userId: string
): Promise<string> {
  const safeSubject = subject.trim()
  const safeChapter = chapter.trim()
  const safeExamType = examType

  const offlineFallback = normalizeMathDelimiters(
    buildOfflineRevisionNotes(safeSubject, safeChapter, safeExamType)
  )

  // Check if a shared note already exists for this chapter
  try {
    const shared = await db.revisionNoteGlobal.findUnique({
      where: {
        subject_chapter_examType: {
          subject: safeSubject,
          chapter: safeChapter,
          examType: safeExamType
        }
      }
    })

    if (shared) {
      return normalizeMathDelimiters(shared.content)
    }
  } catch (lookupError) {
    console.error('Revision notes shared lookup error:', lookupError)
  }

  // Check if notes already exist for this user
  try {
    const existing = await db.revisionNote.findUnique({
      where: {
        userId_subject_chapter_examType: {
          userId,
          subject: safeSubject,
          chapter: safeChapter,
          examType: safeExamType
        }
      }
    })

    if (existing) {
      const content = normalizeMathDelimiters(existing.content)
      // Backfill shared cache so others can reuse without AI.
      try {
        await db.revisionNoteGlobal.upsert({
          where: {
            subject_chapter_examType: {
              subject: safeSubject,
              chapter: safeChapter,
              examType: safeExamType
            }
          },
          update: { content },
          create: {
            subject: safeSubject,
            chapter: safeChapter,
            examType: safeExamType,
            content
          }
        })
      } catch (saveError) {
        console.error('Revision notes shared save error:', saveError)
      }
      return content
    }
  } catch (lookupError) {
    console.error('Revision notes lookup error:', lookupError)
  }
  
  const systemPrompt = `You are an expert JEE faculty member writing textbook-style revision notes for ${examType}.

Goal: produce book-like chapter notes that feel like a mini textbook. Cover every major subtopic (parts) of the chapter with explanations, formulas, and important points.

Generate structured notes in the following format (use Markdown headings exactly):

## Chapter Overview
[6-8 line summary of the chapter, key goals, and typical exam focus]

## Chapter Parts (Book Style)
### Part 1: [Subtopic name]
[2-5 short paragraphs explaining the concept, intuition, and applications]
**Important Points**
- [Key points, conditions, assumptions, units]
**Formulas**
- [Use LaTeX with $$ for display; define variables inline]
**Mini Derivation / Reasoning**
- [Show key steps or reasoning for the main result]
**Exam Tips / Traps**
- [Common pitfalls and how to avoid them]

### Part 2: [Subtopic name]
...

Rules for parts:
- Include ALL major subtopics in the chapter.
- For large chapters, write at least 5 parts; for smaller chapters, at least 3 parts.
- Each part must include Important Points and Formulas.

## Master Formula Sheet (Complete)
- [List every relevant formula for this chapter]
- [Use LaTeX with $$ for display]
- [Mention variable meanings and units inline]

## Derivations (Step-by-step)
- [Derive each major formula or result]
- [Use LaTeX and show steps, not just final results]
- [State assumptions/approximations clearly]

## Special Cases & Limits
- [Edge cases, limiting forms, common approximations]

## Graphs / Trends (if applicable)
- [Key graphs, slopes, intercepts, and interpretation]

## PYQ Patterns
- [Common question types and patterns from previous years]

## Common Mistakes
- [Mistakes students often make in this chapter]

## Quick Revision Checklist
- [ ] [Checklist item 1]
- [ ] [Checklist item 2]
...

Be detailed and fairly long. Do not omit important formulas. Use LaTeX for all mathematical expressions. Do not output JSON.`

  const userPrompt = `Create book-like revision notes for ${safeSubject} - ${safeChapter} for ${safeExamType}. Cover every major subtopic with explanations, important points, and formulas (with variable meanings). Include derivations where relevant.`

  try {
    const completion = await generateWithProviders({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      maxTokens: Math.min(AI_MAX_TOKENS_NOTES, 6000),
      preferReasoning: false
    })

    const rawContent = (completion.content || '').trim()
    const content = normalizeMathDelimiters(rawContent || offlineFallback)
    
    // Save generated notes when DB is available, but do not fail response if save fails.
    try {
      if (rawContent) {
        await db.revisionNote.create({
          data: {
            userId,
            subject: safeSubject,
            chapter: safeChapter,
            examType: safeExamType,
            content
          }
        })
        await db.revisionNoteGlobal.upsert({
          where: {
            subject_chapter_examType: {
              subject: safeSubject,
              chapter: safeChapter,
              examType: safeExamType
            }
          },
          update: { content },
          create: {
            subject: safeSubject,
            chapter: safeChapter,
            examType: safeExamType,
            content
          }
        })
      }
    } catch (saveError) {
      console.error('Revision notes save error:', saveError)
    }
    
    return content
  } catch (error) {
    console.error('Revision notes error:', error)
    return offlineFallback
  }
}

// Generate hint for a question
export async function generateHint(
  question: string,
  subject: string,
  userId: string,
  mode: AIMode
): Promise<string> {
  const systemPrompt = `You are a JEE faculty member. Generate a hint for the given question.
${PERSONALITY_PROMPTS[mode]}

IMPORTANT: 
- Provide only a hint, NOT the full solution
- Guide the student toward the approach
- Keep it brief (2-3 sentences max)
  - Use LaTeX for mathematical expressions`

  try {
    const preferReasoning = question.split(/\s+/).length > 60 || /\$|\\begin|\\frac|\\int|\\sum|\\sqrt|\\partial/.test(question)
    const completion = await generateWithProviders({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Question: ${question}\n\nProvide a hint.` }
      ],
      temperature: 0.6,
      maxTokens: AI_MAX_TOKENS_HINT,
      preferReasoning
    })

    return normalizeMathDelimiters(
      completion.content || 'Think about the fundamental concepts involved.'
    )
  } catch (error) {
    return 'Consider the basic principles and formulas related to this topic.'
  }
}

type PracticeDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Advanced' | 'Irodov'

interface PracticeQuestionDraft {
  subject: string
  chapter: string
  difficulty: PracticeDifficulty
  type: 'single'
  question: string
  options: string[]
  correctAnswer: string
  solution?: string
  hint?: string
  explanation?: string
}

function extractJsonPayload(text: string): any | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed) return null

  const looksLikeJson = (value: string) =>
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'))

  if (looksLikeJson(trimmed)) {
    try {
      return JSON.parse(trimmed)
    } catch {
      // continue
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const firstBracket = trimmed.indexOf('[')
  let start = -1
  let end = -1
  if (firstBrace >= 0 && (firstBrace < firstBracket || firstBracket < 0)) {
    start = firstBrace
    end = trimmed.lastIndexOf('}')
  } else if (firstBracket >= 0) {
    start = firstBracket
    end = trimmed.lastIndexOf(']')
  }

  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1)
    try {
      return JSON.parse(slice)
    } catch {
      return null
    }
  }

  return null
}

function normalizePracticeDifficulty(value: any): PracticeDifficulty {
  const lowered = String(value || '').toLowerCase()
  if (lowered.includes('irodov')) return 'Irodov'
  if (lowered.includes('advanced') || lowered.includes('adv')) return 'Advanced'
  if (lowered.includes('easy')) return 'Easy'
  if (lowered.includes('hard')) return 'Hard'
  return 'Medium'
}

export async function generatePracticeQuestions(
  subject: string,
  chapter: string,
  difficulty: string,
  count: number,
  userId: string,
  options: { throwOnError?: boolean } = {}
): Promise<PracticeQuestionDraft[]> {
  const safeCount = Math.min(Math.max(count, 1), 10)
  const targetSubject = subject || 'General'
  const targetChapter = chapter || 'Mixed'
  const targetDifficulty = normalizePracticeDifficulty(difficulty)
  const isPhysics = /physics/i.test(targetSubject)
  const difficultyGuidance =
    targetDifficulty === 'Irodov'
      ? (isPhysics
          ? '- Style: I.E. Irodov inspired Physics problems (multi-step, deep reasoning, calculus/geometry where relevant).'
          : '- Style: Advanced/JEE Advanced level (Irodov is Physics-only; keep it advanced and multi-step).')
      : targetDifficulty === 'Advanced'
        ? '- Style: JEE Advanced level (multi-step reasoning, concept integration, not formula-only).'
        : '- Style: JEE Main level (clear, exam-style, conceptual but concise).'

  const systemPrompt = `You are a senior JEE faculty member. Generate practice questions in the same style as standard JEE practice sets.

Rules:
- Output ONLY valid JSON.
- Provide exactly ${safeCount} questions.
- Each question must be single-correct MCQ with exactly 4 options.
- Use LaTeX for mathematical expressions (use $...$ for inline, $$...$$ for display).
- Provide a concise but complete solution.
- Provide a short hint (1-2 lines).
- correctAnswer must be a string index: "0", "1", "2", or "3".
- Difficulty must match JEE Main/Advanced style, not class-10/board level.
- Even "Easy" should feel like JEE Main entry-level, not NCERT basics.
${difficultyGuidance}

Required JSON schema:
{
  "questions": [
    {
      "subject": string,
      "chapter": string,
      "difficulty": "Easy" | "Medium" | "Hard",
      "type": "single",
      "question": string,
      "options": [string, string, string, string],
      "correctAnswer": "0" | "1" | "2" | "3",
      "solution": string,
      "hint": string,
      "explanation": string
    }
  ]
}`

  const userPrompt = `Generate ${safeCount} JEE-level practice MCQs.
Subject: ${targetSubject}
Chapter: ${targetChapter}
Difficulty: ${targetDifficulty}

Keep questions concise and unambiguous. Avoid class-10/board-level patterns.`

  try {
    const completion = await generateWithProviders({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      maxTokens: AI_MAX_TOKENS_SHORT,
      preferReasoning: true
    })

    const payload = extractJsonPayload(completion.content || '')
    const list = Array.isArray(payload) ? payload : payload?.questions
    if (!Array.isArray(list)) return []

    const normalized = list.map((item: any) => {
      const rawOptions = Array.isArray(item?.options) ? item.options : []
      const normalizedOptions = rawOptions
        .map((opt: any) => normalizeMathDelimiters(String(opt ?? '').trim()))
        .filter(Boolean)
        .slice(0, 4)

      if (normalizedOptions.length !== 4) return null

      const correctIndex = Number.parseInt(String(item?.correctAnswer ?? ''), 10)
      const safeIndex = Number.isFinite(correctIndex) && correctIndex >= 0 && correctIndex <= 3
        ? String(correctIndex)
        : '0'

      return {
        subject: String(item?.subject || targetSubject).trim() || targetSubject,
        chapter: String(item?.chapter || targetChapter).trim() || targetChapter,
        difficulty: normalizePracticeDifficulty(item?.difficulty || targetDifficulty),
        type: 'single' as const,
        question: normalizeMathDelimiters(String(item?.question ?? '').trim()),
        options: normalizedOptions,
        correctAnswer: safeIndex,
        solution: item?.solution ? normalizeMathDelimiters(String(item.solution).trim()) : undefined,
        hint: item?.hint ? normalizeMathDelimiters(String(item.hint).trim()) : undefined,
        explanation: item?.explanation ? normalizeMathDelimiters(String(item.explanation).trim()) : undefined
      } as PracticeQuestionDraft
    }).filter(Boolean) as PracticeQuestionDraft[]

    return normalized.slice(0, safeCount)
  } catch (error) {
    console.error('Practice question generation error:', error)
    if (options.throwOnError) {
      throw error
    }
    return []
  }
}

interface PracticeReviewPayload {
  question: string
  options: string[]
  correctAnswer: string
  userAnswer: string | number
  isCorrect: boolean
  subject: string
  chapter: string
  difficulty: PracticeDifficulty
  solution?: string
  timeTaken?: number
  stats?: {
    attempted: number
    correct: number
    accuracy: number
    avgTime: number
  }
}

interface PracticeReviewResponse {
  friendlyMessage: string
  mistake: string
  fix: string
  alternativeApproach: string
}

export async function generatePracticeReview(
  payload: PracticeReviewPayload,
  mode: AIMode
): Promise<PracticeReviewResponse> {
  const safeStats = payload.stats || { attempted: 0, correct: 0, accuracy: 0, avgTime: 0 }
  const systemPrompt = `You are a friendly IIT-JEE mentor monitoring a student's practice session.

Rules:
- Output ONLY valid JSON.
- Keep feedback concise and encouraging.
- If the answer is correct, the "mistake" should say no mistake and suggest a small improvement.
- "fix" should explain how to correct the mistake and the right method.
- "alternativeApproach" should teach a different valid method (even if correct).
- Use LaTeX for math using $...$ or $$...$$.

Required JSON schema:
{
  "friendlyMessage": string,
  "mistake": string,
  "fix": string,
  "alternativeApproach": string
}`

  const userPrompt = `Question: ${payload.question}
Options: ${payload.options.map((opt, idx) => `${idx}. ${opt}`).join(' | ')}
Correct Answer Index: ${payload.correctAnswer}
User Answer: ${payload.userAnswer}
Is Correct: ${payload.isCorrect}
Subject: ${payload.subject}
Chapter: ${payload.chapter}
Difficulty: ${payload.difficulty}
Time Taken (s): ${payload.timeTaken ?? 0}
Session Stats: attempted=${safeStats.attempted}, correct=${safeStats.correct}, accuracy=${safeStats.accuracy}%, avgTime=${safeStats.avgTime}s
Solution: ${payload.solution || 'N/A'}

Give feedback now.`

  try {
    const completion = await generateWithProviders({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      maxTokens: AI_MAX_TOKENS_SHORT,
      preferReasoning: true
    })

    const parsed = extractJsonPayload(completion.content || '')
    const response = parsed && typeof parsed === 'object' ? parsed : null

    const friendlyMessage = normalizeMathDelimiters(String(response?.friendlyMessage || '').trim())
    const mistake = normalizeMathDelimiters(String(response?.mistake || '').trim())
    const fix = normalizeMathDelimiters(String(response?.fix || '').trim())
    const alternativeApproach = normalizeMathDelimiters(String(response?.alternativeApproach || '').trim())

    return {
      friendlyMessage: friendlyMessage || 'Good effort. Keep your focus steady and watch for small sign or algebra slips.',
      mistake: mistake || (payload.isCorrect ? 'No mistake here. Try to reduce steps for speed and accuracy.' : 'There was a small conceptual or algebraic slip.'),
      fix: fix || 'Re-check the core formula and apply it carefully step-by-step.',
      alternativeApproach: alternativeApproach || 'Try solving using a standard substitution or symmetry-based method to cross-check.'
    }
  } catch (error) {
    console.error('Practice review error:', error)
    return {
      friendlyMessage: 'Keep going. Your consistency matters more than a single result.',
      mistake: payload.isCorrect
        ? 'No mistake here. Focus on speed and clean presentation.'
        : 'There was likely a conceptual or algebraic slip.',
      fix: 'Revisit the core formula and re-derive the steps cleanly.',
      alternativeApproach: 'Try an alternative method (substitution/graphical/energy-based) to validate the answer.'
    }
  }
}

interface PracticeCoachPayload {
  question: string
  options: string[]
  selectedAnswer?: string | number | null
  subject: string
  chapter: string
  difficulty: PracticeDifficulty
  timeElapsed?: number
  stats?: {
    attempted: number
    correct: number
    accuracy: number
    avgTime: number
  }
}

interface PracticeCoachResponse {
  friendlyMessage: string
  approachHint: string
  pitfalls: string
}

export async function generatePracticeCoach(
  payload: PracticeCoachPayload,
  mode: AIMode
): Promise<PracticeCoachResponse> {
  const safeStats = payload.stats || { attempted: 0, correct: 0, accuracy: 0, avgTime: 0 }
  const systemPrompt = `You are a friendly IIT-JEE mentor monitoring a student during practice.

Rules:
- Output ONLY valid JSON.
- Do NOT reveal the correct answer or final numeric value.
- Give a short approach hint and common pitfalls.
- Keep it brief and encouraging.
- Use LaTeX for math with $...$ or $$...$$.

Required JSON schema:
{
  "friendlyMessage": string,
  "approachHint": string,
  "pitfalls": string
}`

  const userPrompt = `Question: ${payload.question}
Options: ${payload.options.map((opt, idx) => `${idx}. ${opt}`).join(' | ')}
Selected Answer: ${payload.selectedAnswer ?? 'none'}
Subject: ${payload.subject}
Chapter: ${payload.chapter}
Difficulty: ${payload.difficulty}
Time Elapsed (s): ${payload.timeElapsed ?? 0}
Session Stats: attempted=${safeStats.attempted}, correct=${safeStats.correct}, accuracy=${safeStats.accuracy}%, avgTime=${safeStats.avgTime}s

Give a coaching hint without revealing the answer.`

  try {
    const completion = await generateWithProviders({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5,
      maxTokens: AI_MAX_TOKENS_SHORT,
      preferReasoning: true
    })

    const parsed = extractJsonPayload(completion.content || '')
    const response = parsed && typeof parsed === 'object' ? parsed : null

    const friendlyMessage = normalizeMathDelimiters(String(response?.friendlyMessage || '').trim())
    const approachHint = normalizeMathDelimiters(String(response?.approachHint || '').trim())
    const pitfalls = normalizeMathDelimiters(String(response?.pitfalls || '').trim())

    return {
      friendlyMessage: friendlyMessage || 'Stay calm. Focus on the core concept first, then compute carefully.',
      approachHint: approachHint || 'Identify the governing formula and set up the equation before substituting values.',
      pitfalls: pitfalls || 'Watch for sign mistakes, unit consistency, and incorrect formula application.'
    }
  } catch (error) {
    console.error('Practice coach error:', error)
    return {
      friendlyMessage: 'Keep going. You are close — take a structured approach.',
      approachHint: 'Start from the fundamental relation and derive step by step.',
      pitfalls: 'Common issues: algebra slips, wrong substitution, and missing constraints.'
    }
  }
}

interface PyqApproachPayload {
  question: string
  subject: string
  chapter: string
  exam?: string
  year?: number
  solution?: string
}

export async function generatePyqApproach(payload: PyqApproachPayload): Promise<string> {
  const systemPrompt = `You are a senior JEE faculty member. Provide an alternative solution approach for the given PYQ.

Rules:
- Do NOT repeat the exact given solution.
- Do NOT reveal the final numeric answer explicitly.
- Keep it concise (4-7 bullet steps).
- Use LaTeX for math with $...$ or $$...$$.
`

  const userPrompt = `Exam: ${payload.exam || 'PYQ'}
Year: ${payload.year ?? 'N/A'}
Subject: ${payload.subject}
Chapter: ${payload.chapter}

Question: ${payload.question}

Reference solution (do not repeat verbatim): ${payload.solution || 'N/A'}

Provide a different valid approach.`

  try {
    const completion = await generateWithProviders({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      maxTokens: AI_MAX_TOKENS_SHORT,
      preferReasoning: true
    })

    return normalizeMathDelimiters(
      completion.content || 'Use an alternative method (energy vs. force balance, symmetry vs. algebra) to cross-check.'
    )
  } catch (error) {
    console.error('PYQ approach error:', error)
    return 'Try an alternate method (e.g., energy vs. force balance, symmetry vs. algebra) to verify the result.'
  }
}
