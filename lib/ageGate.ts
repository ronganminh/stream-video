// Age-gate state lives only in the browser so public pages can be cached and
// served identically to everyone.
//
// The gate markup ships in every page and is visible by default, so content
// never shows before the visitor has confirmed. A tiny blocking script in
// <head> marks <html> before first paint when the cookie is present, and CSS
// hides the gate for marked pages: returning visitors never see it flash.
// Without JavaScript the confirm form posts to middleware, which sets the
// cookie and redirects back with #gv-age-ok so CSS :target hides the gate.

export const AGE_GATE_COOKIE_NAME = "gv_age_ack";
export const AGE_GATE_CONFIRMED_ATTRIBUTE = "data-gv-age-ok";
export const AGE_GATE_CONFIRMED_HASH = "gv-age-ok";

const COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${AGE_GATE_COOKIE_NAME}=1(?:;|$)`);

export function hasAgeGateCookie(cookieHeader: string): boolean {
  return COOKIE_PATTERN.test(cookieHeader);
}

// Inlined into <head>; must stay dependency-free and must never throw.
export const ageGateBootScript = `(function(){try{if(${COOKIE_PATTERN}.test(document.cookie)||location.hash==="#${AGE_GATE_CONFIRMED_HASH}"){document.documentElement.setAttribute("${AGE_GATE_CONFIRMED_ATTRIBUTE}","")}}catch(e){}})();`;
