const paths={home:'m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',compass:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM16 8l-3 5-5 3 3-5z',chart:'M4 20V11m8 9V4m8 16v-7',mic:'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm7 8v2a7 7 0 0 1-14 0v-2m7 9v3m-4 0h8',users:'M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m22 0v-2a4 4 0 0 0-3-3.9M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm5-3.9a4 4 0 0 1 0 7.8',library:'M4 4v16M8 4v16m5-15 6-1 3 15-6 1z',gift:'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z',sliders:'M4 3v7m0 4v7m8-18v13m0 4v1m8-18v1m0 4v13M1 10h6m2 6h6m2-12h6',external:'M14 3h7v7m-9 2 9-9M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6',arrow:'m9 6 6 6-6 6',chevron:'m9 5 7 7-7 7',search:'M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4',plus:'M12 5v14M5 12h14',play:'m8 4 12 8-12 8z',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',shuffle:'M3 7h3c5 0 7 10 12 10h3m-3-3 3 3-3 3M3 17h3c1.5 0 2.7-.9 3.9-2.4M14.1 9.4C15.3 7.9 16.5 7 18 7h3m-3-3 3 3-3 3',previous:'M5 4v16M20 4 8 12l12 8z',next:'M19 4v16M4 4l12 8-12 8z',repeat:'m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3',volume:'m11 5-6 4H2v6h3l6 4ZM15 8a7 7 0 0 1 0 8m3-11a11 11 0 0 1 0 14',list:'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',menu:'M3 6h18M3 12h18M3 18h18',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4',upload:'M12 16V3m-5 5 5-5 5 5M3 15v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5'};
paths.message='M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z';
paths.star='m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z';
paths['search-star']='m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z';
paths['clipboard-clock']='M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M15 4h2a2 2 0 0 1 2 2v3M10 2h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM23 17a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM18 14.5V17l1.6 1';
paths['chevron-left']='m15 18-6-6 6-6';
paths['file-text']='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h8';
paths['corner-down-right']='m15 10 5 5-5 5M4 4v7a4 4 0 0 0 4 4h12';
paths['share-2']='M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM8.6 10.5l6.8-4m-6.8 7 6.8 4';
paths.wallet='M20 8V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7m18 5h-5v5h5m-3-2.5h.01';
paths.user='M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z';
paths.lock='M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4zM12 14v4';
paths.bookmark='M6 3h12v18l-6-4-6 4Z';
paths.copy='M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2ZM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2';
paths.settings='M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.8 3h-4l-.4 2.9a8 8 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.1l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.4 2.9h4l.4-2.9a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z';
const icon=(n,size=24)=>{
 if(n.startsWith('ui-'))return aifectControlIcon(n.slice(3),size);
 if(n==='audio-play')return playIcon(size);
 if(n==='player-play'||n==='player-pause')return playerToggleIcon(n==='player-play',size);
 const menu=n==='menu'||n==='more';
 return `<svg viewBox="0 0 24 24"${menu?' class="menu-icon" width="20" height="20"':''} fill="none" stroke="currentColor" stroke-width="${menu?'1.8':'1.6'}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[n]||paths.sparkles}"/></svg>`;
};

paths.diamond='m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18';
paths.ticket='M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Zm13 0v3m0 3v2m0 3v3';
paths.back='m15 6-6 6 6 6';
// Compatibility alias: all existing overflow-menu callers share the hamburger glyph.
paths.more=paths.menu;
paths.image='M4 3h16v18H4zM4 16l5-6 4 4 3-3 4 5M15 7h.01';
paths.dmPin='M14.3 3.3a2 2 0 0 1 2.8 0l3.6 3.6a2 2 0 0 1-2.8 2.8l-.7-.7-3.7 4.9a4.4 4.4 0 0 1-.7 5.3l-8-8a4.4 4.4 0 0 1 5.3-.7L15 6.8l-.7-.7a2 2 0 0 1 0-2.8ZM8.8 15.2 3 21';
paths.bellOff='m3 3 18 18M7 7c-1 3 0 7-3 10h13M10 4a6 6 0 0 1 8 5v3M10 21h4';
paths.scissors='M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM8.1 8.1 21 21M8.1 15.9 21 3';
paths.trash='M4 7h16M9 3h6l1 4M6 7l1 14h10l1-14M10 11v6m4-6v6';
paths.info='M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6m0-10v.01';
paths.waveform='M2 10v4m4-8v12m4-16v20m4-15v10m4-13v16m4-10v4';

paths.restart='M3 10a9 9 0 1 1 2.6 8.3M3 4v6h6';
paths.grid='M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z';
paths.edit='M16 3l5 5M4 20l4-1L21 6a2.8 2.8 0 0 0-4-4L4 15l-1 6Z';

paths.pause='M6 4h4v16H6zM14 4h4v16h-4z';

// Rounded outline family from the shared design reference (24px canvas, 1.6px stroke).
paths.home='m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9';
paths.user='M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2Z';
paths.mic='M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0Zm-3 5v1a6 6 0 0 0 12 0v-1m-6 7v5m-4 0h8';
/*! mic-handheld adapts Lucide's mic-vocal geometry (ISC).
 * Copyright (c) 2026 Lucide Icons and Contributors
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
paths['mic-handheld']='m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5M21 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z';
paths.bell='M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4';
paths.search='M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6';
paths.share='M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 10.5l6.8-4m-6.8 7 6.8 4';
paths.download='M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4';
paths.music='M9 18V5l12-2v13M9 9l12-2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z';
paths.filter='M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10M7 3v6m6 0v6m-6 0v6';
paths.headphones='M4 14v-3a8 8 0 0 1 16 0v3M4 13h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm16 0h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z';
paths.logout='M9 4H4v16h5m6-12 4 4-4 4m-6-4h12';
paths.check='m5 12 4 4L19 6';
// PLAY categories extend the existing 24px outline family without another icon library.
paths.folder='M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z';
paths['trending-up']='m3 17 6-6 4 4 8-9m-6 0h6v6';
paths['file-pen-line']='M12 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l5 5v4m-6-9v6h6M8 12h4m-4 4h2m4 5 1-4 6-6 2 2-6 6-3 2Z';
paths['list-pen']='M4 5h12M4 10h8M4 15h4m5 5 3-1 6-6-2-2-6 6-1 3Zm5-7 2 2';

// Audio controls use the unchanged external artwork. The SVG viewport retains
// existing svg sizing selectors and isolates the asset's gradient IDs.
function playIcon(size=24){return `<svg class="audio-play-icon" viewBox="0 0 36 36" width="${size}" height="${size}" aria-hidden="true" focusable="false"><image href="/assets/card-play.svg?v=b5cb3d802391" width="36" height="36" preserveAspectRatio="xMidYMid meet"/></svg>`;}

paths.quote='M4 6h6v7l-4 5M14 6h6v7l-4 5';
paths['list-plus']='M3 5h15M3 11h15M3 17h8M18 14v8M14 18h8';

paths['player-quote']='M4 5h6v7l-4 6H3l3-6H4zM14 5h6v7l-4 6h-3l3-6h-2z';
paths['player-comment']='M3 4h18v13H9l-6 4V4ZM8 10h.01M12 10h.01M16 10h.01';

// Locked music controls, isolated from navigation and the mini-player.
// The supplied raster is the visual reference; these paths are shared by every
// music renderer so wrappers never change the glyph's angle or proportions.
const aifectControlPaths=Object.freeze({
 play:'m8 4 12 8-12 8z',
 minus:'M5 12h14', plus:'M12 5v14M5 12h14',
 menu:'M5 6h14M5 12h14M5 18h14',
 heart:paths.heart,
 comment:'M5 2h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-9l-7 3 2-7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z',
 chevron:'m6 9 6 6 6-6', up:'M12 20V4m-6 6 6-6 6 6', down:'M12 4v16m-6-6 6 6 6-6'
});
function aifectControlIcon(name,size=24){
 const action=name.endsWith('-action'),key=name.replace(/-action$/,'');
 const glyph=key==='plays'?'play':key==='pause'?'pause':key;
 // Preserve the locked paths; compensate their actual ink bounds, not just CSS boxes.
 const viewBox=!action&&(key==='heart'||key==='comment')?'-4 -4 32 32':'0 0 24 24';
 return `<svg class="aifect-control-icon ${action?'outline-gradient-action':'metric-inline-icon'} aifect-icon-${key}" viewBox="${viewBox}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path vector-effect="non-scaling-stroke" d="${aifectControlPaths[glyph]||paths[glyph]||paths.sparkles}"/></svg>`;
}

// Only the bottom player's two states share this artwork. Preserve the original
// card-play gradient, circle and triangle without altering other audio controls.
function playerToggleIcon(paused,size=40){
 const glyph=paused?'<path d="M14 11.9Q14 10.7 15.05 11.35L24.4 17.1Q25.85 18 24.4 18.9L15.05 24.65Q14 25.3 14 24.1Z" fill="url(#player-toggle-pastel)"/>':'<path d="M14 12v12M22 12v12" fill="none" stroke="url(#player-toggle-pastel)" stroke-width="2.5" stroke-linecap="round"/>';
 return '<svg class="player-toggle-icon" viewBox="0 0 36 36" width="'+size+'" height="'+size+'" aria-hidden="true" focusable="false"><defs><linearGradient id="player-toggle-pastel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7dd8f3"/><stop offset=".52" stop-color="#b9b3f0"/><stop offset="1" stop-color="#f1b3ee"/></linearGradient></defs><circle cx="18" cy="18" r="17.375" fill="#000" stroke="url(#player-toggle-pastel)" stroke-width="1.25"/>'+glyph+'</svg>';
}
paths['volume-off']='m11 5-6 4H2v6h3l6 4ZM16 9l6 6M22 9l-6 6';
