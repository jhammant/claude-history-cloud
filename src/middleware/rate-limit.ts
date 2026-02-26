import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import type { Request } from 'express';

/**
 * Basic rate limiter — uses tier from req.user if available.
 */
export const apiRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: (req: Request) => {
    const tier = req.user?.tier || 'free';
    if (tier === 'team') return config.rateLimit.maxTeam;
    if (tier === 'pro') return config.rateLimit.maxPro;
    return config.rateLimit.maxFree;
  },
  keyGenerator: (req: Request) => req.user?.id || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
