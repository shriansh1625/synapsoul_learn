/**
 * Local-first coach notes. Heuristics always work.
 * Optional LLM enhancement only if a key is passed or present in process.env.
 * Never blocks the product on missing keys, network, or model errors.
 */

function envKey(name) {
  try {
    if (typeof process !== 'undefined' && process.env?.[name]) return process.env[name]
  } catch {
    /* browser */
  }
  return ''
}

export function heuristicCoachNote({ event, moduleTitle, why, struggle, hintText } = {}) {
  const title = moduleTitle || 'this module'
  const type = event?.type || ''

  if (type === 'hint' || type === 'hint_used') {
    return hintText
      || `Re-read the step goal for ${title}. What is the smallest check that would prove one thing?`
  }
  if (type === 'verify' && event?.payload?.passed === false) {
    return `Verification failed on ${title}. Name the failing criterion, then change one thing and re-run it.`
  }
  if (type === 'module_complete') {
    return why
      ? `Logged. Next up: ${why}`
      : `${title} is in your knowledge state. A spaced review will surface when the interval is due.`
  }
  if (type === 'decide') {
    return `Your DECIDE reasoning is stored. In REFLECT you will see how that choice shows up in the injected failure.`
  }
  if (struggle) {
    return `Focus area: ${struggle}. Prefer evidence over intuition on the next VERIFY.`
  }
  return why || `Stay on ${title}. Prove the next step with output, not a claim that it works.`
}

export async function maybeCoachNote(context = {}, { apiKey, timeoutMs = 2500 } = {}) {
  const note = heuristicCoachNote(context)
  const openai = apiKey || envKey('OPENAI_API_KEY')
  const anthropic = envKey('ANTHROPIC_API_KEY')

  if (!openai && !anthropic) {
    return { source: 'heuristic', note }
  }

  try {
    const prompt = [
      'You are LearnLab, a concise engineering coach.',
      'Two sentences max. Do not write BUILD solutions or full code.',
      `Event: ${context.event?.type || 'session'}`,
      context.moduleTitle ? `Module: ${context.moduleTitle}` : '',
      context.why ? `Policy: ${context.why}` : '',
      context.hintText ? `Curriculum hint: ${context.hintText}` : '',
      'Give a next-action nudge.',
    ].filter(Boolean).join('\n')

    const text = openai
      ? await callOpenAI(openai, prompt, timeoutMs)
      : await callAnthropic(anthropic, prompt, timeoutMs)

    if (text) return { source: 'llm', note: text }
  } catch {
    /* fall through */
  }
  return { source: 'heuristic', note }
}

async function callOpenAI(key, prompt, timeoutMs) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'LearnLab coach. No spoilers. Two sentences.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error('openai')
  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

async function callAnthropic(key, prompt, timeoutMs) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error('anthropic')
  const data = await res.json()
  return data.content?.[0]?.text?.trim() || ''
}
