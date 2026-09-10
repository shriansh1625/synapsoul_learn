export const UNIVERSAL_PROMPT = 'Read skill.md and follow the instructions'

export const DEFAULT_TITLE = 'LearnLab — The Open Engineering Bootcamp in Your IDE'
export const DEFAULT_DESCRIPTION =
  'Local-first AI engineering bootcamp. Your IDE becomes a private instructor that scores how you think, builds evidence portfolios, and adapts to your level — no cloud lock-in.'

export function setPageMeta({ title, description } = {}) {
  document.title = title || DEFAULT_TITLE
  const content = description || DEFAULT_DESCRIPTION
  let el = document.querySelector('meta[name="description"]')
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', 'description')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

export function humanizeApiError(err, fallback = 'Something went wrong. Try again.') {
  const raw = err && err.message ? String(err.message) : ''
  if (!raw || /failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return 'Could not reach LearnLab. Check your connection and try again.'
  }
  if (/unexpected token|syntaxerror|<html|doctype/i.test(raw)) {
    return 'LearnLab returned an unexpected response. Try again in a moment.'
  }
  if (raw.length > 180 || /at\s+\S+\s+\(|stack|traceback/i.test(raw)) {
    return fallback
  }
  return raw
}

export function statusFallback(status) {
  if (status === 401) return 'Sign in to continue.'
  if (status === 403) return 'You do not have access to that.'
  if (status === 404) return 'That page or profile was not found.'
  if (status === 409) return 'That email or username is already taken.'
  if (status >= 500) return 'LearnLab is having trouble right now. Try again in a moment.'
  return 'Something went wrong. Try again.'
}
