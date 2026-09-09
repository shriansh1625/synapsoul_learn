import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

/** Attach req.user when a valid Bearer token is present; otherwise continue anonymously. */
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return next()
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET)
  } catch {
    /* invalid token — treat as anonymous for optional routes */
  }
  next()
}
