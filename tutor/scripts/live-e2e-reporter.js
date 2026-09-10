import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const RESULTS_DIR = join(REPO_ROOT, 'test-results')

class LiveE2eReporter {
  onBegin() {
    this.startedAt = new Date().toISOString()
    this.t0 = Date.now()
    this.steps = []
  }

  onTestEnd(test, result) {
    const name = test.title
    const ms = result.duration
    if (result.status === 'passed') {
      this.steps.push({ name, status: 'pass', ms })
    } else {
      this.steps.push({
        name,
        status: 'fail',
        ms,
        error: result.error?.message || result.status,
      })
    }
  }

  onEnd() {
    const durationMs = Date.now() - this.t0
    const passed = this.steps.filter(s => s.status === 'pass').length
    const failed = this.steps.filter(s => s.status === 'fail').length
    const report = {
      suite: 'live-e2e',
      target: process.env.LEARNLAB_FRONTEND_URL || 'https://tutor-alpha-sandy.vercel.app',
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      durationMs,
      summary: { passed, failed, total: this.steps.length },
      steps: this.steps,
    }

    mkdirSync(RESULTS_DIR, { recursive: true })
    writeFileSync(join(RESULTS_DIR, 'live-audit-e2e.json'), JSON.stringify(report, null, 2))

    const latestPath = join(RESULTS_DIR, 'live-audit-latest.json')
    let existing = {}
    if (existsSync(latestPath)) {
      try {
        existing = JSON.parse(readFileSync(latestPath, 'utf8'))
      } catch {
        existing = {}
      }
    }
    const merged = {
      ...existing,
      e2e: report,
      updatedAt: new Date().toISOString(),
      combined: {
        passed: (existing.api?.summary?.passed ?? 0) + passed,
        failed: (existing.api?.summary?.failed ?? 0) + failed,
        total: (existing.api?.summary?.total ?? 0) + this.steps.length,
      },
    }
    writeFileSync(latestPath, JSON.stringify(merged, null, 2))
  }
}

export default LiveE2eReporter
