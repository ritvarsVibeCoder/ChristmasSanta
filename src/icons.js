const stroke = (d, w = 2, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icons = {
  star: (size = 28) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.5l7.1-.6z" fill="#E9B949"/></svg>`,
  close: () => stroke('<path d="M6 6l12 12M18 6L6 18"/>', 2.4, 14),
  plus: () => stroke('<path d="M12 5v14M5 12h14"/>', 2.6, 16),
  check: (size = 16) => stroke('<path d="M5 12l5 5L20 7"/>', 2.6, size),
  gift: (size = 20) =>
    stroke('<path d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-2-4-6-4-6-1.5S9 9 12 9zm0 0c2-4 6-4 6-1.5S15 9 12 9z"/>', 2, size),
  shield: () => stroke('<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  link: (size = 16) =>
    stroke('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 2, size),
  copy: (size = 16) => stroke('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', 2, size),
  share: (size = 16) =>
    stroke('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>', 2, size),
  warn: () => stroke('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  lock: (size = 22) => stroke('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 1.9, size),
  redo: () => stroke('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  refresh: () => stroke('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  hand: () =>
    stroke('<path d="M9 11V5a1.5 1.5 0 0 1 3 0v5"/><path d="M12 10V4a1.5 1.5 0 0 1 3 0v6"/><path d="M15 10V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.5 15.6a1.5 1.5 0 0 1 2.3-1.9L9 16.5V11"/>', 1.8, 20),
  back: () => stroke('<path d="M15 6l-6 6 6 6"/>', 2.2, 22),
  key: () => stroke('<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M17 6l3 3M14 9l2 2"/>'),
};

export const snowflake = (size, opacity = 0.45, cls = '') =>
  `<svg class="flake ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#F4E6C8" stroke-opacity="${opacity}" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2"/></svg>`;

export const garland = () => `
<svg class="garland" viewBox="0 0 390 130" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
  <path d="M0 8 Q 195 58 390 8" fill="none" stroke="#3E6B4F" stroke-width="2"/>
  <line x1="60" y1="22" x2="60" y2="62" stroke="#3E6B4F" stroke-width="1.5"/><circle class="bauble b1" cx="60" cy="74" r="12" fill="#C8283A"/><rect x="55" y="60" width="10" height="5" rx="1" fill="#E9B949"/>
  <line x1="128" y1="32" x2="128" y2="88" stroke="#3E6B4F" stroke-width="1.5"/><circle class="bauble b2" cx="128" cy="98" r="10" fill="#E9B949"/><rect x="124" y="86" width="8" height="4" rx="1" fill="#F6D47E"/>
  <line x1="262" y1="32" x2="262" y2="70" stroke="#3E6B4F" stroke-width="1.5"/><circle class="bauble b3" cx="262" cy="82" r="12" fill="#FFF6E5"/><rect x="257" y="68" width="10" height="5" rx="1" fill="#E9B949"/>
  <line x1="330" y1="22" x2="330" y2="96" stroke="#3E6B4F" stroke-width="1.5"/><circle class="bauble b4" cx="330" cy="106" r="9" fill="#C8283A"/><rect x="326" y="95" width="8" height="4" rx="1" fill="#E9B949"/>
</svg>`;
