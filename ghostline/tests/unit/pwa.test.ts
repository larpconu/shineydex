import { describe, it, expect } from 'vitest';
import { versionAtLeast } from '../../src/lib/pwa';

describe('iOS version checks', () => {
  it('compares major.minor properly', () => {
    expect(versionAtLeast('16.4', '16.4')).toBe(true);
    expect(versionAtLeast('16.3', '16.4')).toBe(false);
    expect(versionAtLeast('18.5', '16.4')).toBe(true);
    expect(versionAtLeast('17.0', '16.4')).toBe(true);
    expect(versionAtLeast('15.7', '16.4')).toBe(false);
  });
});
