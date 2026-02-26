import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

export interface AuthUser {
  id: string;
  email: string;
  tier: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Authenticate via JWT Bearer token or API key.
 * Sets req.user on success.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  // Try Bearer JWT first
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // Check if it looks like a JWT (has dots) vs API key (hex string)
    if (token.includes('.')) {
      try {
        const payload = jwt.verify(token, config.jwt.secret) as { userId: string; email: string };
        const result = await query('SELECT id, email, tier FROM users WHERE id = $1', [payload.userId]);
        if (result.rows.length === 0) {
          res.status(401).json({ error: 'User not found' });
          return;
        }
        req.user = result.rows[0];
        next();
        return;
      } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
    }

    // Treat as API key
    const result = await query('SELECT id, email, tier FROM users WHERE api_key = $1', [token]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }
    req.user = result.rows[0];
    next();
    return;
  }

  res.status(401).json({ error: 'Invalid Authorization format. Use: Bearer <token|api_key>' });
}
