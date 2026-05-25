import { generateNoiseKeys, NoiseSession } from '../src/crypto/noise-session';

describe('NoiseSession', () => {
  it('generates distinct keypairs', () => {
    const k1 = generateNoiseKeys();
    const k2 = generateNoiseKeys();
    expect(k1.staticPub.toString('hex')).not.toBe(k2.staticPub.toString('hex'));
    expect(k1.staticPriv.toString('hex')).not.toBe(k2.staticPriv.toString('hex'));
    expect(k1.staticPub.length).toBeGreaterThan(0);
  });

  it('encrypts and decrypts a round-trip message', async () => {
    const hostKeys = generateNoiseKeys();

    const { firstMessage, finalize } = await NoiseSession.guestHandshake(hostKeys.staticPub);
    const { session: hostSession, response } = await NoiseSession.hostHandshake(hostKeys, firstMessage);
    const guestSession = finalize(response);

    const plaintext = Buffer.from('Hello, Minecraft!');
    const encrypted = guestSession.encrypt(plaintext);
    const decrypted = hostSession.decrypt(encrypted);

    expect(decrypted.toString()).toBe('Hello, Minecraft!');
  });

  it('encrypts in both directions independently', async () => {
    const hostKeys = generateNoiseKeys();

    const { firstMessage, finalize } = await NoiseSession.guestHandshake(hostKeys.staticPub);
    const { session: hostSession, response } = await NoiseSession.hostHandshake(hostKeys, firstMessage);
    const guestSession = finalize(response);

    const msg1 = Buffer.from('host to guest');
    const msg2 = Buffer.from('guest to host');

    const enc1 = hostSession.encrypt(msg1);
    const enc2 = guestSession.encrypt(msg2);

    expect(guestSession.decrypt(enc1).toString()).toBe('host to guest');
    expect(hostSession.decrypt(enc2).toString()).toBe('guest to host');
  });
});
