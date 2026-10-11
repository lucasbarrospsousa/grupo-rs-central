// Decorative, local SVGs: labels remain the accessible source of meaning.
const paths={
 document:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
 device:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4M9 6h6"/>',
 alert:'<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
 tool:'<path d="M14 6a5 5 0 0 0-6 6L2 18a2.8 2.8 0 0 0 4 4l6-6a5 5 0 0 0 6-6l-3 3-4-4Z"/>',
 message:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a8.5 8.5 0 0 1 17-1"/><path d="M6 9h7M6 13h5"/>',
 return:'<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/><path d="M12 7v5l3 2"/>',
 chart:'<path d="M3 3v18h18M7 17v-5M12 17V7M17 17v-8"/>',
 car:'<path d="m5 7 2-4h10l2 4 2 3v8H3v-8ZM3 10h18M7 14h.01M17 14h.01M5 18v3M19 18v3"/>',
 plus:'<path d="M12 4v16M4 12h16"/>'
};
export const recordIcon=name=>`<svg class="record-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.document}</svg>`;
