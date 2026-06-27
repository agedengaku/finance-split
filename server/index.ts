import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type Response } from 'express'
import session from 'express-session'
import MySQLStoreFactory from 'express-mysql-session'
import helmet from 'helmet'
import { api } from './api.js'
import { config } from './config.js'
import { pool } from './db.js'

const app = express()
const MySQLStore = MySQLStoreFactory(session)
const sessionStore = new MySQLStore(
  {
    ...config.db,
    createDatabaseTable: true,
    schema: {
      tableName: 'sessions',
      columnNames: {
        session_id: 'session_id',
        expires: 'expires',
        data: 'data',
      },
    },
  },
)

app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(
  helmet({
    contentSecurityPolicy: config.env === 'production' ? undefined : false,
  }),
)
app.use(express.json({ limit: '2mb' }))
app.use((request, response, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    request.headers['content-type']?.split(';')[0] !== 'application/json'
  ) {
    return response.status(415).json({ error: 'Requests must use application/json.' })
  }
  next()
})
app.use(
  session({
    name: 'finance.sid',
    secret: config.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: config.env === 'production',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.env === 'production',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  }),
)

app.get('/api/health', async (_request: Request, response: Response, next: NextFunction) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok' })
  } catch (error) {
    next(error)
  }
})
app.use('/api', api)

if (config.env === 'production') {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
  const clientDirectory = path.resolve(currentDirectory, '../client/dist')
  app.use(express.static(clientDirectory, { index: false, maxAge: '1d' }))
  app.get('/{*path}', (_request: Request, response: Response) => {
    response.sendFile(path.join(clientDirectory, 'index.html'))
  })
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const knownError = error as { status?: number; message?: string }
  const status = knownError.status || 500
  if (status >= 500) console.error(error)
  response.status(status).json({
    error:
      status >= 500
        ? 'Something went wrong. Please try again.'
        : knownError.message || 'The request could not be completed.',
  })
})

const server = app.listen(config.port, () => {
  console.log(`FairShare API listening on port ${config.port}`)
})

async function shutdown() {
  server.close(async () => {
    await sessionStore.close()
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
