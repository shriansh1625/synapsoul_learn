/**
 * Compiled skill/module graph from tutor/data/skills manifests.
 * Content still lives in the JSON files; this is structure only (ids, titles, order).
 */
import { buildCurriculum } from './graph.js'

const TRACKS_ALL = ['node', 'python', 'go', 'typescript']

const CATALOG = {
  foundationSkill: 'system-design-fundamentals',
  tracks: [
    { id: 'node', label: 'Node.js' },
    { id: 'python', label: 'Python' },
    { id: 'go', label: 'Go' },
    { id: 'typescript', label: 'TypeScript' },
  ],
  skills: [
    {
      id: 'system-design-fundamentals',
      title: 'System Design Fundamentals',
      description: 'Design real systems with explicit tradeoffs, failure handling, and scaling constraints.',
      requiresFoundation: false,
      startHere: true,
      color: '#e17055',
      growthDimensions: ['tradeoff_reasoning', 'production_thinking', 'security_awareness'],
    },
    {
      id: 'debugging-incidents',
      title: 'Debugging & Incident Response',
      description: 'Debug through evidence, not intuition.',
      requiresFoundation: true,
      color: '#e17055',
      growthDimensions: ['debugging_methodology', 'hypothesis_quality', 'root_cause_depth'],
    },
    {
      id: 'decomposition-planning',
      title: 'Decomposition & Execution Planning',
      description: 'Break complex projects into staged execution plans that actually ship.',
      requiresFoundation: true,
      color: '#fdcb6e',
      growthDimensions: ['task_clarity', 'adaptation_speed', 'engineering_judgment'],
    },
    {
      id: 'production-readiness',
      title: 'Production Readiness',
      description: 'Reliability, rollout safety, observability, and operational constraints.',
      requiresFoundation: true,
      color: '#00b894',
      growthDimensions: ['production_thinking', 'failure_thinking', 'observability_coverage'],
    },
    {
      id: 'ai-augmented-engineering',
      title: 'AI-Augmented Engineering',
      description: 'Use AI as leverage without losing engineering judgment.',
      requiresFoundation: true,
      color: '#a29bfe',
      growthDimensions: ['review_thoroughness', 'engineering_judgment', 'adaptation_speed'],
    },
    {
      id: 'technical-communication',
      title: 'Technical Communication',
      description: 'Communicate architecture and decisions so teams can execute without ambiguity.',
      requiresFoundation: true,
      color: '#74b9ff',
      growthDimensions: ['communication_clarity', 'writing_clarity'],
    },
    {
      id: 'system-design',
      title: 'System Design (Advanced)',
      description: 'Caching, load balancing, and designing systems that survive real traffic.',
      requiresFoundation: true,
      color: '#00b894',
      growthDimensions: ['tradeoff_reasoning', 'production_thinking', 'failure_thinking'],
    },
  ],
}

export const SKILL_MANIFESTS = [
  {
    id: 'system-design-fundamentals',
    tracks: TRACKS_ALL,
    modules: [
      { id: 'http-basics', title: 'How the Web Works', pack: 'launchpad', concepts: ['http', 'request-response', 'status-codes'] },
      { id: 'data-persistence', title: 'Data & Persistence', pack: 'launchpad', concepts: ['crud', 'sql', 'persistence'] },
      { id: 'layered-architecture', title: 'Layered Architecture', pack: 'launchpad', concepts: ['separation-of-concerns', 'error-handling', 'interfaces'] },
      { id: 'api-design', title: 'REST API Design', pack: 'practitioner', concepts: ['rest', 'resource-modeling', 'versioning'] },
      { id: 'auth-basics', title: 'Authentication Basics', pack: 'practitioner', concepts: ['authentication', 'sessions', 'jwt'] },
    ],
  },
  {
    id: 'debugging-incidents',
    tracks: TRACKS_ALL,
    modules: [
      { id: 'hypothesis-debugging', title: 'Hypothesis-Driven Debugging', pack: 'launchpad', concepts: ['hypothesis', 'bisection', 'log-analysis'] },
      { id: 'incident-triage', title: 'Incident Triage', pack: 'launchpad', concepts: ['severity', 'triage', 'communication'] },
      { id: 'postmortem-writing', title: 'Blameless Postmortems', pack: 'launchpad', concepts: ['postmortem', 'root-cause', 'action-items'] },
    ],
  },
  {
    id: 'decomposition-planning',
    tracks: ['general'],
    modules: [
      { id: 'vertical-slices', title: 'Vertical Slice Planning', pack: 'launchpad', concepts: ['vertical-slice', 'acceptance-criteria', 'scope'] },
      { id: 'milestone-planning', title: 'Milestone Planning', pack: 'launchpad', concepts: ['milestones', 'dependencies', 'estimation'] },
      { id: 'risk-decomposition', title: 'Risk-Based Decomposition', pack: 'launchpad', concepts: ['risk', 'spikes', 'unknowns'] },
    ],
  },
  {
    id: 'production-readiness',
    tracks: TRACKS_ALL,
    modules: [
      { id: 'observability-basics', title: 'Observability & Health Checks', pack: 'launchpad', concepts: ['observability', 'health-checks', 'metrics'] },
      { id: 'rollout-safety', title: 'Safe Rollouts', pack: 'launchpad', concepts: ['deployment', 'canary', 'rollback'] },
      { id: 'graceful-degradation', title: 'Graceful Degradation', pack: 'launchpad', concepts: ['degradation', 'circuit-breaker', 'fallbacks'] },
    ],
  },
  {
    id: 'ai-augmented-engineering',
    tracks: ['general'],
    modules: [
      { id: 'prompt-decomposition', title: 'Prompt Decomposition', pack: 'launchpad', concepts: ['prompt-engineering', 'task-decomposition', 'review-loops'] },
      { id: 'ai-code-review', title: 'AI-Assisted Code Review', pack: 'launchpad', concepts: ['ai-review', 'verification', 'hallucination'] },
      { id: 'prompt-guardrails', title: 'Prompt Guardrails', pack: 'launchpad', concepts: ['guardrails', 'constraints', 'output-validation'] },
    ],
  },
  {
    id: 'technical-communication',
    tracks: ['general'],
    modules: [
      { id: 'incident-reports', title: 'Writing Incident Reports', pack: 'launchpad', concepts: ['incident-report', 'timeline', 'root-cause-analysis'] },
      { id: 'architecture-docs', title: 'Architecture Documentation', pack: 'launchpad', concepts: ['adr', 'diagrams', 'c4'] },
      { id: 'design-review-notes', title: 'Design Review Facilitation', pack: 'launchpad', concepts: ['design-review', 'feedback', 'consensus'] },
    ],
  },
  {
    id: 'system-design',
    tracks: TRACKS_ALL,
    modules: [
      { id: 'caching-strategies', title: 'Caching Strategies', pack: 'launchpad', concepts: ['cache', 'ttl', 'cache-invalidation'] },
      { id: 'load-and-scale', title: 'Load & Scale', pack: 'practitioner', concepts: ['load-balancing', 'horizontal-scaling', 'bottlenecks'] },
    ],
  },
]

export function loadBundledCurriculum() {
  return buildCurriculum(CATALOG, SKILL_MANIFESTS)
}
