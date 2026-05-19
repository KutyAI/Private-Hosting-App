import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { authMiddleware, AuthPayload } from '../auth';

const router = Router();

router.post('/heartbeat', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;
  const { device_id, server_status, player_count, direct_candidate_info } = req.body;

  const device = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(device_id, user.userId);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  db.prepare('UPDATE devices SET last_online_at = datetime(\'now\') WHERE id = ?').run(device_id);

  const existing = db.prepare('SELECT device_id FROM presence WHERE device_id = ?').get(device_id);
  if (existing) {
    db.prepare(`
      UPDATE presence SET online = 1, server_status = ?, player_count = ?, 
             direct_candidate_info = ?, updated_at = datetime('now') WHERE device_id = ?
    `).run(server_status || 'offline', player_count || 0, JSON.stringify(direct_candidate_info || {}), device_id);
  } else {
    db.prepare(`
      INSERT INTO presence (device_id, online, server_status, player_count, direct_candidate_info)
      VALUES (?, 1, ?, ?, ?)
    `).run(device_id, server_status || 'offline', player_count || 0, JSON.stringify(direct_candidate_info || {}));
  }

  res.json({ success: true });
});

router.get('/servers/:serverId', (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const { serverId } = req.params;

  const presence = db.prepare(`
    SELECT p.*, d.device_name, u.display_name as host_name
    FROM presence p
    JOIN devices d ON p.device_id = d.id
    JOIN users u ON d.user_id = u.id
    JOIN server_registrations sr ON sr.host_device_id = d.id
    WHERE sr.local_server_slug = ? AND p.online = 1
  `).get(serverId);

  if (!presence) {
    return res.status(404).json({ error: 'Server not online' });
  }

  res.json(presence);
});

router.post('/offline', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const { device_id } = req.body;

  db.prepare('UPDATE presence SET online = 0, updated_at = datetime(\'now\') WHERE device_id = ?').run(device_id);
  res.json({ success: true });
});

export default router;
