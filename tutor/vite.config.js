import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function localApiFallback(req, res, next) {
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
      server.middlewares.use((req, res, next) => {
        if (env.VITE_API_URL) return next()
        const isLocalRoute = req.url === '/api/progress' || req.url?.match(/^\/api\/profile\/[^/?]+/)
        if (isLocalRoute) return localApiFallback(req, res, next)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use(localApiFallback)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_URL || 'http://localhost:3001'

  return {
    plugins: [react(), tutorDataPlugin()],
    server: {
      port: 5173,
      proxy: env.VITE_API_URL ? undefined : {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
