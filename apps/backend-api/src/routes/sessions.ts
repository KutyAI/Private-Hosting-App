import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { authMiddleware, AuthPayload } from '../auth';

const router = Router();

router.post('/negotiate', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const user = (req as any).user as AuthPayload;
  const { host_device_id, guest_candidates } = req.body;

  const hostPresence = db.prepare(
    'SELECT * FROM presence WHERE device_id = ? AND online = 1'
  ).get(host_device_id);

  if (!hostPresence) {
    return res.status(404).json({ error: 'Host is not online' });
  }

  const sessionId = uuidv4();
  const hostCandidates = JSON.parse((hostPresence as any).direct_candidate_info || '[]');

  db.prepare(`
    INSERT INTO relay_allocations (id, session_id, host_device_id, guest_device_id)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, sessionId, host_device_id, req.headers['x-device-id']);

  res.json({
    session_id: sessionId,
    host_device_id,
    guest_device_id: req.headers['x-device-id'],
    direct_candidates: hostCandidates,
    guest_candidates: guest_candidates,
    status: 'negotiating',
  });
});

router.post('/:sessionId/relay-allocate', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const { sessionId } = req.params;

  const allocation = db.prepare(
    'SELECT * FROM relay_allocations WHERE session_id = ? AND released_at IS NULL'
  ).get(sessionId);

  if (!allocation) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const relayToken = uuidv4();
  const relayHost = process.env.RELAY_HOST || 'relay.mchosting.local';
  const relayPort = process.env.RELAY_PORT || '8443';

  res.json({
    relay_token: relayToken,
    relay_host: relayHost,
    relay_port: parseInt(relayPort),
    relay_url: `wss://${relayHost}:${relayPort}/relay/${sessionId}`,
  });
});

router.post('/:sessionId/close', authMiddleware, (req: Request, res: Response) => {
  const db: Database.Database = (req as any).db;
  const { sessionId } = req.params;

  db.prepare(
    'UPDATE relay_allocations SET released_at = datetime(\'now\') WHERE session_id = ?'
  ).run(sessionId);

  res.json({ success: true });
});

export default router;
