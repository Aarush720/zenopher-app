import { describe, expect, it } from 'vitest';
import { needsPhotoCraftWebGl } from '../src/components/editor/photocraftRuntime';

describe('PhotoCraft graphics compatibility', () => {
  it.each([
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  ])('uses the complete-canvas WebGL path on WebKit: %s', (userAgent) => {
    expect(needsPhotoCraftWebGl(userAgent)).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    'Mozilla/5.0 AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
    'Mozilla/5.0 AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36 OPR/120.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0',
  ])('keeps the default graphics selection on other engines: %s', (userAgent) => {
    expect(needsPhotoCraftWebGl(userAgent)).toBe(false);
  });
});
