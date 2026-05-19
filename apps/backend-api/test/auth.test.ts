import { describe, it, expect } from '@jest/globals';
import { generateToken, verifyToken } from '../src/auth';

describe('Auth Module', () => {
  const testPayload = { userId: 'test-user-123', email: 'test@example.com' };

  describe('generateToken', () => {
    it('should generate valid access and refresh tokens', () => {
      const tokens = generateToken(testPayload);
      expect(tokens).toHaveProperty('access_token');
      expect(tokens).toHaveProperty('refresh_token');
      expect(tokens).toHaveProperty('expires_in');
      expect(typeof tokens.access_token).toBe('string');
      expect(typeof tokens.refresh_token).toBe('string');
      expect(tokens.expires_in).toBe(3600);
    });

    it('should generate different tokens for different payloads', () => {
      const tokens1 = generateToken({ ...testPayload, userId: 'user1' });
      const tokens2 = generateToken({ ...testPayload, userId: 'user2' });
      expect(tokens1.access_token).not.toBe(tokens2.access_token);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const { access_token } = generateToken(testPayload);
      const payload = verifyToken(access_token);
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(testPayload.userId);
      expect(payload?.email).toBe(testPayload.email);
    });

    it('should return null for invalid token', () => {
      const payload = verifyToken('invalid-token');
      expect(payload).toBeNull();
    });

    it('should return null for empty token', () => {
      const payload = verifyToken('');
      expect(payload).toBeNull();
    });
  });
});
