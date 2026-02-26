import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { KnowledgeEntrySchema, KnowledgeUpdateSchema, SearchSchema } from '../utils/validators.js';
import * as knowledgeService from '../services/knowledge.js';
import { searchKnowledge } from '../services/search.js';
import { checkKnowledgeLimit } from '../services/billing.js';

export const knowledgeRouter = Router();
knowledgeRouter.use(authMiddleware);

// POST /api/knowledge — create entry
knowledgeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const entry = KnowledgeEntrySchema.parse(req.body);
    const teamId = (req.body.teamId as string) || null;

    const limit = await checkKnowledgeLimit(req.user!.id);
    if (!limit.allowed) {
      res.status(429).json({ error: 'Knowledge entry limit reached', current: limit.current, limit: limit.limit });
      return;
    }

    const id = await knowledgeService.createKnowledgeEntry(req.user!.id, teamId, entry);
    res.status(201).json({ id });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Create knowledge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/knowledge — list entries
knowledgeRouter.get('/', async (req: Request, res: Response) => {
  try {
    const teamId = (req.query.teamId as string) || null;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const project = req.query.project as string | undefined;
    const type = req.query.type as string | undefined;

    const result = await knowledgeService.listKnowledgeEntries(req.user!.id, teamId, { project, type, limit, offset });
    res.json(result);
  } catch (err: any) {
    console.error('List knowledge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/knowledge/search — full-text search
knowledgeRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const params = SearchSchema.parse(req.query);
    const teamId = (req.query.teamId as string) || null;

    const result = await searchKnowledge(req.user!.id, teamId, params.q, {
      project: params.project,
      type: params.type,
      limit: params.limit,
      offset: params.offset,
    });
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Search knowledge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/knowledge/:id
knowledgeRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const entry = await knowledgeService.getKnowledgeEntry(req.params.id, req.user!.id);
    if (!entry) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(entry);
  } catch (err: any) {
    console.error('Get knowledge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/knowledge/:id
knowledgeRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updates = KnowledgeUpdateSchema.parse(req.body);
    const ok = await knowledgeService.updateKnowledgeEntry(req.params.id, req.user!.id, updates);
    if (!ok) {
      res.status(404).json({ error: 'Not found or no changes' });
      return;
    }
    res.json({ updated: true });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Update knowledge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/knowledge/:id
knowledgeRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const ok = await knowledgeService.deleteKnowledgeEntry(req.params.id, req.user!.id);
    if (!ok) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ deleted: true });
  } catch (err: any) {
    console.error('Delete knowledge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
