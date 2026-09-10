export function ollamaConfigured() {
  const host = process.env.OLLAMA_HOST
  return host != null && String(host).trim() !== ''
}

export function ollamaModel() {
  return process.env.OLLAMA_MODEL || 'llama3.2'
}

export function ollamaHost() {
  return (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '')
}

/**
 * Optional local inference via Ollama (user-installed). Not bundled with SynapSoul.
 */
export async function ollamaComplete({ system, user, maxTokens = 400, timeoutMs = 60000 } = {}) {
  if (!ollamaConfigured() && !process.env.OLLAMA_HOST) {
    // Default host when explicitly consolidating with learn consolidate
  }
  const host = ollamaHost()
  const model = ollamaModel()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        options: { num_predict: maxTokens, temperature: 0.3 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.message?.content || ''
  } finally {
    clearTimeout(timer)
  }
}

export async function ollamaReachable() {
  if (!ollamaConfigured()) return false
  try {
    const res = await fetch(`${ollamaHost()}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}
