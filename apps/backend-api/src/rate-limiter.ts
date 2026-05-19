import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 100,
};

const endpointConfigs: Record<string, RateLimitConfig> = {
  '/auth/login': { windowMs: 60 * 1000, maxRequests: 10 },
  '/auth/register': { windowMs: 60 * 1000, maxRequests: 5 },
  '/auth/refresh': { windowMs: 60 * 1000, maxRequests: 20 },
  '/friends/request': { windowMs: 60 * 1000, maxRequests: 10 },
  '/invites': { windowMs: 60 * 1000, maxRequests: 20 },
  '/presence/heartbeat': { windowMs: 60 * 1000, maxRequests: 120 },
  '/sessions/negotiate': { windowMs: 60 * 1000, maxRequests: 30 },
};

const limits = new Map<string, RateLimitEntry>();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const endpoint = req.path;

  const config = endpointConfigs[endpoint] || defaultConfig;
  const key = `${ip}:${endpoint}`;

  const now = Date.now();
  let entry = limits.get(key);

  if (!entry || now > entry.resetAt) {
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    limits.set(key, entry);
  } else {
    entry.count++;
  }

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetTime = Math.ceil((entry.resetAt - now) / 1000);

  res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', resetTime.toString());

  if (entry.count > config.maxRequests) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: resetTime,
    });
    return;
  }

  next();
}

export function cleanupExpiredLimits(): void {
  const now = Date.now();
  for (const [key, entry] of limits.entries()) {
    if (now > entry.resetAt) {
      limits.delete(key);
    }
  }
}

if (process.env.NODE_ENV !== 'test') {
  setInterval(cleanupExpiredLimits, 5 * 60 * 1000);
}
