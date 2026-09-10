import { useMemo, useState } from 'react'

function layout(nodes) {
  const lanes = []
  const laneIndex = {}
  for (const n of nodes) {
    if (n.kind !== 'module') continue
    if (laneIndex[n.lane] == null) {
      laneIndex[n.lane] = lanes.length
      lanes.push({ id: n.lane, title: n.skillTitle, modules: [] })
    }
    lanes[laneIndex[n.lane]].modules.push(n)
  }
  const colW = 168
  const rowH = 78
  const left = 36
  const top = 48
  const pos = {}
  lanes.forEach((lane, li) => {
    lane.modules.sort((a, b) => a.order - b.order)
    lane.modules.forEach((mod, mi) => {
      pos[mod.id] = {
        x: left + li * colW,
        y: top + mi * rowH,
      }
    })
  })
  const conceptOffset = {}
  for (const n of nodes) {
    if (n.kind !== 'concept') continue
    const host = `mod:${n.skillId}:${n.moduleId}`
    const origin = pos[host] || { x: left, y: top }
    const k = conceptOffset[host] || 0
    conceptOffset[host] = k + 1
    pos[n.id] = {
      x: origin.x + 46 + (k % 3) * 16,
      y: origin.y + 22 + Math.floor(k / 3) * 14,
    }
  }
  const width = Math.max(640, left + lanes.length * colW + 40)
  const height = Math.max(280, top + Math.max(0, ...lanes.map(l => l.modules.length)) * rowH + 36)
  return { pos, lanes, width, height }
}

function nodeFill(n) {
  if (n.recommended) return '#ece7dc'
  if (n.frontier) return '#c4bba8'
  if (n.pKnow >= 0.65) return '#8d8a82'
  if (n.pKnow >= 0.4) return '#4a4945'
  return '#1c1c1a'
}

function nodeStroke(n) {
  if (n.recommended) return '#f0e6d2'
  if (n.frontier) return '#b7aa93'
  if (n.blocker > 0.02 && n.pKnow < 0.45) return '#8a7a6a'
  return 'rgba(255,255,255,0.14)'
}

export function CognitiveGraph({ graph, compact = false, overlayEvents = [], title = 'Cognitive Graph' }) {
  const nodes = graph?.nodes || []
  const edges = graph?.edges || []
  const [hover, setHover] = useState(null)
  const [openHow, setOpenHow] = useState(false)

  const { pos, lanes, width, height } = useMemo(() => layout(nodes), [nodes])

  const overlayKeys = useMemo(() => {
    const set = new Set()
    for (const ev of overlayEvents || []) {
      if (ev.skill_id && ev.module_id) set.add(`mod:${ev.skill_id}:${ev.module_id}`)
    }
    return set
  }, [overlayEvents])

  const visibleNodes = compact
    ? nodes.filter(n => n.frontier || n.recommended || (n.kind === 'concept' && n.pKnow !== 0.2) || overlayKeys.has(n.id)).slice(0, 36)
    : nodes

  const visibleIds = new Set(visibleNodes.map(n => n.id))
  const visibleEdges = (compact ? edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to)) : edges)
    .filter(e => pos[e.from] && pos[e.to])
    .slice(0, compact ? 80 : 220)

  const fp = graph?.fingerprint
  const rec = graph?.recommendedNext
  const hiring = graph?.hiring?.sentences || []

  if (!nodes.length) {
    return (
      <section className={`cog-graph ${compact ? 'is-compact' : ''}`}>
        <div className="cog-graph-head">
          <p className="section-eyebrow">{title}</p>
          <h2 className="display-xs">How they <em>think</em></h2>
          <p className="section-sub">The graph fills from DECIDE, VERIFY, and BREAK — not from XP bars.</p>
        </div>
      </section>
    )
  }

  return (
    <section className={`cog-graph ${compact ? 'is-compact' : ''}`}>
      <div className="cog-graph-head">
        <p className="section-eyebrow">{title}</p>
        <h2 className="display-xs">{compact ? <>How they <em>think</em></> : <>Cognitive <em>Graph</em></>}</h2>
        <p className="section-sub">
          {graph?.claim || 'The tutor does not just track XP. It maps how you reason.'}
          {fp?.style && fp.style !== 'unscored' ? ` · ${fp.style}` : ''}
        </p>
      </div>

      <div className="cog-graph-canvas card elevated">
        <svg
          className="cog-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Cognitive graph of concepts and modules"
        >
          {visibleEdges.map((e, i) => {
            const a = pos[e.from]
            const b = pos[e.to]
            const isHint = e.kind === 'hint-transfer'
            const isPrereq = e.kind === 'prerequisite'
            return (
              <line
                key={`${e.from}-${e.to}-${e.kind}-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={`cog-edge cog-edge-${e.kind}${e.student ? ' is-student' : ''}`}
                stroke={isHint ? 'rgba(176, 160, 136, 0.55)' : isPrereq ? 'rgba(236, 231, 220, 0.16)' : 'rgba(255,255,255,0.08)'}
                strokeWidth={isHint ? 1.4 : 1}
                strokeDasharray={isHint ? '3 4' : undefined}
              />
            )
          })}
          {visibleNodes.map(n => {
            const p = pos[n.id]
            if (!p) return null
            const r = n.kind === 'module' ? (n.recommended ? 8 : 6) : 3.4
            const overlay = overlayKeys.has(n.id)
            const showLabel = n.recommended || n.frontier || hover?.id === n.id
            return (
              <g
                key={n.id}
                className="cog-node"
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(null)}
              >
                {overlay && (
                  <circle cx={p.x} cy={p.y} r={r + 6} className="cog-overlay-ring" />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={nodeFill(n)}
                  stroke={nodeStroke(n)}
                  strokeWidth={n.recommended || n.frontier ? 1.6 : 1}
                />
                {showLabel && (
                  <text
                    x={p.x + r + 6}
                    y={p.y + 3}
                    className="cog-label"
                  >
                    {n.title}
                  </text>
                )}
              </g>
            )
          })}
          {lanes.map((lane, i) => (
            <text key={lane.id} x={36 + i * 168} y={22} className="cog-lane">
              {lane.title}
            </text>
          ))}
        </svg>

        {hover && (
          <div className="cog-tooltip" role="status">
            <strong>{hover.title}</strong>
            <span>{hover.kind === 'module' ? hover.skillTitle : 'Concept'} · p(know) {hover.pKnow}</span>
            {hover.lastEvidence && <span>Last evidence: {hover.lastEvidence}</span>}
            {hover.recommended && <span>{graph?.why || 'Recommended next — zone of proximal development'}</span>}
            {!hover.recommended && hover.frontier && <span>On the frontier: close enough to reach, far enough to require a decision.</span>}
            {hover.downstream > 0 && hover.pKnow < 0.5 && (
              <span>Blocks {hover.downstream} later module{hover.downstream === 1 ? '' : 's'} (PageRank gap).</span>
            )}
          </div>
        )}

        <div className="cog-legend" aria-hidden="true">
          <span><i className="cog-dot is-prior" /> Prior</span>
          <span><i className="cog-dot is-frontier" /> Frontier</span>
          <span><i className="cog-dot is-next" /> Recommended</span>
          <span><i className="cog-dot is-block" /> Blocking gap</span>
        </div>
      </div>

      {!compact && (
        <div className="cog-meta-grid">
          <article className="card cog-meta">
            <h3>Frontier</h3>
            <p>{rec ? `${rec.moduleTitle} · p(know) ${rec.pKnow}` : 'Calibrating'}</p>
            <p className="cog-why">{graph?.why}</p>
          </article>
          <article className="card cog-meta">
            <h3>How they decide</h3>
            <p>{fp?.summary}</p>
          </article>
          <article className="card cog-meta">
            <h3>Blocking gaps</h3>
            {(graph?.blockers || []).slice(0, 3).length ? (
              <ul>
                {(graph.blockers || []).slice(0, 3).map(b => (
                  <li key={b.id}>{b.title} · p(know) {b.pKnow}</li>
                ))}
              </ul>
            ) : (
              <p>No concept has enough observations to rank as a blocker yet.</p>
            )}
          </article>
        </div>
      )}

      {compact && hiring.length > 0 && (
        <ol className="cog-hiring">
          {hiring.map(s => <li key={s}>{s}</li>)}
        </ol>
      )}

      {!compact && (
        <details className="cog-how" open={openHow} onToggle={e => setOpenHow(e.target.open)}>
          <summary>How this is computed</summary>
          <ul>
            {(graph?.algorithms || []).map(a => (
              <li key={a.id}><strong>{a.name}</strong> — {a.cite}. {a.applies}.</li>
            ))}
          </ul>
          <p>
            Not a foundation model. Not internet scrape. Signals come from SynapSoul CLI steps and scored modules only.
          </p>
        </details>
      )}
    </section>
  )
}

export default CognitiveGraph
