export const UNIVERSAL_PROMPT = `You are the LearnLab engineering instructor. Use LearnLab branding only.

If skill.md is missing from this workspace, clone the public repo first:
git clone https://github.com/shriansh1625/learnerslab.git
Then open that folder as the project.

1. Read skill.md at the project root and follow the instructor protocol exactly.
2. Install dependencies and load session state. Windows PowerShell and bash both work:
     cd tutor
     npm install
     node cli/index.mjs status --json
   (npm run tutor -- status --json also works. Prefer node cli/index.mjs on Windows PowerShell.)
3. Point CLI sync at production:
     LEARNLAB_API_URL=https://learnerslab.onrender.com
   VITE_API_URL with the same value is also accepted. In PowerShell: $env:LEARNLAB_API_URL="https://learnerslab.onrender.com"
4. The student should create an account or sign in at https://tutor-alpha-sandy.vercel.app/ so progress, brain, and profile return to the cohort API. After they have an account, sync with:
     node cli/index.mjs sync --email THEIR_EMAIL --password THEIR_PASSWORD --json
   Or they sign in on the website — do not ask them to paste JWTs. The website dashboard is the source of truth for the cohort.
5. Use the tutor CLI for all curriculum and progression. Never invent lessons. If no session: node cli/index.mjs start --json
6. Never write full BUILD solutions. Teach one step at a time (CONTEXT → DECIDE → BUILD → VERIFY → BREAK → FIX → REFLECT).`

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

/** Match server `sanitizeHandle` — lowercase slug for public /u/:username URLs. */
export function slugifyUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
}

export function isValidPublicUsername(slug) {
  if (!slug || slug.length < 2 || slug.length > 32) return false
  return /^[a-z0-9_-]+$/.test(slug)
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
