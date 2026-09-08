import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function tutorApiMiddleware(req, res, next) {
  if (req.url === '/api/progress') {
    try {
      const data = readFileSync('./data/progress.json', 'utf8')
      res.setHeader('Content-Type', 'application/json')
      res.end(data)
    } catch {
      res.statusCode = 404
      res.end('{}')
    }
    return
  }
  const profileMatch = req.url?.match(/^\/api\/profile\/([^/?]+)/)
  if (profileMatch) {
    const username = profileMatch[1]
    const profilePath = join('./data/public', `${username}.json`)
    if (existsSync(profilePath)) {
      res.setHeader('Content-Type', 'application/json')
      res.end(readFileSync(profilePath, 'utf8'))
    } else {
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'Profile not found' }))
    }
    return
  }
  next()
}

function tutorDataPlugin() {
  return {
    name: 'tutor-data',
    configureServer(server) {
      server.middlewares.use(tutorApiMiddleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(tutorApiMiddleware)
    },
  }
}

export default defineConfig({
  plugins: [react(), tutorDataPlugin()],
  server: { port: 5173 },
})
