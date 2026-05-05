const REQUIRED_ENV_VARS = [
  'AIRTABLE_API_KEY',
  'AIRTABLE_BASE_ID',
  'SESSION_SECRET',
] as const

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Check your .env.local file or deployment environment settings.',
    )
  }
  if ((process.env.SESSION_SECRET ?? '').length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long.')
  }
}
