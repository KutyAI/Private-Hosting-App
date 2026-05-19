import { describe, it, expect } from '@jest/globals';

describe('Shared Types Module', () => {
  it('should load the module without errors', () => {
    expect(() => require('../src/index')).not.toThrow();
  });

  it('should have valid TypeScript source', () => {
    const fs = require('fs');
    const path = require('path');
    const srcPath = path.join(__dirname, '..', 'src', 'index.ts');
    expect(fs.existsSync(srcPath)).toBe(true);
    const content = fs.readFileSync(srcPath, 'utf-8');
    expect(content).toContain('export interface');
    expect(content).toContain('export type');
  });
});
