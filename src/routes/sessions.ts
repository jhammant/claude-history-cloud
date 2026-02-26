import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { SessionSummarySchema } from '../utils/validators.js';
import { query } from '../db.js';

export const sessionsRouter = Router();
sessionsRouter.use(authMiddleware);

// POST /api/sessions — push a session summary
sessionsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const data = SessionSummarySchema.parse(req.body);
    const teamId = (req.body.teamId as string) || null;

    await query(
      `INSERT INTO session_summaries (user_id, team_id, session_id, project, summary)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, session_id) DO UPDATE SET summary = $5, project = $4`,
      [req.user!.id, teamId, data.sessionId, data.project || null, JSON.stringify(data.summary)]
    );

    res.status(201).json({ sessionId: data.sessionId });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Push session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions — list session summaries
sessionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const teamId = (req.query.teamId as string) || null;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const project = req.query.project as string | undefined;

    let where = teamId
      ? `(user_id = $1 OR team_id = $2)`
      : `user_id = $1`;
    const params: any[] = teamId ? [req.user!.id, teamId] : [req.user!.id];
    let idx = params.length + 1;

    if (project) { where += ` AND project = $${idx++}`; params.push(project); }

    const countResult = await query(`SELECT COUNT(*)::int AS total FROM session_summaries WHERE ${where}`, params);

    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM session_summaries WHERE ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    res.json({ summaries: result.rows, total: countResult.rows[0]?.total || 0 });
  } catch (err: any) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions/:sessionId
sessionsRouter.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM session_summaries WHERE session_id = $1 AND user_id = $2`,
      [req.params.sessionId, req.user!.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
