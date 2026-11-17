const directory = '/assets/brand/20261117';
export const wordmark = directory + '/aifect-wordmark-horizontal.webp';
export const squareMark = directory + '/aifect-icon-512.png';
const shareCard = directory + '/aifect-share.webp';
const icon = size => directory + '/aifect-icon-' + size + '.png';
const wordmarkTag = '<img class="aifect-wordmark-logo" src="' + wordmark + '" width="1044" height="227" alt="AIFECT">';

export const brandLinks = [
  '<link rel="icon" type="image/png" sizes="32x32" href="' + icon(32) + '">',
  '<link rel="icon" type="image/png" sizes="48x48" href="' + icon(48) + '">',
  '<link rel="apple-touch-icon" sizes="180x180" href="' + icon(180) + '">',
  '<link rel="manifest" href="' + directory + '/site.webmanifest">'
].join('\n');

// The public HTML renderer runs on a separate origin. Resolve its authored
// brand slots here so its pages and the local shell use the same asset release.
export function brandPublicMarkup(html) {
  return html
    .replace(/(<img\b[^<>]*?\bsrc=")\/assets\/aifect-wordmark\.svg(?:\?[^"]*)?"([^<>]*>)/g,
      (_, start, end) => (start + wordmark + '"' + end).replace(/width="\d+" height="\d+"/, 'width="1044" height="227"'))
    .replaceAll('<a class="legal-brand" href="/">AIFECT</a>',
      '<a class="legal-brand" href="/" aria-label="AIFECT 홈">' + wordmarkTag + '</a>')
    .replaceAll('src="/assets/aifect-mark.svg"', 'src="' + squareMark + '"')
    .replaceAll('content="https://aifect.co.kr/assets/aifect-logo.png"', 'content="https://aifect.co.kr' + shareCard + '"')
    .replaceAll('"image":"https://aifect.co.kr/assets/aifect-logo.png"', '"image":"https://aifect.co.kr' + shareCard + '"');
}

export function brandPublicDocument(html) {
  const markup = brandPublicMarkup(html);
  return markup.includes('href="' + directory + '/site.webmanifest"')
    ? markup
    : markup.replace('</head>', brandLinks + '</head>');
}

// Old bookmarks and cached documents can still request the retired filenames.
export const brandAliases = new Map([
  ['/favicon.ico', icon(32)],
  ['/apple-touch-icon.png', icon(180)],
  ['/apple-touch-icon-precomposed.png', icon(180)],
  ['/assets/aifect-symbol.svg', directory + '/aifect-symbol-transparent-1024.png'],
  ['/assets/aifect-mark.svg', squareMark],
  ['/assets/aifect-logo.png', shareCard],
  ['/assets/aifect-wordmark.svg', wordmark],
  ['/assets/aifect-home-header-ad0e7527a911.webp', wordmark]
]);
