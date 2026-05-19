import * as jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'mc-hosting-dev-secret-change-in-production';

export interface AuthPayload {
  userId: string;
  email: string;
}

export function generateToken(payload: AuthPayload): { access_token: string; refresh_token: string; expires_in: number } {
  const access_token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  const refresh_token = jwt.sign({ userId: payload.userId }, JWT_SECRET, { expiresIn: '7d' });
  return { access_token, refresh_token, expires_in: 3600 };
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  (req as any).user = payload;
  next();
}
