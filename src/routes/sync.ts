import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { PushKnowledgeSchema, PushSessionsSchema } from '../utils/validators.js';
import { mergeKnowledgeEntries, mergeSessionSummaries } from '../services/merge.js';
import { checkKnowledgeLimit, logSyncAction } from '../services/billing.js';
import { query } from '../db.js';

export const syncRouter = Router();
syncRouter.use(authMiddleware);

// POST /api/sync/push/knowledge
syncRouter.post('/push/knowledge', async (req: Request, res: Response) => {
  try {
    const { entries, teamId } = PushKnowledgeSchema.parse(req.body);

    const limit = await checkKnowledgeLimit(req.user!.id);
    if (!limit.allowed) {
      res.status(429).json({ error: 'Knowledge entry limit reached', current: limit.current, limit: limit.limit });
      return;
    }

    const result = await mergeKnowledgeEntries(req.user!.id, teamId || null, entries);
    await logSyncAction(req.user!.id, 'push_knowledge', entries.length);

    res.json({ accepted: result.inserted, skipped: result.skipped, errors: [] });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Sync push knowledge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sync/push/sessions
syncRouter.post('/push/sessions', async (req: Request, res: Response) => {
  try {
    const { summaries, teamId } = PushSessionsSchema.parse(req.body);

    const result = await mergeSessionSummaries(req.user!.id, teamId || null, summaries);
    await logSyncAction(req.user!.id, 'push_sessions', summaries.length);

    res.json({ accepted: result.inserted, updated: result.updated, errors: [] });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Sync push sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sync/pull/knowledge
syncRouter.get('/pull/knowledge', async (req: Request, res: Response) => {
  try {
    const teamId = (req.query.teamId as string) || null;
    const since = req.query.since ? parseInt(req.query.since as string) : undefined;

    let where = teamId
      ? `(user_id = $1 OR team_id = $2)`
      : `user_id = $1`;
    const params: any[] = teamId ? [req.user!.id, teamId] : [req.user!.id];
    let idx = params.length + 1;

    if (since) {
      where += ` AND updated_at > to_timestamp($${idx++})`;
      params.push(since / 1000);
    }

    const result = await query(
      `SELECT * FROM knowledge_entries WHERE ${where} ORDER BY updated_at DESC LIMIT 500`,
      params
    );

    await logSyncAction(req.user!.id, 'pull_knowledge', result.rows.length);
    res.json({ entries: result.rows });
  } catch (err: any) {
    console.error('Sync pull knowledge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sync/pull/sessions
syncRouter.get('/pull/sessions', async (req: Request, res: Response) => {
  try {
    const teamId = (req.query.teamId as string) || null;
    const since = req.query.since ? parseInt(req.query.since as string) : undefined;

    let where = teamId
      ? `(user_id = $1 OR team_id = $2)`
      : `user_id = $1`;
    const params: any[] = teamId ? [req.user!.id, teamId] : [req.user!.id];
    let idx = params.length + 1;

    if (since) {
      where += ` AND created_at > to_timestamp($${idx++})`;
      params.push(since / 1000);
    }

    const result = await query(
      `SELECT * FROM session_summaries WHERE ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );

    await logSyncAction(req.user!.id, 'pull_sessions', result.rows.length);
    res.json({ summaries: result.rows });
  } catch (err: any) {
    console.error('Sync pull sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
