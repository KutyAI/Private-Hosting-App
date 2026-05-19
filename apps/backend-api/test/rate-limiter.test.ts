import { describe, it, expect } from '@jest/globals';
import { rateLimiter } from '../src/rate-limiter';

describe('Rate Limiter', () => {
  it('should allow requests under the limit', () => {
    const req = { ip: '127.0.0.1', path: '/health', connection: { remoteAddress: '127.0.0.1' } } as any;
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    rateLimiter(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should set rate limit headers', () => {
    const req = { ip: '127.0.0.2', path: '/health', connection: { remoteAddress: '127.0.0.2' } } as any;
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const next = jest.fn();

    rateLimiter(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
  });
});
