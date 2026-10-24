import { useEffect, useState } from 'react'
import catalog from '../data/catalog.json'
import {
  copyText,
  setPageMeta,
  UNIVERSAL_PROMPT,
  INSTALL_UNIX,
  INSTALL_WINDOWS,
} from './siteUtils.js'
import './Landing.css'

const STAGES = [
  [
    'CONTEXT',
    'Understand the system.',
    'Start with the constraints, the users, and what could go wrong.',
    'Your instructor loads the current module through the CLI before the session begins.',
  ],
  [
    'DECIDE',
    'Make the tradeoff.',
    'Explain your choice before reaching for the keyboard.',
    'Compare alternatives, name the constraints, and record the reasoning behind your approach.',
  ],
  [
    'BUILD',
    'Turn an idea into a system.',
    'Implement the next small piece in your own repository.',
    'You write the implementation. Your instructor guides the process without replacing your work.',
  ],
  [
    'VERIFY',
    'Find evidence it works.',
    'Test your assumptions, not just the happy path.',
    'Use checks and observations to explain whether your implementation meets its constraints.',
  ],
  [
    'BREAK',
    'Meet the failure case.',
    'Explore what happens when an assumption stops holding.',
    'Investigate an edge case or failure scenario and collect evidence before changing the system.',
  ],
  [
    'FIX',
    'Solve the cause.',
    'Connect the fix to the failure you observed.',
    'Make a focused correction, then verify that the original failure no longer occurs.',
  ],
  [
    'REFLECT',
    'Make the learning stick.',
    'Explain what changed in your thinking.',
    'Capture your decisions, evidence, and remaining questions so the next session has context.',
  ],
]
const FAQ = [
  [
    'What do I need to get started?',
    'An AI editor that can read a URL and run terminal commands, plus a development environment for your chosen track. Your editor’s model access is separate from SynapSoul Learn.',
  ],
  [
    'Does signing in here also sign in my editor?',
    'Use the same account, but sign in in both places. The website shows your dashboard; synapsoul login in your terminal connects CLI sessions to that account.',
  ],
  [
    'How does adaptation work?',
    'The learning engine uses concept mastery estimates, spaced review, and prerequisite relationships to suggest what to practise next. These estimates guide practice; they are not a certification or a guarantee of job readiness.',
  ],
  [
    'Is the preview showing real student results?',
    'No. The interactive workflow on this page illustrates the learning experience. Your actual progress and evidence appear in your dashboard after you complete sessions.',
  ],
  [
    'What if the service is waking up?',
    'The API runs on free hosting and can take time to start. Check readiness or retry. If the database is unavailable, account creation and cloud sync need to recover before you can use them.',
  ],
]
function Arrow() {
  return <span aria-hidden="true">↗</span>
}
function ServiceStatus() {
  const [state, setState] = useState('idle')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!attempt) return
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    setState('checking')
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
    if (!base && import.meta.env.PROD) {
      setState('unavailable')
      clearTimeout(timeout)
      return
    }
    fetch(`${base}/api/health`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const data = await response.json()
        if (active)
          setState(response.ok && data.db === 'ok' ? 'ready' : 'unavailable')
      })
      .catch(() => {
        if (active) setState(controller.signal.aborted ? 'slow' : 'unavailable')
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [attempt])
  const labels = {
    idle: 'Check learning service',
    checking: 'Connecting · the service may be waking up',
    ready: 'Learning service ready',
    unavailable: 'Cloud service unavailable · retry shortly',
    slow: 'Still waking up or unreachable · retry shortly',
  }
  return (
    <div className={`ll-service ll-service-${state}`}>
      <span className="ll-status-dot" aria-hidden="true" />
      <span role="status">{labels[state]}</span>
      <button
        type="button"
        disabled={state === 'checking'}
        onClick={() => setAttempt((a) => a + 1)}
      >
        {state === 'idle'
          ? 'Check'
          : state === 'checking'
            ? 'Checking…'
            : 'Retry'}
      </button>
    </div>
  )
}
export default function Landing({ onEnterApp, onCollege }) {
  const [stage, setStage] = useState(2)
  const [track, setTrack] = useState(catalog.tracks[0].id)
  const [os, setOs] = useState('windows')
  const [copy, setCopy] = useState('')
  const [copyError, setCopyError] = useState('')
  const [menu, setMenu] = useState(false)
  const [filter, setFilter] = useState('all')
  useEffect(() => {
    setPageMeta({
      title: 'SynapSoul Learn — Build your engineering judgment',
      description:
        'Practise engineering in your AI editor. Build, verify, break, fix, and reflect with guided modules and an adaptive learning engine.',
    })
  }, [])
  useEffect(() => {
    if (!copy) return
    const timer = setTimeout(() => setCopy(''), 2500)
    return () => clearTimeout(timer)
  }, [copy])
  async function copyValue(value, label) {
    setCopyError('')
    if (await copyText(value)) setCopy(label)
    else
      setCopyError(
        'Clipboard unavailable. Select the text below and copy it manually.',
      )
  }
  const closeMenu = () => setMenu(false)
  const currentTrack = catalog.tracks.find((t) => t.id === track)
  const skills = catalog.skills.filter(
    (s) =>
      filter === 'all' ||
      (filter === 'foundation' ? s.startHere : !s.startHere),
  )
  const totalModules = catalog.skills.reduce((n, s) => n + s.moduleCount, 0)
  return (
    <div className="learn-landing">
      <a className="ll-skip" href="#learn-main">
        Skip to content
      </a>
      <header className="ll-nav">
        <a className="ll-brand" href="#" aria-label="SynapSoul Learn home">
          <img src="/brand/synapsoul-mark.png" alt="" />
          <span>
            SynapSoul <strong>Learn.</strong>
          </span>
        </a>
        <button
          type="button"
          className="ll-menu"
          aria-expanded={menu}
          aria-controls="learn-nav"
          onClick={() => setMenu(!menu)}
        >
          {menu ? 'Close' : 'Menu'}
        </button>
        <nav
          id="learn-nav"
          className={menu ? 'll-links is-open' : 'll-links'}
          aria-label="Main navigation"
        >
          <a href="#experience" onClick={closeMenu}>
            The experience
          </a>
          <a href="#curriculum" onClick={closeMenu}>
            Curriculum
          </a>
          <a href="#questions" onClick={closeMenu}>
            FAQ
          </a>
          <button type="button" className="ll-nav-login" onClick={onEnterApp}>
            Open dashboard <Arrow />
          </button>
        </nav>
      </header>
      <div
        className="ll-marquee"
        aria-label="Practice system design, debugging, production readiness, AI workflows, and technical communication"
      >
        <div aria-hidden="true">
          {[0, 1].map((n) => (
            <div key={n}>
              {[
                'SYSTEM DESIGN',
                'Debugging',
                'PRODUCTION READINESS',
                'AI Workflows',
                'ENGINEERING JUDGMENT',
                'Technical Communication',
              ].map((label, i) => (
                <span className={i % 2 ? 'll-marquee-serif' : ''} key={label}>
                  <i>✦</i>
                  {label}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <main id="learn-main">
        <section className="ll-hero ll-wrap">
          <div className="ll-hero-copy">
            <p className="ll-eyebrow">
              <span /> ENGINEERING PRACTICE, REIMAGINED
            </p>
            <h1>
              Don’t just write code.
              <br />
              <em>
                Build the judgment
                <br className="ll-desktop-break" /> behind it.
              </em>
            </h1>
            <p className="ll-lead">
              Your AI editor becomes a guided engineering lab. Build real
              systems, investigate failures, and learn to explain every
              decision.
            </p>
            <div className="ll-actions">
              <a className="ll-primary" href="#start">
                Set up your learning lab <Arrow />
              </a>
              <a className="ll-secondary" href="#experience">
                Explore the experience <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="ll-editor-line">
              <span>IN YOUR EXISTING AI EDITOR</span>
              <p>
                Cursor <b>·</b> Claude Code <b>·</b> VS Code Copilot <b>·</b>{' '}
                Codex
              </p>
            </div>
          </div>
          <div className="ll-preview-wrap">
            <div className="ll-orbit-label">THINK → BUILD → UNDERSTAND</div>
            <div className="ll-editor">
              <div className="ll-editor-top">
                <div className="ll-window-dots">
                  <i />
                  <i />
                  <i />
                </div>
                <span>your-engineering-lab</span>
                <span className="ll-preview-badge">ILLUSTRATIVE PREVIEW</span>
              </div>
              <div className="ll-editor-body">
                <div className="ll-editor-meta">
                  <span>GUIDED SESSION</span>
                  <span>{String(stage + 1).padStart(2, '0')} / 07</span>
                </div>
                <div
                  className="ll-stage-track"
                  role="group"
                  aria-label="Explore session stages"
                >
                  {STAGES.map(([name], i) => (
                    <button
                      type="button"
                      key={name}
                      aria-label={`Preview ${name.toLowerCase()} stage`}
                      aria-pressed={stage === i}
                      className={stage === i ? 'active' : ''}
                      onClick={() => setStage(i)}
                    >
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      {name}
                    </button>
                  ))}
                </div>
                <div className="ll-stage-content" aria-live="polite">
                  <p className="ll-code-label">
                    <span>●</span> {STAGES[stage][0]}
                  </p>
                  <h2>{STAGES[stage][1]}</h2>
                  <p>{STAGES[stage][2]}</p>
                  <div className="ll-instructor">
                    <span aria-hidden="true">✧</span>
                    <p>{STAGES[stage][3]}</p>
                  </div>
                </div>
                <div className="ll-editor-bottom">
                  <span>YOUR CODE. YOUR REASONING.</span>
                  <button
                    type="button"
                    onClick={() => setStage((stage + 1) % STAGES.length)}
                  >
                    Next stage <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="ll-note">
              <span aria-hidden="true">↳</span> A guided loop. More than a
              generated answer.
            </div>
          </div>
        </section>
        <div className="ll-metrics ll-wrap">
          {[
            [catalog.skills.length, 'skill paths'],
            [totalModules, 'guided modules'],
            [catalog.tracks.length, 'language tracks'],
            [catalog.headlineDimensions.length, 'reasoning dimensions'],
          ].map(([value, label]) => (
            <div key={label}>
              <strong>{value.toString().padStart(2, '0')}</strong>
              <span>{label}</span>
            </div>
          ))}
          <p>
            Built around the way
            <br />
            engineers actually learn.
          </p>
        </div>
        <section id="experience" className="ll-experience ll-wrap ll-section">
          <div className="ll-section-heading">
            <p className="ll-eyebrow">01 / THE EXPERIENCE</p>
            <h2>
              From “it works”
              <br />
              to <em>“here’s why.”</em>
            </h2>
            <p>Practice that asks you to think, not just follow along.</p>
          </div>
          <div className="ll-value-grid">
            <article className="ll-feature ll-feature-wide">
              <div>
                <span className="ll-feature-icon" aria-hidden="true">
                  ⌘
                </span>
                <h3>
                  Your editor.
                  <br />A more intentional workflow.
                </h3>
                <p>
                  Keep your tools and your repository. A hosted learning
                  protocol and CLI guide your AI instructor through one step at
                  a time.
                </p>
              </div>
              <div className="ll-mini-loop">
                {['Understand', 'Decide', 'Build', 'Test', 'Reflect'].map(
                  (name, i) => (
                    <div key={name}>
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      {name}
                      <b aria-hidden="true">↗</b>
                    </div>
                  ),
                )}
              </div>
            </article>
            <article className="ll-feature">
              <span className="ll-feature-icon" aria-hidden="true">
                ◎
              </span>
              <h3>
                A next step
                <br />
                with context.
              </h3>
              <p>
                Concept mastery, prerequisite relationships, and spaced review
                help the learning engine suggest where to practise next.
              </p>
              <div className="ll-concept-graph" aria-hidden="true">
                <span>Foundations</span>
                <i />
                <span>Practice</span>
                <i />
                <span>Review</span>
              </div>
            </article>
            <article className="ll-feature">
              <span className="ll-feature-icon" aria-hidden="true">
                ↗
              </span>
              <h3>
                Show your thinking.
                <br />
                Not just your output.
              </h3>
              <p>
                Build an evidence trail across tradeoffs, debugging, security,
                production thinking, and communication.
              </p>
              <div className="ll-evidence">
                <span>DECISION</span>
                <span>VERIFICATION</span>
                <span>REFLECTION</span>
              </div>
            </article>
          </div>
        </section>
        <section id="curriculum" className="ll-curriculum ll-section">
          <div className="ll-wrap">
            <div className="ll-curriculum-head">
              <div>
                <p className="ll-eyebrow">02 / YOUR PRACTICE GROUND</p>
                <h2>
                  Engineering skills.
                  <br />
                  <em>Connected, not isolated.</em>
                </h2>
              </div>
              <p>
                Start with system design fundamentals. Build a foundation, then
                expand into the skills that help you ship and operate software.
              </p>
            </div>
            <div
              className="ll-track-selector"
              role="group"
              aria-label="Choose a language track"
            >
              <span>YOUR LANGUAGE</span>
              {catalog.tracks.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={track === t.id ? 'active' : ''}
                  aria-pressed={track === t.id}
                  onClick={() => setTrack(t.id)}
                >
                  {t.label}
                </button>
              ))}
              <small>{currentTrack.runtime}</small>
            </div>
            <div
              className="ll-curriculum-filters"
              role="group"
              aria-label="Filter skill paths"
            >
              {[
                ['all', 'All paths'],
                ['foundation', 'Start here'],
                ['expand', 'Build on your foundation'],
              ].map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {text}
                </button>
              ))}
            </div>
            <div className="ll-skill-grid">
              {skills.map((s) => (
                <article
                  key={s.id}
                  className={`ll-skill ${s.startHere ? 'll-skill-first' : ''}`}
                >
                  <div className="ll-skill-top">
                    <span>
                      {s.startHere
                        ? 'START HERE'
                        : s.id === 'system-design'
                          ? 'ADVANCED'
                          : 'EXPAND YOUR PRACTICE'}
                    </span>
                    <span>{s.moduleCount} modules</span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.description}</p>
                  <div className="ll-skill-bottom">
                    <span>{currentTrack.label}</span>
                    <a href="#start" aria-label={`Set up ${s.title}`}>
                      Explore path <Arrow />
                    </a>
                  </div>
                </article>
              ))}
            </div>
            <p className="ll-curriculum-note">
              Track selection previews your options. Choose your learning track
              when setting up your account.
            </p>
          </div>
        </section>
        <section id="start" className="ll-start ll-wrap ll-section">
          <div className="ll-start-copy">
            <p className="ll-eyebrow">03 / MAKE IT YOURS</p>
            <h2>
              Your next session
              <br />
              starts <em>right here.</em>
            </h2>
            <p>
              No repository to clone. Start with the hosted protocol in the AI
              editor you already use.
            </p>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <h3>Open your AI editor</h3>
                  <p>
                    Use an editor that can read URLs and run terminal commands.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Paste the setup prompt</h3>
                  <p>
                    Your instructor reads the protocol and helps you install the
                    CLI.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Sign in, then start</h3>
                  <p>
                    Run <code>synapsoul login</code> or{' '}
                    <code>synapsoul register</code>, then{' '}
                    <code>synapsoul start --json</code>.
                  </p>
                </div>
              </li>
            </ol>
            <ServiceStatus />
          </div>
          <div className="ll-setup-card">
            <div className="ll-setup-heading">
              <span className="ll-feature-icon" aria-hidden="true">
                ✧
              </span>
              <div>
                <h3>One prompt. Your learning lab.</h3>
                <p>Paste into your AI editor’s chat.</p>
              </div>
            </div>
            <div className="ll-prompt">
              <p>{UNIVERSAL_PROMPT}</p>
              <button
                type="button"
                className="ll-primary"
                onClick={() => copyValue(UNIVERSAL_PROMPT, 'prompt')}
              >
                {copy === 'prompt' ? 'Prompt copied ✓' : 'Copy setup prompt'}{' '}
                <span aria-hidden="true">⧉</span>
              </button>
            </div>
            <details className="ll-manual">
              <summary>Prefer to install the CLI yourself?</summary>
              <div
                className="ll-os"
                role="group"
                aria-label="Installer operating system"
              >
                <button
                  type="button"
                  aria-pressed={os === 'windows'}
                  onClick={() => setOs('windows')}
                >
                  Windows
                </button>
                <button
                  type="button"
                  aria-pressed={os === 'unix'}
                  onClick={() => setOs('unix')}
                >
                  macOS / Linux
                </button>
              </div>
              <code>{os === 'windows' ? INSTALL_WINDOWS : INSTALL_UNIX}</code>
              <button
                type="button"
                className="ll-copy-command"
                onClick={() =>
                  copyValue(
                    os === 'windows' ? INSTALL_WINDOWS : INSTALL_UNIX,
                    'installer',
                  )
                }
              >
                {copy === 'installer' ? 'Copied ✓' : 'Copy install command'}
              </button>
              <p>
                Review the{' '}
                <a href={os === 'windows' ? '/install.ps1' : '/install'}>
                  installer
                </a>{' '}
                before running it.
              </p>
            </details>
            <p className="ll-copy-feedback" role="status">
              {copyError || (copy ? 'Copied to clipboard.' : '')}
            </p>
            <div className="ll-setup-footer">
              <p>
                Already set up? Your website and terminal use the same account,
                with a separate sign-in in each.
              </p>
              <button type="button" onClick={onEnterApp}>
                Open your dashboard <Arrow />
              </button>
            </div>
          </div>
        </section>
        <section id="questions" className="ll-faq ll-wrap ll-section">
          <div>
            <p className="ll-eyebrow">A FEW THINGS TO KNOW</p>
            <h2>
              Good questions.
              <br />
              <em>Clear answers.</em>
            </h2>
          </div>
          <div>
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="ll-final ll-wrap">
          <p className="ll-eyebrow">THE NEXT STEP IS YOURS</p>
          <h2>
            Build something.
            <br />
            <em>Understand it deeply.</em>
          </h2>
          <a className="ll-primary" href="#start">
            Start your learning lab <Arrow />
          </a>
        </section>
      </main>
      <footer className="ll-footer ll-wrap">
        <div>
          <a className="ll-brand" href="https://synapsoulai.me/">
            SynapSoul <strong>Labs.</strong>
          </a>
          <p>Tools for people who build.</p>
        </div>
        <div>
          <a href="/skill.md">
            Learning protocol <Arrow />
          </a>
          <button type="button" onClick={onCollege}>
            For cohorts <Arrow />
          </button>
          <a href="https://synapsoulai.me/">
            Meet SynapSoul Labs <Arrow />
          </a>
        </div>
        <span>SynapSoul Learn · Early access</span>
      </footer>
    </div>
  )
}
