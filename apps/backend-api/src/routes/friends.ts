import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { authMiddleware, AuthPayload } from '../auth';

const router = Router();

router.post('/request', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;
  const { friend_email } = req.body;

  const friend = db.prepare('SELECT id FROM users WHERE email = ?').get(friend_email);
  if (!friend) {
    return res.status(404).json({ error: 'User not found' });
  }

  if ((friend as any).id === user.userId) {
    return res.status(400).json({ error: 'Cannot friend yourself' });
  }

  const existing = db.prepare(
    'SELECT id FROM friendships WHERE (requester_user_id = ? AND addressee_user_id = ?) OR (requester_user_id = ? AND addressee_user_id = ?)'
  ).get(user.userId, (friend as any).id, (friend as any).id, user.userId);

  if (existing) {
    return res.status(409).json({ error: 'Friend request already exists' });
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO friendships (id, requester_user_id, addressee_user_id) VALUES (?, ?, ?)'
  ).run(id, user.userId, (friend as any).id);

  res.status(201).json({ id, status: 'pending' });
});

router.post('/accept', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;
  const { friendship_id } = req.body;

  const friendship = db.prepare(
    'SELECT * FROM friendships WHERE id = ? AND addressee_user_id = ? AND status = \'pending\''
  ).get(friendship_id, user.userId);

  if (!friendship) {
    return res.status(404).json({ error: 'Friend request not found' });
  }

  db.prepare(
    'UPDATE friendships SET status = \'accepted\', accepted_at = datetime(\'now\') WHERE id = ?'
  ).run(friendship_id);

  res.json({ success: true });
});

router.get('/list', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;

  const friends = db.prepare(`
    SELECT f.id, f.status, f.created_at, f.accepted_at,
           u.id as friend_id, u.email as friend_email, u.display_name as friend_name
    FROM friendships f
    JOIN users u ON (
      (f.requester_user_id = u.id AND f.addressee_user_id = ?) OR
      (f.addressee_user_id = u.id AND f.requester_user_id = ?)
    )
    WHERE f.status = 'accepted'
  `).all(user.userId, user.userId);

  res.json(friends);
});

router.post('/:serverId/invites', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;
  const { server_id } = req.params;
  const { max_uses, expires_in_hours } = req.body;

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + (expires_in_hours || 24) * 3600000).toISOString();

  const deviceId = req.headers['x-device-id'] as string;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO invites (id, host_user_id, host_device_id, server_id, code, expires_at, max_uses)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, user.userId, deviceId || '', server_id, code, expiresAt, max_uses || 10);

  res.status(201).json({ id, code, expires_at: expiresAt, max_uses: max_uses || 10 });
});

router.post('/:code/join', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;
  const { code } = req.params;

  const invite = db.prepare(
    'SELECT * FROM invites WHERE code = ? AND status = \'active\' AND expires_at > datetime(\'now\')'
  ).get(code);

  if (!invite) {
    return res.status(404).json({ error: 'Invalid or expired invite code' });
  }

  if ((invite as any).current_uses >= (invite as any).max_uses) {
    db.prepare('UPDATE invites SET status = \'used_up\' WHERE id = ?').run((invite as any).id);
    return res.status(400).json({ error: 'Invite code has reached max uses' });
  }

  db.prepare('UPDATE invites SET current_uses = current_uses + 1 WHERE id = ?').run((invite as any).id);

  res.json({
    host_user_id: (invite as any).host_user_id,
    host_device_id: (invite as any).host_device_id,
    server_id: (invite as any).server_id,
  });
});

export default router;
