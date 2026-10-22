import { describe, it, expect } from 'vitest';
import { codeFromPath, CODE_CHARS } from '../../src/lib/deeplink';

describe('deep links', () => {
  it('reads /j/CODE', () => {
    expect(codeFromPath('/j/K7Q2FX')).toBe('K7Q2FX');
    expect(codeFromPath('/j/k7q2fx/')).toBe('K7Q2FX');
  });
  it('drops confusable characters', () => {
    expect(codeFromPath('/j/O0I1AB')).toBe('AB');
  });
  it('ignores other paths', () => {
    expect(codeFromPath('/')).toBeNull();
    expect(codeFromPath('/join/K7Q2FX')).toBeNull();
  });
  it('alphabet has no confusable characters', () => {
    for (const c of 'O0I1L') expect(CODE_CHARS).not.toContain(c);
    expect(CODE_CHARS).toHaveLength(31);
  });
});
