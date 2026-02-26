import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getUsageStats } from '../services/billing.js';
import { config } from '../config.js';

export const usageRouter = Router();
usageRouter.use(authMiddleware);

// GET /api/usage
usageRouter.get('/', async (req: Request, res: Response) => {
  try {
    const stats = await getUsageStats(req.user!.id);
    const limits = config.tierLimits[stats.tier] || config.tierLimits['free'];

    res.json({
      ...stats,
      limits: {
        knowledgeEntries: limits.knowledgeEntries,
        teamMembers: limits.teamMembers,
      },
    });
  } catch (err: any) {
    console.error('Usage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
