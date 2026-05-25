import { Transform, TransformCallback } from 'stream';
import { NoiseSession } from './noise-session';

const MAX_FRAME_SIZE = 65535;

export function encryptFrames(session: NoiseSession): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding: string, callback: TransformCallback) {
      try {
        let offset = 0;
        const parts: Buffer[] = [];

        while (offset < chunk.length) {
          const slice = chunk.slice(offset, offset + MAX_FRAME_SIZE);
          const ciphertext = session.encrypt(slice);

          const header = Buffer.alloc(4);
          header.writeUInt32BE(ciphertext.length, 0);
          parts.push(header, ciphertext);
          offset += slice.length;
        }

        callback(null, Buffer.concat(parts));
      } catch (err) {
        callback(err as Error);
      }
    },
  });
}

export function decryptFrames(session: NoiseSession): Transform {
  let buf = Buffer.alloc(0);

  return new Transform({
    transform(chunk: Buffer, _encoding: string, callback: TransformCallback) {
      try {
        buf = Buffer.concat([buf, chunk]);
        const plainParts: Buffer[] = [];

        while (buf.length >= 4) {
          const len = buf.readUInt32BE(0);

          if (len > MAX_FRAME_SIZE + 32) {
            callback(new Error(`E2EE frame size ${len} exceeds maximum`));
            return;
          }

          if (buf.length < 4 + len) {
            break;
          }

          const ciphertext = buf.slice(4, 4 + len);
          plainParts.push(session.decrypt(ciphertext));
          buf = buf.slice(4 + len);
        }

        callback(null, plainParts.length > 0 ? Buffer.concat(plainParts) : undefined);
      } catch (err) {
        callback(err as Error);
      }
    },
  });
}
