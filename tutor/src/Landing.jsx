import { useState, useEffect } from 'react'
import leaderboardData from '../data/leaderboard.json'
import { copyText, setPageMeta, UNIVERSAL_PROMPT, DEFAULT_TITLE, DEFAULT_DESCRIPTION, INSTALL_UNIX, INSTALL_WINDOWS } from './siteUtils.js'

const MARQUEE_ITEMS = [
  { text: 'AI Workflows', accent: true },
  { text: 'Agentic Systems', accent: false },
  { text: 'RAG Pipelines', accent: true },
  { text: 'System Design', accent: false },
  { text: 'Debugging', accent: true },
  { text: 'MLOps', accent: false },
]

const CATALOG_STATS = [
  { value: '6', label: 'Core skills' },
  { value: '22', label: 'Modules' },
  { value: '4', label: 'Tracks' },
  { value: '5', label: 'Evidence dimensions' },
]

const VALUE_PROPS = [
  {
    title: 'Learn by building',
    desc: 'Ship real systems through CONTEXT → DECIDE → BUILD → VERIFY → BREAK → FIX → REFLECT — not passive video tutorials.',
  },
  {
    title: 'Proof that travels with you',
    desc: 'Every module scores your reasoning across five dimensions with quoted evidence recruiters can actually read.',
  },
  {
    title: 'Adapts to how you think',
    desc: 'Your instructor remembers sessions, calibrates to your level, and meets you where you are — say "explain from scratch" anytime.',
  },
  {
    title: 'Your repo, your progress',
    desc: 'Local-first session in ~/.synapsoul. Sign in here when you want progress on the cohort API and a recruiter-facing profile.',
  },
  {
    title: 'One prompt, full bootcamp',
    desc: 'Copy one line from this site. Your AI editor reads the hosted protocol, installs the SynapSoul CLI, and teaches from the API.',
  },
]

const DEMO_DIMENSIONS = [
  { label: 'Tradeoff Reasoning', score: 4.6 },
  { label: 'Debugging Methodology', score: 4.2 },
  { label: 'Security Awareness', score: 4.5 },
  { label: 'Production Thinking', score: 4.4 },
  { label: 'Communication Clarity', score: 4.8 },
]

const EVIDENCE_QUOTES = [
  { text: 'Identified open redirect vulnerability unprompted and proposed domain allowlisting as mitigation.', cite: 'Module 03, Security Awareness (4.5/5)' },
  { text: 'Chose async writes for latency but added idempotency keys to prevent duplicate side effects under retry storms.', cite: 'Module 04, Tradeoff Reasoning (4.6/5)' },
  { text: 'Explained caching invalidation tradeoffs using a concrete TTL vs event-driven comparison.', cite: 'Module 07, Communication Clarity (4.8/5)' },
]

const SESSION_TRANSCRIPTS = [
  {
    title: 'Session 1 — Module 3',
    lines: [
      { role: 'Instructor', text: "Let's talk about how services validate incoming data. What's input validation?" },
      { role: 'You', text: "I'm not sure." },
      { role: 'Instructor', text: 'Think of it like a bouncer at a club — checks your ID before you get in. If data looks wrong, it rejects it at the door.' },
      { role: 'You', text: 'So it filters bad requests early?' },
      { role: 'Instructor', text: "Exactly. Now what happens if the bouncer lets everyone in?" },
    ],
  },
  {
    title: 'Session 2 — Module 4',
    lines: [
      { role: 'Instructor', text: "This module introduces JWT. Think of a JWT like a passport — you show it at every checkpoint, and the server reads it instead of asking who you are again." },
      { role: 'You', text: 'So the server stays stateless and reads the passport each time?' },
      { role: 'Instructor', text: "That's stateless auth in one sentence. You got it." },
    ],
  },
]

const SKILLS = [
  {
    title: 'System Design Fundamentals',
    desc: 'Design real systems with explicit tradeoffs, failure handling, and scaling constraints.',
    bullets: ['Load balancing vs sticky sessions with concrete failure modes', 'Caching layers with TTL vs event-driven invalidation', 'Idempotency keys under retry storms'],
    tags: ['Node', 'Python', 'Tradeoffs', 'Scaling'],
    start: true,
    tag: 'Foundation',
    preview: 'gradient-a',
  },
  {
    title: 'Debugging & Incident Response',
    desc: 'Debug through evidence, not intuition. Reproduce, isolate, root-cause, fix.',
    bullets: ['Structured hypothesis testing under time pressure', 'Log correlation across distributed services', 'Post-incident writeups with actionable follow-ups'],
    tags: ['Observability', 'Root Cause', 'Runbooks'],
    after: true,
    tag: 'Ops',
    preview: 'gradient-b',
  },
  {
    title: 'Decomposition & Execution Planning',
    desc: 'Break projects into staged plans that actually ship.',
    bullets: ['Milestone slicing with rollback points', 'Dependency mapping before writing code', 'Scope negotiation with stakeholders'],
    tags: ['Planning', 'Execution', 'Scope'],
    after: true,
    tag: 'Planning',
    preview: 'gradient-c',
  },
  {
    title: 'Production Readiness',
    desc: 'Reliability, rollout safety, observability, and operational constraints.',
    bullets: ['Feature flags and canary rollouts', 'SLOs, error budgets, and alerting hygiene', 'Graceful degradation under partial failure'],
    tags: ['Reliability', 'SLOs', 'Rollouts'],
    after: true,
    tag: 'Reliability',
    preview: 'gradient-d',
  },
  {
    title: 'AI-Augmented Engineering',
    desc: 'AI leverage without losing engineering judgment.',
    bullets: ['Prompt design for code review and architecture critique', 'When to trust AI output vs verify manually', 'Agent workflows with guardrails'],
    tags: ['Cursor', 'Agents', 'RAG'],
    after: true,
    tag: 'AI',
    preview: 'gradient-e',
  },
  {
    title: 'Technical Communication',
    desc: 'Architecture writing teams can execute without ambiguity.',
    bullets: ['RFC-style decision records with alternatives rejected', 'Diagrams that survive implementation', 'Async updates that unblock teams'],
    tags: ['Writing', 'RFCs', 'Docs'],
    after: true,
    tag: 'Writing',
    preview: 'gradient-f',
  },
]

const CHIP_CATEGORIES = [
  { label: 'IDEs', chips: ['Cursor', 'Claude Code', 'VS Code Copilot', 'Codex'] },
  { label: 'Languages', chips: ['Node', 'Python', 'Go', 'TypeScript'] },
  { label: 'Tracks', chips: ['System Design', 'Debugging', 'Production', 'AI Engineering'] },
]

const HOW_60_SECONDS = [
  { num: '15s', title: 'Paste prompt', desc: 'One line. The hosted protocol tells the instructor to run the CLI first.' },
  { num: '15s', title: 'Login + start', desc: 'synapsoul register or synapsoul login (email or GitHub), then synapsoul start --json. No JWT = no lesson, no admin tracking.' },
  { num: '20s', title: 'Teach from JSON', desc: 'CONTEXT comes from CLI output — never from the model’s memory.' },
  { num: '10s', title: 'Earn evidence', desc: 'Five dimensions scored with quotes recruiters read.' },
]

const HOW_IT_WORKS = [
  { num: '01', title: 'Open your AI editor', desc: 'Cursor, Claude Code, VS Code Copilot, Codex, or Antigravity — any editor that can read a URL and run a terminal.' },
  { num: '02', title: 'Paste one prompt', desc: 'Copy the line below. Your instructor must read the hosted protocol and run the SynapSoul CLI before teaching — no zip, no git clone, no invented CONTEXT.' },
  { num: '03', title: 'Learn by doing', desc: 'CONTEXT → DECIDE → BUILD → VERIFY → BREAK → FIX → REFLECT. Curriculum comes from CLI JSON only.' },
  { num: '04', title: 'Website login is a different channel', desc: 'Register here or in the IDE — same account. last_seen is website session, not IDE CLI. Events need synapsoul login in the terminal.' },
]

const ANY_IDE_STEPS = [
  { num: '01', title: 'Paste the prompt', desc: 'Copy the one-liner. skill.md forbids teaching until the CLI has run — never invent CONTEXT from memory.' },
  { num: '02', title: 'Install the CLI', desc: 'Unix: curl installer. Windows: irm | iex. The CLI talks to the production API — no GitHub clone.' },
  { num: '03', title: 'Login and start', desc: 'Required before any lesson: synapsoul register or synapsoul login, then synapsoul start --json. Curriculum comes from that JSON, not from training data.' },
  { num: '04', title: 'Website sign-in is separate', desc: 'Register here so last_seen shows a website session. Dashboard login is not CLI and does not create IDE events.' },
]

const CONVERSATION = [
  { role: 'student', text: 'Why would we use a queue here instead of calling the API directly?' },
  { role: 'tutor', text: 'Good question. What happens to your service if the downstream API is slow or down for 30 seconds?' },
  { role: 'student', text: 'Requests would pile up… timeouts, maybe cascading failures.' },
  { role: 'tutor', text: 'Exactly. A queue decouples ingestion from processing. What tradeoff are you accepting?' },
]

const FAQ = [
  { q: 'Is this just another AI chatbot?', a: 'No. Your instructor remembers sessions, tracks concepts, scores reasoning across five dimensions, and builds an evidence-backed profile.' },
  { q: 'What IDE does it work with?', a: 'Any AI editor: Cursor, Claude Code, VS Code Copilot, Codex, Antigravity — paste one prompt and follow the hosted protocol. You do not clone GitHub.' },
  { q: 'Where does my progress go?', a: 'CLI progress stays in ~/.synapsoul first, then syncs to the API when the instructor has run synapsoul login. Signing in on this site is a website session (last_seen). It is not IDE CLI. People who never create an account are not silently tracked.' },
  { q: 'The AI started teaching without installing the CLI. Does that count?', a: 'No. That is invented CONTEXT from memory. Cohort admin only sees real CLI events. The instructor must run synapsoul register or synapsoul login, then synapsoul start --json before teaching.' },
  { q: 'The agent assumes I know something. What do I do?', a: 'Say "I don\'t know — explain from scratch." The instructor adapts to your level.' },
  { q: 'How do I get the most out of this?', a: 'Challenge it: "Why this approach?" "What breaks if I skip this?" "Score my reasoning."' },
]

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export default function Landing({ onEnterApp, onCollege, onPublicProfile }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setPageMeta({ title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION })
  }, [])

  async function copyPrompt() {
    setCopyError('')
    const ok = await copyText(UNIVERSAL_PROMPT)
    if (!ok) {
      setCopyError('Could not copy. Select the prompt and copy it manually.')
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function goSection(id) {
    setMenuOpen(false)
    scrollTo(id)
  }

  const marqueeTrack = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS]

  return (
    <div className="landing" id="top">
      <div className="landing-grain" aria-hidden="true" />
      <div className="landing-ambient" aria-hidden="true" />

      <input type="checkbox" id="theme-toggle" className="theme-toggle-input" aria-label="Toggle light mode" />

      <nav className="glass-nav reveal" aria-label="Main navigation">
        <div className={`glass-nav-pill ${menuOpen ? 'is-open' : ''}`}>
          <a href="#top" className="glass-nav-logo" onClick={e => { e.preventDefault(); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            <img className="logo-mark" src="/brand/synapsoul-mark.png" alt="SynapSoul" width="36" height="36" />
            <span className="logo-text">SynapSoul</span>
          </a>
          <button
            type="button"
            className="nav-burger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            onClick={() => setMenuOpen(open => !open)}
          >
            <span />
            <span />
            <span />
          </button>
          <div id="landing-menu" className={`glass-nav-links ${menuOpen ? 'is-open' : ''}`}>
            <button type="button" onClick={() => goSection('why')}>Why SynapSoul</button>
            <button type="button" onClick={() => goSection('graph')}>Cognitive Graph</button>
            <button type="button" onClick={() => goSection('any-ide')}>Any IDE</button>
            <button type="button" onClick={() => goSection('how')}>How It Works</button>
            <button type="button" onClick={() => goSection('skills')}>Skills</button>
            <button type="button" onClick={() => goSection('leaderboard')}>Leaderboard</button>
          </div>
          <div className="glass-nav-actions">
            <label htmlFor="theme-toggle" className="theme-toggle" aria-hidden="true">
              <span className="theme-toggle-track">
                <span className="theme-toggle-thumb" />
              </span>
            </label>
            <button type="button" className="nav-cta-gradient" onClick={onEnterApp}>Start Learning</button>
          </div>
        </div>
      </nav>

      <div className="marquee-banner" aria-hidden="true">
        <div className="marquee-track">
          {marqueeTrack.map((item, i) => (
            <span key={`${item.text}-${i}`} className="marquee-item">
              <span className={item.accent ? 'marquee-accent' : 'marquee-bold'}>{item.text}</span>
              <span className="marquee-dot">·</span>
            </span>
          ))}
        </div>
      </div>

      <section className="landing-hero">
        <div className="hero-badge reveal reveal-d1">
          <span className="badge-pulse" />
          Local-first AI engineering bootcamp
        </div>
        <p className="hero-tagline reveal reveal-d2">The engineering bootcamp that adapts to you</p>
        <h1 className="display hero-title reveal reveal-d3">
          Job-ready proof — not <em>tutorial hell</em>
        </h1>
        <p className="landing-lead reveal reveal-d4">
          Paste one prompt. Get a tutor that remembers how you learn,
          adapts to your level, and builds proof of how you think.
        </p>

        <div className="hero-actions reveal reveal-d5">
          <button type="button" className="btn-primary btn-gradient btn-lg" onClick={onEnterApp}>
            Start Free
          </button>
          <button type="button" className="btn-secondary" onClick={() => scrollTo('leaderboard')}>
            See Leaderboard
          </button>
        </div>

        <div className="hero-stats reveal reveal-d5">
          {CATALOG_STATS.map(stat => (
            <div key={stat.label} className="hero-stat">
              <span className="hero-stat-value">{stat.value}</span>
              <span className="hero-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="prompt-box premium reveal reveal-d5">
          <div className="prompt-glow" aria-hidden="true" />
          <p className="prompt-label">Paste this in your AI editor</p>
          <div className="prompt-row oneline-row">
            <pre className="prompt-code oneline"><span className="prompt-caret" aria-hidden="true">&gt; </span>{UNIVERSAL_PROMPT}</pre>
            <button type="button" className="copy-btn copy-btn-lg" onClick={copyPrompt}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="prompt-note">
            Instructor must run <code>synapsoul register</code> or <code>synapsoul login</code> then <code>synapsoul start --json</code> before teaching.
            Never invent CONTEXT from memory. Website sign-in is not the CLI.
          </p>
          {copyError && <p className="form-feedback is-error" role="alert">{copyError}</p>}
          {copied && <p className="form-feedback is-success" role="status">Prompt copied to clipboard</p>}
        </div>
      </section>

      <section className="landing-any-ide reveal" id="any-ide">
        <div className="section-head">
          <p className="section-eyebrow">Works in any IDE</p>
          <h2 className="display-sm">Share the site. Paste one prompt. <em>Same tutor.</em></h2>
          <p className="section-desc">
            A friend opens this page, copies the one-liner, and pastes it in Cursor, Claude, VS Code Copilot, Codex, or Antigravity.
            The instructor must run synapsoul register or synapsoul login then synapsoul start before teaching. Website sign-in is the same account — still run CLI login so the JWT is on disk.
          </p>
        </div>
        <div className="steps-row steps-60s any-ide-steps">
          {ANY_IDE_STEPS.map((step, i) => (
            <div key={step.title} className={`step-item reveal reveal-d${(i % 3) + 1}`}>
              <span className="step-time">{step.num}</span>
              <strong>{step.title}</strong>
              <p>{step.desc}</p>
              {i < ANY_IDE_STEPS.length - 1 && <span className="step-divider" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <section className="landing-value reveal" id="why">
        <div className="section-head">
          <p className="section-eyebrow">Why SynapSoul</p>
          <h2 className="display-sm">Built for engineers who <em>ship</em></h2>
          <p className="section-desc">
            A private AI instructor in your IDE — adaptive memory, scored evidence,
            and a full bootcamp from one prompt.
          </p>
        </div>
        <div className="value-prop-grid">
          {VALUE_PROPS.map((prop, i) => (
            <article key={prop.title} className={`value-prop-card reveal reveal-d${(i % 3) + 1}`}>
              <h3>{prop.title}</h3>
              <p>{prop.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-graph reveal" id="graph">
        <div className="section-head">
          <p className="section-eyebrow">The Cognitive Graph</p>
          <h2 className="display-sm">Not XP. How you <em>reason</em>.</h2>
        </div>
        <div className="landing-graph-card">
          <p>
            SynapSoul does not rank you by points. It keeps a living graph of the concepts you have evidence for,
            the decisions you actually made, and the next problem that sits in reach — so the tutor maps how you think,
            not how much you clicked.
          </p>
        </div>
      </section>

      <section className="landing-skills reveal" id="skills">
        <div className="section-head">
          <p className="section-eyebrow">Curriculum</p>
          <h2 className="display-sm">Things you will <em>ship</em></h2>
          <p className="section-desc">Six modules. Real engineering judgment. Not tutorial hell.</p>
        </div>
        <div className="work-showcase">
          {SKILLS.map((s, i) => (
            <article key={s.title} className={`project-card reveal reveal-d${(i % 3) + 1}`}>
              <div className={`project-preview ${s.preview}`}>
                <div className="project-preview-overlay">
                  <span className="project-preview-label">{s.tag}</span>
                </div>
              </div>
              <div className="project-body">
                <div className="project-meta">
                  {s.start && <span className="pill start">Start here</span>}
                  {s.after && <span className="pill after">After foundation</span>}
                </div>
                <h3>{s.title}</h3>
                <p className="project-desc">{s.desc}</p>
                <ul className="project-bullets">
                  {s.bullets.map(b => <li key={b}>{b}</li>)}
                </ul>
                <div className="project-tags">
                  {s.tags.map(t => <span key={t} className="tech-tag">{t}</span>)}
                </div>
                <div className="project-links">
                  <button type="button" className="project-link primary" onClick={copyPrompt}>Start module →</button>
                  <button type="button" className="project-link" onClick={onEnterApp}>View curriculum</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-chips reveal" id="tools">
        <div className="section-head">
          <p className="section-eyebrow">Your stack</p>
          <h2 className="display-sm">Editors, languages, <em>tracks</em></h2>
          <p className="section-desc">Works in the editors and runtimes you already use.</p>
        </div>
        <div className="chip-categories">
          {CHIP_CATEGORIES.map(cat => (
            <div key={cat.label} className="chip-category">
              <h3 className="chip-category-label">{cat.label}</h3>
              <div className="chip-wall">
                {cat.chips.map(chip => (
                  <div key={chip} className="flip-chip">
                    <div className="flip-chip-inner">
                      <span className="flip-front">{chip}</span>
                      <span className="flip-back">✓</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-dimensions reveal" id="dimensions">
        <div className="section-head">
          <p className="section-eyebrow">Scored reasoning</p>
          <h2 className="display-sm">How you think, <em>measured</em></h2>
          <p className="section-desc">Five dimensions tracked across every module. Evidence-backed, not vibes.</p>
        </div>
        <div className="dimension-grid">
          {DEMO_DIMENSIONS.map((d, i) => (
            <div key={d.label} className={`dimension-card reveal reveal-d${i + 1}`}>
              <span className="dim-name">{d.label}</span>
              <span className="dim-value">{d.score}<small>/5</small></span>
              <div className="dim-meter">
                <div className="dim-meter-fill" style={{ width: `${(d.score / 5) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="evidence-showcase">
          {EVIDENCE_QUOTES.map(q => (
            <blockquote key={q.cite} className="evidence-quote premium">
              <span className="quote-mark">"</span>
              {q.text}
              <cite>— {q.cite}</cite>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="landing-session reveal" id="session">
        <div className="section-head">
          <p className="section-eyebrow">Live session</p>
          <h2 className="display-sm">What a lesson <em>feels</em> like</h2>
        </div>
        <div className="conversation-card premium">
          <div className="conversation-meta">
            <span className="session-badge">DECIDE · System Design</span>
            <span className="session-step">Step 2 of 7</span>
          </div>
          <div className="conversation-thread">
            {CONVERSATION.map((msg, i) => (
              <div key={i} className={`message ${msg.role} reveal reveal-d${Math.min(i + 1, 5)}`}>
                <span className="message-role">{msg.role === 'tutor' ? 'Instructor' : 'You'}</span>
                <p>{msg.text}</p>
              </div>
            ))}
          </div>
          <p className="conversation-foot">
            CONTEXT → DECIDE → BUILD → VERIFY → BREAK → FIX → REFLECT
          </p>
        </div>
      </section>

      <section className="landing-transcripts reveal">
        <div className="section-head">
          <p className="section-eyebrow">Adaptive memory</p>
          <h2 className="display-sm">Example <em>sessions</em></h2>
        </div>
        <div className="transcript-grid">
          {SESSION_TRANSCRIPTS.map(t => (
            <article key={t.title} className="transcript-card premium">
              <div className="transcript-header">
                <span className="transcript-dot" />
                <h3>{t.title}</h3>
              </div>
              <div className="transcript-body">
                {t.lines.map((line, i) => (
                  <p key={i} className={`transcript-line ${line.role === 'Instructor' ? 'instructor' : 'student'}`}>
                    <strong>{line.role}:</strong> {line.text}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-60s reveal" id="sixty">
        <div className="section-head">
          <p className="section-eyebrow">60 seconds</p>
          <h2 className="display-sm">How it works in <em>60 seconds</em></h2>
        </div>
        <div className="steps-row steps-60s">
          {HOW_60_SECONDS.map((step, i) => (
            <div key={step.title} className={`step-item reveal reveal-d${(i % 3) + 1}`}>
              <span className="step-time">{step.num}</span>
              <strong>{step.title}</strong>
              <p>{step.desc}</p>
              {i < HOW_60_SECONDS.length - 1 && <span className="step-divider" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <section className="landing-timeline reveal" id="how">
        <div className="section-head">
          <p className="section-eyebrow">How it works</p>
          <h2 className="display-sm">Not a chatbot. Not a course. <em>Something else.</em></h2>
        </div>
        <div className="timeline">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.num} className={`timeline-item reveal reveal-d${(i % 3) + 1}`}>
              <div className="timeline-marker">
                <span className="timeline-num">{step.num}</span>
                {i < HOW_IT_WORKS.length - 1 && <span className="timeline-line" />}
              </div>
              <div className="timeline-content">
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-leaderboard reveal" id="leaderboard">
        <div className="section-head">
          <p className="section-eyebrow">Community</p>
          <h2 className="display-sm">Leaderboard</h2>
        </div>
        <div className="leaderboard-preview">
          {leaderboardData.slice(0, 4).map((e, i) => (
            <div key={e.username} className="leaderboard-row card elevated">
              <span className="rank">#{i + 1}</span>
              <div className="lb-info">
                <strong>
                  <button type="button" className="link-btn" onClick={() => onPublicProfile?.(e.username)}>{e.name}</button>
                </strong>
                <span className="lb-headline">{e.headline}</span>
              </div>
              <span className="lb-score">{e.readiness_score}/100</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-audience reveal">
        <div className="audience-grid">
          <article className="audience-card premium">
            <h3>I'm a Student</h3>
            <p>Learn engineering skills with a private AI instructor that adapts to your level.</p>
            <ul>
              <li>Free to start — no credit card</li>
              <li>6 skills covering real engineering challenges</li>
              <li>Evidence-based scoring across 5 dimensions</li>
            </ul>
            <button type="button" className="btn-primary btn-gradient" onClick={onEnterApp}>Start Learning →</button>
          </article>
          <article className="audience-card premium college">
            <h3>I'm from a College</h3>
            <p>See how your students think, not just what they scored.</p>
            <ul>
              <li>Evidence-based analytics for every student</li>
              <li>Adaptive teaching that scales to any batch size</li>
              <li>Placement-ready reports with proof</li>
            </ul>
            <button type="button" className="btn-secondary" onClick={onCollege}>College Dashboard →</button>
          </article>
        </div>
      </section>

      <section className="landing-faq reveal">
        <div className="section-head">
          <p className="section-eyebrow">FAQ</p>
          <h2 className="display-sm">Questions, <em>answered</em></h2>
        </div>
        <div className="faq-list">
          {FAQ.map(f => (
            <details key={f.q} className="faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-cta reveal">
        <div className="cta-inner">
          <p className="section-eyebrow">Ready when you are</p>
          <h2 className="display-sm">Your private instructor is one prompt <em>away</em></h2>
          <p className="cta-sub">Open your AI editor, paste the prompt, then the instructor must run synapsoul register or synapsoul login, then synapsoul start --json before teaching.</p>
          <div className="contact-prompt-box">
            <span className="contact-label">Universal prompt</span>
            <div className="prompt-box premium compact">
              <div className="prompt-glow" aria-hidden="true" />
              <pre className="prompt-code oneline"><span className="prompt-caret" aria-hidden="true">&gt; </span>{UNIVERSAL_PROMPT}</pre>
            </div>
            <div className="cta-actions">
              <button type="button" className="btn-primary btn-gradient btn-lg" onClick={onEnterApp}>
                Start Free
              </button>
              <button type="button" className="btn-secondary btn-lg copy-btn-lg" onClick={copyPrompt}>
                {copied ? 'Copied to clipboard!' : 'Copy prompt'}
              </button>
            </div>
            <p className="cta-cli">
              Unix: <code>{INSTALL_UNIX}</code>
              <br />
              Windows: <code>{INSTALL_WINDOWS}</code>
            </p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>
          SynapSoul Learn Hub · Local-first engineering bootcamp ·{' '}
          <button type="button" className="link-btn" onClick={onEnterApp}>Dashboard</button>
          {' · '}
          <a className="link-btn" href="/skill.md">Instructor protocol</a>
        </p>
      </footer>
    </div>
  )
}
