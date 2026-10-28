// Original inline SVG art for the HUD (no external assets).

export const PORTRAIT = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="Kairo portrait">
  <defs>
    <radialGradient id="pbg" cx="50%" cy="40%" r="70%">
      <stop offset="0" stop-color="#2a3a6a"/><stop offset="1" stop-color="#0a0d1c"/>
    </radialGradient>
    <linearGradient id="pskin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6dccb"/><stop offset="1" stop-color="#dcb59f"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#pbg)"/>
  <circle cx="50" cy="46" r="40" fill="none" stroke="#ff2a48" stroke-width="2" stroke-dasharray="200 30" opacity=".7"/>
  <!-- collar -->
  <path d="M18 100 L30 74 L50 84 L70 74 L82 100 Z" fill="#1b2444"/>
  <path d="M36 78 L50 92 L64 78 L60 100 L40 100 Z" fill="#a3132a"/>
  <!-- face -->
  <path d="M33 40 Q33 70 50 80 Q67 70 67 40 Z" fill="url(#pskin)" stroke="#07080c" stroke-width="2"/>
  <!-- eyes -->
  <path d="M37 55 Q42 50 47 53 L46 57 Q41 58 37 55 Z" fill="#fff" stroke="#07080c" stroke-width="1.5"/>
  <path d="M63 55 Q58 50 53 53 L54 57 Q59 58 63 55 Z" fill="#fff" stroke="#07080c" stroke-width="1.5"/>
  <circle cx="43.5" cy="54.5" r="2.4" fill="#c3122a"/><circle cx="56.5" cy="54.5" r="2.4" fill="#c3122a"/>
  <path d="M36 50 L47 51" stroke="#07080c" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M64 50 L53 51" stroke="#07080c" stroke-width="2.4" stroke-linecap="round"/>
  <!-- crimson cheek marking -->
  <path d="M60 62 L66 59 M61 65 L66 62.5" stroke="#ff2a48" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M47 70 L53 70" stroke="#7a3238" stroke-width="1.5" stroke-linecap="round"/>
  <!-- hair: sharp layered strands -->
  <path fill="#1d2029" stroke="#07080c" stroke-width="1.5" stroke-linejoin="round"
    d="M26 52 L22 30 L30 36 L28 14 L40 28 L46 6 L52 26 L64 8 L64 28 L78 16 L72 36 L82 34 L74 50
       L68 40 L66 52 L60 38 L56 50 L50 36 L44 52 L40 40 L36 54 L33 42 Z"/>
</svg>`;

export const ICONS = {
  combo: `<svg viewBox="0 0 64 64"><path d="M10 54 L46 18" stroke="#dfe8f5" stroke-width="5" stroke-linecap="round"/>
    <path d="M46 18 L56 8" stroke="#eef6ff" stroke-width="3" stroke-linecap="round"/>
    <circle cx="18" cy="46" r="6" fill="none" stroke="#ff2a48" stroke-width="3"/>
    <path d="M8 56 L14 50" stroke="#20222c" stroke-width="6" stroke-linecap="round"/>
    <path d="M22 14 Q44 6 56 24" fill="none" stroke="#5ec8ff" stroke-width="2.5" opacity=".9"/></svg>`,
  crescent: `<svg viewBox="0 0 64 64"><path d="M8 44 Q30 4 58 26 Q34 14 8 44 Z" fill="#5ec8ff"/>
    <path d="M12 42 Q32 12 54 26" fill="none" stroke="#ff2a48" stroke-width="2"/>
    <path d="M20 50 L28 44 M30 54 L36 48 M42 52 L46 46" stroke="#cfefff" stroke-width="2" stroke-linecap="round"/></svg>`,
  cyclone: `<svg viewBox="0 0 64 64"><path d="M32 32 m-3 0 a3 3 0 1 1 6 0 a8 8 0 1 1 -14 -3 a14 14 0 1 1 22 15 a20 20 0 1 1 -30 -24"
    fill="none" stroke="#5ec8ff" stroke-width="4" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="4" fill="#ff2a48"/></svg>`,
  ultimate: `<svg viewBox="0 0 64 64"><path d="M6 46 Q30 0 60 22 Q32 12 6 46 Z" fill="#ff2a48"/>
    <path d="M14 56 L50 8" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
    <path d="M8 30 L56 46 M20 12 L44 58" stroke="#5ec8ff" stroke-width="2" stroke-linecap="round" opacity=".9"/></svg>`,
  gear: `<svg viewBox="0 0 64 64"><path fill="none" stroke="#dff4ff" stroke-width="4.5" stroke-linejoin="round"
    d="M32 5 L37 13 L45 9 L47 18 L56 18 L53 27 L60 32 L53 37 L56 46 L47 46 L45 55 L37 51 L32 59 L27 51 L19 55 L17 46 L8 46 L11 37 L4 32 L11 27 L8 18 L17 18 L19 9 L27 13 Z"/>
    <circle cx="32" cy="32" r="10" fill="#ff2a48"/><circle cx="32" cy="32" r="4" fill="#ffe0e6"/></svg>`,
  dash: `<svg viewBox="0 0 64 64"><path d="M8 22 L40 22 M4 32 L48 32 M10 42 L38 42" stroke="#9ad8ff" stroke-width="4" stroke-linecap="round"/>
    <path d="M44 16 L58 32 L44 48" fill="none" stroke="#eaf8ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

export const LOGO_MARK = `<svg viewBox="0 0 100 100" class="logo-mark"><circle cx="50" cy="50" r="44" fill="none" stroke="#ff2a48" stroke-width="5" stroke-dasharray="230 46"/>
  <path d="M14 58 Q50 20 88 40 Q50 34 14 58 Z" fill="#5ec8ff"/><path d="M20 70 Q52 40 84 54" fill="none" stroke="#ff2a48" stroke-width="3"/></svg>`;
