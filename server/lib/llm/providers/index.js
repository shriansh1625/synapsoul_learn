import { groqComplete } from './groq.js'
import { openaiComplete } from './openai.js'
import { anthropicComplete } from './anthropic.js'

function envKey(name) {
  try {
    if (typeof process !== 'undefined' && process.env?.[name]) return process.env[name]
  } catch {
    /* browser */
  }
  return ''
}

export function isLlmEnabled() {
  const flag = envKey('SYNAPSOUL_LLM_ENABLED') || envKey('LEARNLAB_LLM_ENABLED')
  if (flag === 'false' || flag === '0') return false
  return !!(envKey('GROQ_API_KEY') || envKey('OPENAI_API_KEY') || envKey('ANTHROPIC_API_KEY'))
}

export function selectProvider() {
  if (envKey('GROQ_API_KEY')) return groqComplete
  if (envKey('OPENAI_API_KEY')) return openaiComplete
  if (envKey('ANTHROPIC_API_KEY')) return anthropicComplete
  return null
}

export async function complete(opts) {
  const provider = selectProvider()
  if (!provider) throw new Error('no_llm_provider')
  return provider(opts)
}
