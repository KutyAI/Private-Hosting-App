import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { authMiddleware, AuthPayload } from '../auth';

const router = Router();

router.post('/register', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;
  const { device_name, device_public_key, platform, app_version } = req.body;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO devices (id, user_id, device_public_key, device_name, platform, app_version)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, user.userId, device_public_key || '', device_name || 'Unknown', platform || 'windows', app_version || '0.1.0');

  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  res.status(201).json(device);
});

router.post('/revoke', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;
  const { device_id } = req.body;

  const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(device_id, user.userId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  db.prepare('UPDATE devices SET revoked_at = datetime(\'now\') WHERE id = ?').run(device_id);
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;

  const deviceId = req.headers['x-device-id'] as string;
  if (!deviceId) {
    return res.status(400).json({ error: 'X-Device-ID header required' });
  }

  const device = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(deviceId, user.userId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  res.json(device);
});

export default router;
