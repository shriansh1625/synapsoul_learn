export async function openaiComplete({ messages, maxTokens = 200, temperature = 0.4, json = false, timeoutMs = 4000 }) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not set')

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  }
  if (json) body.response_format = { type: 'json_object' }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`openai:${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}
