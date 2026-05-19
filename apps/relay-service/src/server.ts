import { RelayServer } from './index';

const PORT = parseInt(process.env.RELAY_PORT || '8443');
const MAX_SESSIONS = parseInt(process.env.RELAY_MAX_SESSIONS || '1000');

const relay = new RelayServer(PORT, MAX_SESSIONS);
relay.start();

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down relay server...');
  relay.stop();
  setTimeout(() => process.exit(0), 2000);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down relay server...');
  relay.stop();
  setTimeout(() => process.exit(0), 2000);
});
