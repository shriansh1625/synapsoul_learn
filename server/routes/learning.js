import { Router } from 'express'
import { optionalAuth } from '../middleware/optionalAuth.js'
import { auth } from '../middleware/auth.js'
import { getExperienceStore } from '../lib/learning/ExperienceStore.js'
import { getLearningEngine } from '../lib/learning/LearningEngine.js'

const router = Router()
const store = getExperienceStore()
const engine = getLearningEngine()

router.post('/react', optionalAuth, async (req, res) => {
  try {
    const { interactionId, reaction } = req.body || {}
    if (!interactionId) return res.status(400).json({ error: 'interactionId required' })
    if (!['helpful', 'not_helpful', 'neutral'].includes(reaction)) {
      return res.status(400).json({ error: 'reaction must be helpful|not_helpful|neutral' })
    }

    const implicitScore = reaction === 'helpful' ? 1 : reaction === 'not_helpful' ? -0.5 : 0
    const result = await store.logReaction({
      interactionId,
      userId: req.user?.id || null,
      reaction,
      implicitScore,
      signalJson: { source: 'explicit_ui' },
    })

    const consolidation = await engine.maybeConsolidateAfterReaction()

    res.json({
      ok: true,
      reaction,
      reactionCount: result.reactionCount,
      consolidated: consolidation?.ok || false,
      rules: consolidation?.rules || [],
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const stats = await store.getStats()
    res.json({
      ...stats,
      learning: true,
      instructor: 'LearnLab Self-Learning Instructor',
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/consolidate', auth, async (req, res) => {
  try {
    const { skillId, type } = req.body || {}
    const result = await engine.consolidatePatterns({ skillId, type: type || 'hint' })
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
