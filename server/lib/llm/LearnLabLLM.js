import { buildPromptContext } from './context.js'
import { buildInstructorMessages, parseStructured } from './instructor.js'
import { complete, isLlmEnabled } from './providers/index.js'
import {
  heuristicCoachNote,
  heuristicHintNudge,
  heuristicReflectQuestion,
  heuristicDecideProbe,
} from './heuristics.js'
import { getFewShots, formatFewShotsForPrompt } from '../learning/retrieval.js'
import { getExperienceStore } from '../learning/ExperienceStore.js'
import { getActiveProvider, getActiveModel } from '../learning/LearningEngine.js'

export class LearnLabLLM {
  constructor({ timeoutMs = 4000 } = {}) {
    this.timeoutMs = timeoutMs
    this.store = getExperienceStore()
  }

  enabled() {
    return isLlmEnabled()
  }

  async _call(mode, context, { structured = false, fallback } = {}) {
    const userContext = buildPromptContext(context)
    const heuristic = fallback()
    const learningBlock = formatFewShotsForPrompt(await getFewShots(context, mode))

    if (!this.enabled()) {
      const interactionId = await this.store.logInteraction({
        userId: context.userId || null,
        type: mode,
        skillId: context.skillId,
        moduleId: context.moduleId,
        step: context.step,
        context,
        promptText: userContext,
        responseText: heuristic,
        provider: 'heuristic',
        model: null,
        source: 'heuristic',
      })
      return { source: 'heuristic', note: heuristic, mode, interactionId }
    }

    try {
      const messages = buildInstructorMessages({
        mode,
        userContext,
        structured,
        learningBlock,
      })
      const promptText = messages.map(m => m.content).join('\n')
      const text = await complete({
        messages,
        maxTokens: structured ? 280 : 160,
        temperature: 0.4,
        json: structured,
        timeoutMs: this.timeoutMs,
      })
      const parsed = parseStructured(mode, text)
      if (parsed?.note) {
        const interactionId = await this.store.logInteraction({
          userId: context.userId || null,
          type: mode,
          skillId: context.skillId,
          moduleId: context.moduleId,
          step: context.step,
          context,
          promptText,
          responseText: parsed.note,
          provider: getActiveProvider(),
          model: getActiveModel(),
          source: 'llm',
        })
        return { source: 'llm', mode, interactionId, ...parsed }
      }
    } catch {
      /* fall through */
    }

    const interactionId = await this.store.logInteraction({
      userId: context.userId || null,
      type: mode,
      skillId: context.skillId,
      moduleId: context.moduleId,
      step: context.step,
      context,
      promptText: userContext,
      responseText: heuristic,
      provider: 'heuristic',
      model: null,
      source: 'heuristic_fallback',
    })
    return { source: 'heuristic', note: heuristic, mode, interactionId }
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
