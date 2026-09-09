/**
 * Bayesian Knowledge Tracing (Corbett & Anderson, 1994).
 *
 * pKnow  — P(L): probability the skill is already known
 * pT     — P(T): probability of learning the skill after an opportunity
 * pG     — P(G): probability of a correct guess while unknown
 * pS     — P(S): probability of a slip (incorrect) while known
 *
 * After each binary observation we compute the posterior P(L | evidence),
 * then apply the learning transition: P(L') = posterior + (1 - posterior) * pT.
 */

export const DEFAULT_BKT = {
  pL0: 0.2,
  pT: 0.15,
  pG: 0.2,
  pS: 0.1,
}

export function clamp01(n, lo = 0.01, hi = 0.99) {
  return Math.min(hi, Math.max(lo, n))
}

export function createBkt(overrides = {}) {
  const pL0 = overrides.pL0 ?? DEFAULT_BKT.pL0
  return {
    pKnow: clamp01(pL0),
    pT: overrides.pT ?? DEFAULT_BKT.pT,
    pG: overrides.pG ?? DEFAULT_BKT.pG,
    pS: overrides.pS ?? DEFAULT_BKT.pS,
    observations: 0,
    correct: 0,
    incorrect: 0,
  }
}

export function pCorrect(bkt) {
  return bkt.pKnow * (1 - bkt.pS) + (1 - bkt.pKnow) * bkt.pG
}

export function updateBkt(bkt, correct) {
  const { pKnow, pT, pG, pS } = bkt
  let posterior
  if (correct) {
    const denom = Math.max(pCorrect(bkt), 1e-9)
    posterior = (pKnow * (1 - pS)) / denom
  } else {
    const denom = Math.max(pKnow * pS + (1 - pKnow) * (1 - pG), 1e-9)
    posterior = (pKnow * pS) / denom
  }
  const next = posterior + (1 - posterior) * pT
  return {
    ...bkt,
    pKnow: clamp01(next),
    observations: (bkt.observations || 0) + 1,
    correct: (bkt.correct || 0) + (correct ? 1 : 0),
    incorrect: (bkt.incorrect || 0) + (correct ? 0 : 1),
  }
}

/** Map a 1–5 score plus hint pressure onto a binary BKT observation. */
export function evidenceToCorrect({ score, passed, hintsUsed = 0 } = {}) {
  if (typeof passed === 'boolean') return passed
  if (typeof score === 'number') {
    if (score >= 3 && hintsUsed >= 3) return false
    return score >= 3
  }
  if (hintsUsed > 0) return false
  return true
}
