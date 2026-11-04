/**
 * The embedded build's WebGPU compositor drops pixels past its first 1024px
 * chunk in Safari. Its WebGL2 path renders the complete canvas. Chromium's
 * user agent also contains AppleWebKit, so exclude those engines explicitly.
 */
export function needsPhotoCraftWebGl(userAgent: string): boolean {
  return /AppleWebKit\//.test(userAgent)
    && !/(?:Chrome|Chromium|Edg|OPR|SamsungBrowser)\//.test(userAgent)
    && /(?:Safari|CriOS|FxiOS)\//.test(userAgent);
}
