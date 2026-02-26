import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { CreateTeamSchema, InviteSchema } from '../utils/validators.js';
import { query, getClient } from '../db.js';
import { checkTeamMemberLimit } from '../services/billing.js';

export const teamsRouter = Router();
teamsRouter.use(authMiddleware);

// POST /api/teams — create team
teamsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = CreateTeamSchema.parse(req.body);
    const client = await getClient();

    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO teams (name, owner_id) VALUES ($1, $2) RETURNING id, name, created_at`,
        [name, req.user!.id]
      );
      const team = result.rows[0];

      // Add owner as member with 'owner' role
      await client.query(
        `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [team.id, req.user!.id]
      );
      await client.query('COMMIT');

      res.status(201).json(team);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/teams — list user's teams
teamsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT t.*, tm.role FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       WHERE tm.user_id = $1
       ORDER BY t.created_at DESC`,
      [req.user!.id]
    );
    res.json({ teams: result.rows });
  } catch (err: any) {
    console.error('List teams error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/teams/:id/invite — invite member by email
teamsRouter.post('/:id/invite', async (req: Request, res: Response) => {
  try {
    const { email } = InviteSchema.parse(req.body);
    const teamId = req.params.id;

    // Check requester is owner
    const membership = await query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, req.user!.id]
    );
    if (membership.rows.length === 0 || membership.rows[0].role !== 'owner') {
      res.status(403).json({ error: 'Only team owners can invite members' });
      return;
    }

    // Check team member limit
    const team = await query('SELECT owner_id FROM teams WHERE id = $1', [teamId]);
    const limit = await checkTeamMemberLimit(teamId, team.rows[0].owner_id);
    if (!limit.allowed) {
      res.status(429).json({ error: 'Team member limit reached', current: limit.current, limit: limit.limit });
      return;
    }

    // Find user by email
    const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found. They must register first.' });
      return;
    }

    const userId = userResult.rows[0].id;

    // Check not already a member
    const existing = await query(
      'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, userId]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'User is already a team member' });
      return;
    }

    await query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')`,
      [teamId, userId]
    );

    res.status(201).json({ added: true, userId });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Invite member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/teams/:id/members
teamsRouter.get('/:id/members', async (req: Request, res: Response) => {
  try {
    // Verify requester is a member
    const membership = await query(
      'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );
    if (membership.rows.length === 0) {
      res.status(403).json({ error: 'Not a team member' });
      return;
    }

    const result = await query(
      `SELECT u.id, u.email, tm.role, tm.joined_at
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY tm.joined_at`,
      [req.params.id]
    );
    res.json({ members: result.rows });
  } catch (err: any) {
    console.error('List members error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/teams/:id/members/:userId
teamsRouter.delete('/:id/members/:userId', async (req: Request, res: Response) => {
  try {
    const teamId = req.params.id;
    const targetUserId = req.params.userId;

    // Check requester is owner or removing themselves
    const membership = await query(
      'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, req.user!.id]
    );
    if (membership.rows.length === 0) {
      res.status(403).json({ error: 'Not a team member' });
      return;
    }
    if (membership.rows[0].role !== 'owner' && req.user!.id !== targetUserId) {
      res.status(403).json({ error: 'Only owners can remove other members' });
      return;
    }

    // Can't remove owner
    const target = await query(
      'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, targetUserId]
    );
    if (target.rows[0]?.role === 'owner') {
      res.status(400).json({ error: 'Cannot remove team owner' });
      return;
    }

    await query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, targetUserId]);
    res.json({ removed: true });
  } catch (err: any) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
