import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { hashPassword, verifyPassword, generateApiKey } from '../utils/crypto.js';
import { RegisterSchema, LoginSchema } from '../utils/validators.js';
import { authMiddleware } from '../middleware/auth.js';
import { z } from 'zod';

export const authRouter = Router();

// POST /api/auth/register
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = RegisterSchema.parse(req.body);

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const apiKey = generateApiKey();

    const result = await query(
      `INSERT INTO users (email, password_hash, api_key) VALUES ($1, $2, $3) RETURNING id, email, tier, api_key, created_at`,
      [email, passwordHash, apiKey]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as any,
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, tier: user.tier, createdAt: user.created_at },
      token,
      apiKey: user.api_key,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const result = await query('SELECT id, email, password_hash, tier FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as any,
    });

    res.json({
      user: { id: user.id, email: user.email, tier: user.tier },
      token,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/api-key — generate new API key (requires auth)
authRouter.post('/api-key', authMiddleware, async (req: Request, res: Response) => {
  try {
    const apiKey = generateApiKey();
    await query('UPDATE users SET api_key = $1 WHERE id = $2', [apiKey, req.user!.id]);
    res.json({ apiKey });
  } catch (err: any) {
    console.error('API key generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me — get current user
authRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT id, email, tier, api_key, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const u = result.rows[0];
    res.json({ id: u.id, email: u.email, tier: u.tier, apiKey: u.api_key, createdAt: u.created_at });
  } catch (err: any) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
