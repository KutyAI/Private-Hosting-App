import * as crypto from 'crypto';

export interface NoiseKeys {
  staticPub: Buffer;
  staticPriv: Buffer;
}

interface NoiseState {
  chainKey: Buffer;
  sendKey: Buffer;
  recvKey: Buffer;
  nSend: number;
  nRecv: number;
}

const CURVE = 'prime256v1';
const HASH = 'sha256';
const CIPHER = 'aes-256-gcm';

function hkdf(salt: Buffer, ikm: Buffer, length: number, info: Buffer = Buffer.alloc(0)): Buffer {
  const prk = crypto.createHmac(HASH, salt).update(ikm).digest();
  const n = Math.ceil(length / 32);
  const okm = Buffer.alloc(length);
  let prev = Buffer.alloc(0);
  for (let i = 1; i <= n; i++) {
    const hmac = crypto.createHmac(HASH, prk);
    hmac.update(prev);
    hmac.update(info);
    hmac.update(Buffer.from([i]));
    prev = hmac.digest();
    prev.copy(okm, (i - 1) * 32, 0, Math.min(32, length - (i - 1) * 32));
  }
  return okm;
}

function dh(priv: Buffer, pub: Buffer): Buffer {
  const ecdh = crypto.createECDH(CURVE);
  ecdh.setPrivateKey(priv);
  return ecdh.computeSecret(pub);
}

function mix(ck: Buffer, input: Buffer): { ck: Buffer; k: Buffer } {
  const out = hkdf(ck, input, 64);
  return { ck: out.slice(0, 32), k: out.slice(32, 64) };
}

function gcmEncrypt(key: Buffer, n: number, ad: Buffer, plaintext: Buffer): Buffer {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32LE(n, 8);
  const cipher = crypto.createCipheriv(CIPHER, key, nonce);
  cipher.setAAD(ad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return ct;
}

function gcmDecrypt(key: Buffer, n: number, ad: Buffer, ciphertext: Buffer): Buffer {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32LE(n, 8);
  const tag = ciphertext.slice(-16);
  const ct = ciphertext.slice(0, -16);
  const decipher = crypto.createDecipheriv(CIPHER, key, nonce);
  decipher.setAAD(ad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export function generateNoiseKeys(): NoiseKeys {
  const ecdh = crypto.createECDH(CURVE);
  ecdh.generateKeys();
  return {
    staticPriv: ecdh.getPrivateKey(),
    staticPub: ecdh.getPublicKey(null, 'uncompressed'),
  };
}

export class NoiseSession {
  private state: NoiseState;

  private constructor(state: NoiseState) {
    this.state = state;
  }

  static async hostHandshake(
    localKeys: NoiseKeys,
    firstMessage: Buffer,
  ): Promise<{ session: NoiseSession; response: Buffer }> {
    const h0 = crypto.createHash(HASH).update('Noise_IK_P256_AESGCM_SHA256').digest();

    const eRemotePub = firstMessage.slice(0, 65);
    const encS = firstMessage.slice(65, 65 + 49);

    let ck: Buffer = h0;
    let h: Buffer = crypto.createHash(HASH).update(h0).update(eRemotePub).digest();

    const { ck: ck1, k: k1 } = mix(ck, eRemotePub);
    ck = ck1;

    const { ck: ck2 } = mix(ck, Buffer.alloc(0));
    ck = ck2;

    const eLocalEcdh = crypto.createECDH(CURVE);
    eLocalEcdh.generateKeys();
    const eLocalPub = eLocalEcdh.getPublicKey(null, 'uncompressed');
    const eLocalPriv = eLocalEcdh.getPrivateKey();

    h = crypto.createHash(HASH).update(h).update(eLocalPub).digest();

    const ee = dh(eLocalPriv, eRemotePub);
    const { ck: ck3, k: k2 } = mix(ck, ee);
    ck = ck3;

    const es = dh(localKeys.staticPriv, eRemotePub);
    const { ck: ck4, k: k3 } = mix(ck, es);
    ck = ck4;

    const sEncrypted = gcmEncrypt(k3, 0, h, localKeys.staticPub);
    h = crypto.createHash(HASH).update(h).update(sEncrypted).digest();

    const { ck: ck5, k: sendKey } = mix(ck, Buffer.alloc(0));
    const ck6 = ck5;
    const { ck: ck7, k: recvKey } = mix(ck6, Buffer.alloc(0));

    const response = Buffer.concat([eLocalPub, sEncrypted]);

    const session = new NoiseSession({
      chainKey: ck7,
      sendKey,
      recvKey,
      nSend: 0,
      nRecv: 0,
    });

    return { session, response };
  }

  static async guestHandshake(
    remoteStaticPub: Buffer,
  ): Promise<{ session: NoiseSession; firstMessage: Buffer; finalize: (response: Buffer) => NoiseSession }> {
    const eLocalEcdh = crypto.createECDH(CURVE);
    eLocalEcdh.generateKeys();
    const eLocalPub = eLocalEcdh.getPublicKey(null, 'uncompressed');
    const eLocalPriv = eLocalEcdh.getPrivateKey();

    const h0 = crypto.createHash(HASH).update('Noise_IK_P256_AESGCM_SHA256').digest();
    let h: Buffer = crypto.createHash(HASH).update(h0).update(eLocalPub).digest();
    let ck: Buffer = h0;

    const { ck: ck1 } = mix(ck, eLocalPub);
    ck = ck1;

    const es = dh(eLocalPriv, remoteStaticPub);
    const { ck: ck2 } = mix(ck, es);
    ck = ck2;

    const firstMessage = eLocalPub;

    function finalize(response: Buffer): NoiseSession {
      const eRemotePub = response.slice(0, 65);
      const sEncrypted = response.slice(65);

      const ee = dh(eLocalPriv, eRemotePub);
      const { ck: ck3, k: k1 } = mix(ck, ee);
      const ck4 = ck3;

      const { ck: ck5, k: recvKey } = mix(ck4, Buffer.alloc(0));
      const { ck: ck6, k: sendKey } = mix(ck5, Buffer.alloc(0));

      return new NoiseSession({
        chainKey: ck6,
        sendKey,
        recvKey,
        nSend: 0,
        nRecv: 0,
      });
    }

    return {
      session: new NoiseSession({ chainKey: ck, sendKey: Buffer.alloc(32), recvKey: Buffer.alloc(32), nSend: 0, nRecv: 0 }),
      firstMessage,
      finalize,
    };
  }

  encrypt(plaintext: Buffer): Buffer {
    const ct = gcmEncrypt(this.state.sendKey, this.state.nSend, Buffer.alloc(0), plaintext);
    this.state.nSend++;
    return ct;
  }

  decrypt(ciphertext: Buffer): Buffer {
    const pt = gcmDecrypt(this.state.recvKey, this.state.nRecv, Buffer.alloc(0), ciphertext);
    this.state.nRecv++;
    return pt;
  }
}
