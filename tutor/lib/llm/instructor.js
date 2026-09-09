import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
let cachedSystem = null

export function getSystemPrompt() {
  if (cachedSystem) return cachedSystem
  try {
    cachedSystem = readFileSync(join(__dirname, 'prompts', 'instructor.system.md'), 'utf8')
  } catch {
    cachedSystem = 'You are the LearnLab Instructor. One step at a time. Never write full BUILD solutions.'
  }
  return cachedSystem
}

export const GUARDRAILS = {
  noFullSolutions: true,
  oneStepAtATime: true,
  noCurriculumInvention: true,
  maxSentences: 4,
}

export const OUTPUT_SCHEMAS = {
  coach: { type: 'text', field: 'note' },
  hint: { type: 'json', fields: ['nudge', 'curriculumHint'] },
  reflect: { type: 'json', fields: ['question', 'evidencePrompt'] },
  decide: { type: 'json', fields: ['probe', 'tradeoffReminder'] },
}

export function buildInstructorMessages({ mode, userContext, structured = false, learningBlock = '' }) {
  const system = getSystemPrompt()
  const learningSection = learningBlock
    ? `\n\n## Project learning (few-shot + distilled patterns)\n${learningBlock}`
    : ''
  const modeInstructions = {
    coach: 'Respond with a short coach note (2-4 sentences). Plain text only.',
    hint: structured
      ? 'Respond with JSON: {"nudge":"...","curriculumHint":"..."}. Nudge must not reveal the BUILD solution.'
      : 'Give a hint nudge without revealing the full solution. Plain text only.',
    reflect: structured
      ? 'Respond with JSON: {"question":"...","evidencePrompt":"..."}'
      : 'Ask one reflective question. Plain text only.',
    decide: structured
      ? 'Respond with JSON: {"probe":"...","tradeoffReminder":"..."}'
      : 'Ask a tradeoff probe. Do not pick A or B. Plain text only.',
  }

  return [
    { role: 'system', content: `${system}${learningSection}\n\n## Current task\n${modeInstructions[mode] || modeInstructions.coach}` },
    { role: 'user', content: userContext },
  ]
}

export function parseStructured(mode, text) {
  if (!text) return null
  const schema = OUTPUT_SCHEMAS[mode]
  if (!schema || schema.type !== 'json') return { note: text }

  try {
    const parsed = JSON.parse(text)
    return { structured: parsed, note: parsed.nudge || parsed.question || parsed.probe || text }
  } catch {
    return { note: text }
  }
}
