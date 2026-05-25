import { resolveRequiredJavaVersion } from '../src/java-installer';

describe('resolveRequiredJavaVersion', () => {
  it('returns 21 for MC 1.21+', () => {
    expect(resolveRequiredJavaVersion('1.21.0')).toBe(21);
    expect(resolveRequiredJavaVersion('1.21.4')).toBe(21);
  });

  it('returns 21 for MC 1.20.5+', () => {
    expect(resolveRequiredJavaVersion('1.20.5')).toBe(21);
    expect(resolveRequiredJavaVersion('1.20.6')).toBe(21);
  });

  it('returns 17 for MC 1.17 to 1.20.4', () => {
    expect(resolveRequiredJavaVersion('1.17.0')).toBe(17);
    expect(resolveRequiredJavaVersion('1.18.2')).toBe(17);
    expect(resolveRequiredJavaVersion('1.19.4')).toBe(17);
    expect(resolveRequiredJavaVersion('1.20.0')).toBe(17);
    expect(resolveRequiredJavaVersion('1.20.4')).toBe(17);
  });

  it('returns 8 for MC < 1.17', () => {
    expect(resolveRequiredJavaVersion('1.16.5')).toBe(8);
    expect(resolveRequiredJavaVersion('1.12.2')).toBe(8);
    expect(resolveRequiredJavaVersion('1.8.9')).toBe(8);
  });

  it('defaults to 17 for unrecognised version strings', () => {
    expect(resolveRequiredJavaVersion('latest')).toBe(17);
    expect(resolveRequiredJavaVersion('')).toBe(17);
  });
});
