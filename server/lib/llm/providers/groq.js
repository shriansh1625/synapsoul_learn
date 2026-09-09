const DEFAULT_MODEL = 'openai/gpt-oss-120b'

export async function groqComplete({ messages, maxTokens = 200, temperature = 0.4, json = false, timeoutMs = 4000 }) {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  }
  if (json) body.response_format = { type: 'json_object' }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`groq:${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}
