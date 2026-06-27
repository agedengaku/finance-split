import 'dotenv/config'

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  sessionSecret: required('SESSION_SECRET', 'development-only-change-this-secret'),
  db: {
    host: required('DB_HOST', '127.0.0.1'),
    port: Number(process.env.DB_PORT || 3306),
    database: required('DB_NAME', 'finance_split'),
    user: required('DB_USER', 'finance_split'),
    password: required('DB_PASSWORD', ''),
  },
}

if (config.env === 'production' && config.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production')
}
