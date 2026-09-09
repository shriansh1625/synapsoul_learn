/**
 * Deterministic coach fallbacks — always available without network or API keys.
 */

export function heuristicCoachNote({ event, moduleTitle, why, struggle, hintText } = {}) {
  const title = moduleTitle || 'this module'
  const type = event?.type || ''

  if (type === 'hint' || type === 'hint_used') {
    return hintText
      || `Re-read the step goal for ${title}. What is the smallest check that would prove one thing?`
  }
  if (type === 'verify' && event?.payload?.passed === false) {
    return `Verification failed on ${title}. Name the failing criterion, then change one thing and re-run it.`
  }
  if (type === 'module_complete') {
    return why
      ? `Logged. Next up: ${why}`
      : `${title} is in your knowledge state. A spaced review will surface when the interval is due.`
  }
  if (type === 'decide') {
    return `Your DECIDE reasoning is stored. In REFLECT you will see how that choice shows up in the injected failure.`
  }
  if (struggle) {
    return `Focus area: ${struggle}. Prefer evidence over intuition on the next VERIFY.`
  }
  return why || `Stay on ${title}. Prove the next step with output, not a claim that it works.`
}

export function heuristicHintNudge({ hintText, step, moduleTitle } = {}) {
  if (hintText) return hintText
  const title = moduleTitle || 'this step'
  return `On ${step || 'this step'} in ${title}: what is the smallest experiment you could run in the next five minutes?`
}

export function heuristicReflectQuestion({ step, moduleTitle, decision } = {}) {
  const title = moduleTitle || 'this module'
  if (decision?.choice) {
    return `You chose ${decision.choice} in DECIDE for ${title}. What surprised you when that choice met VERIFY or BREAK?`
  }
  return `Before leaving REFLECT on ${title}: what evidence would convince a teammate you actually learned something?`
}

export function heuristicDecideProbe({ optionA, optionB, tradeoffs } = {}) {
  if (optionA && optionB) {
    return `Compare A and B for your constraints — which risk are you willing to own first?`
  }
  return `Name the tradeoff you are optimizing for before you pick A or B.`
}
