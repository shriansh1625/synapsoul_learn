// Never seed a new visitor with a developer's recorded learning session.
export function freshProgress() {
  return {
    version: 2,
    profile: {
      name: '',
      level: 'beginner',
      track: 'node',
      interests: [],
      pretestCompleted: false,
      goals: [],
    },
    session: null,
    completedModules: {},
    decisions: {},
    scores: {},
    portfolio: [],
    pretest: null,
    studentMemory: {
      effective_level: 'beginner',
      confidence_level: 'low',
      learning_style_signals: [],
      effective_teaching_approaches: [],
      recurring_growth_areas: [],
      unknown_concepts_ahead: [],
      concepts_mastered: [],
      terminology_gaps: [],
      concepts_ahead: { gap: [], unknown: [] },
      dimension_watch: {},
    },
    profile_confirmed: false,
    profile_ready: false,
    public_profile_ready: false,
  }
}
