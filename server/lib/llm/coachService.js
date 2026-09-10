/**
 * Node-only coach service — SynapSoul Instructor LLM overlay.
 */

import { heuristicCoachNote } from './heuristics.js'
import { getLearnLabLLM } from './LearnLabLLM.js'

export { heuristicCoachNote }

export async function maybeCoachNote(context = {}, { apiKey, timeoutMs = 2500 } = {}) {
  if (apiKey && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = apiKey
  }
  const llm = getLearnLabLLM()
  return llm.coach(context, { timeoutMs })
}
