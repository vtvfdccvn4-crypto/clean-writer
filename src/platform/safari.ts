/**
 * Whether the browser is Safari (its WebKit engine, on macOS or iOS). Other browsers that use WebKit on iOS
 * (for example Chrome and Firefox there, which report CriOS and FxiOS) and every Chromium-based or
 * Gecko-based browser are not Safari. Playwright's WebKit reports Safari's user agent, so it counts too.
 */
export function isSafariUserAgent(userAgent: string): boolean {
  return /AppleWebKit\//.test(userAgent)
    && /\bSafari\//.test(userAgent)
    && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|EdgiOS\/|OPR\/|FxiOS\/|Firefox\//.test(userAgent);
}

export function isSafari(): boolean {
  return typeof navigator !== 'undefined' && isSafariUserAgent(navigator.userAgent);
}
