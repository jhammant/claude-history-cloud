import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { knowledgeRouter } from './routes/knowledge.js';
import { sessionsRouter } from './routes/sessions.js';
import { teamsRouter } from './routes/teams.js';
import { syncRouter } from './routes/sync.js';
import { usageRouter } from './routes/usage.js';
import { federationRouter } from './routes/federation.js';
import { billingRouter } from './routes/billing.js';
import { apiRateLimit } from './middleware/rate-limit.js';

const app = express();

// Stripe webhook needs raw body — mount BEFORE json parser
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.2.0' });
});

// Rate limiting on API routes
app.use('/api', apiRateLimit);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/usage', usageRouter);
app.use('/api/federation', federationRouter);
app.use('/api/billing', billingRouter);

// Serve landing page
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`Claude History Cloud running on port ${config.port} (${config.nodeEnv})`);
});

export default app;
