import { Router, Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { generateToken, authMiddleware, AuthPayload } from '../auth';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, (user as any).password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  db.prepare('UPDATE users SET last_seen_at = datetime(\'now\') WHERE id = ?').run((user as any).id);

  const tokens = generateToken({
    userId: (user as any).id,
    email: (user as any).email,
  });

  res.json(tokens);
});

router.post('/register', (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const { email, password, display_name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const name = display_name || email.split('@')[0];

  db.prepare('INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)')
    .run(id, email, passwordHash, name);

  const tokens = generateToken({ userId: id, email });
  res.status(201).json(tokens);
});

router.post('/refresh', (req: Request, res: Response) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  const db: Database.Database = (req as any).db;
  const { verifyToken } = require('../auth');
  const payload = verifyToken(refresh_token);
  
  if (!payload) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(payload.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const tokens = generateToken({
    userId: (user as any).id,
    email: (user as any).email,
  });

  res.json(tokens);
});

router.post('/logout', authMiddleware, (req: Request, res: Response) => {
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;
  
  const userData = db.prepare('SELECT id, email, display_name, created_at, last_seen_at FROM users WHERE id = ?')
    .get(user.userId);
  
  if (!userData) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(userData);
});

export default router;
