import { buildPromptContext } from './context.js'
import { buildInstructorMessages, parseStructured } from './instructor.js'
import { complete, isLlmEnabled } from './providers/index.js'
import {
  heuristicCoachNote,
  heuristicHintNudge,
  heuristicReflectQuestion,
  heuristicDecideProbe,
} from './heuristics.js'

export class LearnLabLLM {
  constructor({ timeoutMs = 4000 } = {}) {
    this.timeoutMs = timeoutMs
  }

  enabled() {
    return isLlmEnabled()
  }

  async _call(mode, context, { structured = false, fallback } = {}) {
    const userContext = buildPromptContext(context)
    const heuristic = fallback()

    if (!this.enabled()) {
      return { source: 'heuristic', note: heuristic, mode }
    }

    try {
      const messages = buildInstructorMessages({
        mode,
        userContext,
        structured,
      })
      const text = await complete({
        messages,
        maxTokens: structured ? 280 : 160,
        temperature: 0.4,
        json: structured,
        timeoutMs: this.timeoutMs,
      })
      const parsed = parseStructured(mode, text)
      if (parsed?.note) {
        return { source: 'llm', mode, ...parsed }
      }
    } catch {
      /* fall through */
    }

    return { source: 'heuristic', note: heuristic, mode }
  }

  async coach(context = {}, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs
    this.timeoutMs = timeoutMs
    const struggle = context.struggle
      || context.brainSnapshot?.struggles?.[0]?.title
      || context.brainSnapshot?.struggles?.[0]?.id

    return this._call('coach', { ...context, struggle }, {
      fallback: () => heuristicCoachNote({ ...context, struggle }),
    })
  }

  async hint(context = {}, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs
    this.timeoutMs = timeoutMs
    const result = await this._call('hint', {
      ...context,
      event: { type: 'hint', ...(context.event || {}) },
    }, {
      structured: true,
      fallback: () => heuristicHintNudge(context),
    })

    if (result.structured?.nudge) {
      result.nudge = result.structured.nudge
    } else {
      result.nudge = result.note
    }
    if (context.hintText) result.curriculumHint = context.hintText
    return result
  }

  async reflect(context = {}, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs
    this.timeoutMs = timeoutMs
    const result = await this._call('reflect', {
      ...context,
      event: { type: 'reflect', ...(context.event || {}) },
    }, {
      structured: true,
      fallback: () => heuristicReflectQuestion(context),
    })

    if (result.structured?.question) {
      result.question = result.structured.question
      result.evidencePrompt = result.structured.evidencePrompt
    } else {
      result.question = result.note
    }
    return result
  }

  async decide(context = {}, options = {}) {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs
    this.timeoutMs = timeoutMs
    const stepData = context.stepContent || context.moduleJson?.steps?.DECIDE
    const result = await this._call('decide', {
      ...context,
      event: { type: 'decide', ...(context.event || {}) },
    }, {
      structured: true,
      fallback: () => heuristicDecideProbe(stepData || context),
    })

    if (result.structured?.probe) {
      result.probe = result.structured.probe
      result.tradeoffReminder = result.structured.tradeoffReminder
    } else {
      result.probe = result.note
    }
    return result
  }
}

let defaultInstance = null

export function getLearnLabLLM() {
  if (!defaultInstance) defaultInstance = new LearnLabLLM()
  return defaultInstance
}
