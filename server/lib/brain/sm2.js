/**
 * SuperMemo 2 spaced repetition (Wozniak).
 * quality is 0–5. Cards with quality < 3 reset to a 1-day interval.
 */

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

export function createCard() {
  return {
    n: 0,
    ef: 2.5,
    interval: 0,
    due: null,
    lastReviewed: null,
    lastQuality: null,
  }
}

export function review(card, quality, now = Date.now()) {
  const q = clamp(Number(quality) || 0, 0, 5)
  let { n, ef, interval } = card || createCard()
  ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))

  if (q < 3) {
    n = 0
    interval = 1
  } else {
    if (n === 0) interval = 1
    else if (n === 1) interval = 6
    else interval = Math.max(1, Math.round(interval * ef))
    n += 1
  }

  const due = new Date(now)
  due.setUTCDate(due.getUTCDate() + interval)
  return {
    n,
    ef: Math.round(ef * 100) / 100,
    interval,
    due: due.toISOString(),
    lastReviewed: new Date(now).toISOString(),
    lastQuality: q,
  }
}

export function isDue(card, now = Date.now()) {
  if (!card?.due) return false
  return new Date(card.due).getTime() <= now
}

/** Convert a module score (1–5) and hint count into SM-2 quality. */
export function scoreToQuality(score, hintsUsed = 0) {
  let q = typeof score === 'number' ? score : 3
  if (hintsUsed >= 3) q -= 2
  else if (hintsUsed >= 1) q -= 1
  return clamp(q, 0, 5)
}
