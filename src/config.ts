export const config = {
  port: parseInt(process.env.PORT || '3100', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/claude_history',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    pricePro: process.env.STRIPE_PRICE_PRO || '',
    priceTeam: process.env.STRIPE_PRICE_TEAM || '',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxFree: parseInt(process.env.RATE_LIMIT_MAX_FREE || '30', 10),
    maxPro: parseInt(process.env.RATE_LIMIT_MAX_PRO || '120', 10),
    maxTeam: parseInt(process.env.RATE_LIMIT_MAX_TEAM || '300', 10),
  },
  tierLimits: {
    free: { knowledgeEntries: 500, teamMembers: 0, sessionsIndexed: 50 },
    pro: { knowledgeEntries: 10000, teamMembers: 0, sessionsIndexed: 1000 },
    team: { knowledgeEntries: 50000, teamMembers: 50, sessionsIndexed: 10000 },
  } as Record<string, { knowledgeEntries: number; teamMembers: number; sessionsIndexed: number }>,
} as const;
