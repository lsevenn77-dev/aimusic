import { aboutIcon } from './about-icons.js';

// Skin the public renderer's authored slots at the same boundary as the official
// wordmark. Both Cafe24 and the Sites fallback keep ownership of copy and links.
// If the renderer introduces a different structure, serve its entire original.
export function aboutPresentation(html) {
  const shell = /<header class="legal-header">(<a class="legal-brand"[^>]*>[\s\S]*?<\/a>)(<a href="[^"]+">[^<]+<\/a>)<\/header><main class="legal-content public-music">(<nav\b[^>]*>[\s\S]*?<\/nav>)<h1>([^<]+)<\/h1>(<p class="public-lead">[^<]+<\/p>)([\s\S]*?)<\/main>/;
  const match = html.match(shell);
  if (!match) return html;
  const [, brand, appLink, guideNav, title, lead, content] = match;
  const blocks = [...content.matchAll(/<h2>([^<]+)<\/h2>([\s\S]*?)(?=<h2>|$)/g)];
  if (blocks.length !== 4 || blocks.map(x => x[0]).join('') !== content) return html;
  const [types, visit, rights, operation] = blocks;
  const descriptions = types[2].match(/^<p>([^<]+?) (커버곡은 [^<]+)<\/p>$/);
  const steps = [...visit[2].matchAll(/<li>([\s\S]*?)<\/li>/g)];
  if (!descriptions || steps.length !== 4 || '<ol>' + steps.map(x => x[0]).join('') + '</ol>' !== visit[2]) return html;
  const nav = guideNav.replace('<a href="/about">', '<a href="/about" aria-current="page">');
  const stepNames = ['곡 찾기', '음악 듣기', '녹음 참여', '공개와 저장'];
  const stepIcons = ['search', 'headphones', 'mic', 'list-music'];
  const typeCard = (name, icon, copy) => `<article class="about-card about-type"><h3><span class="about-icon-tile">${aboutIcon(icon)}</span>${name}</h3><p>${copy}</p></article>`;
  const stepCards = steps.map(([, copy], i) => `<li class="about-card"><div class="about-step-mark" aria-hidden="true"><span>0${i+1}</span>${aboutIcon(stepIcons[i])}</div><h3>${stepNames[i]}</h3><p>${copy}</p></li>`).join('');
  const cta = appLink.replace('<a ', '<a class="primary-button" ').replace('</a>', aboutIcon('arrow-right') + '</a>');
  const layout = `<header class="about-header"><div class="about-wrap about-header-row">${brand}<div class="about-desktop-nav">${nav}</div><details class="about-menu"><summary>${aboutIcon('menu')}메뉴</summary>${nav}</details></div></header>
  <main class="about-wrap about-main"><div class="about-intro"><div><p class="about-label">AIFECT 소개</p><h1>${title.replace(/AIFECT$/, '<span>AIFECT</span>')}</h1>${lead}</div>${cta}</div>
  <section><h2>${types[1]}</h2><div class="about-types">${typeCard('제작곡', 'disc-3', descriptions[1])}${typeCard('커버곡', 'mic-vocal', descriptions[2])}</div></section>
  <section><h2>${visit[1]}</h2><ol class="about-steps" role="list">${stepCards}</ol></section>
  <section class="about-info"><div class="about-info-icon">${aboutIcon('shield-check')}</div><div><h2>${rights[1]}</h2>${rights[2]}</div></section>
  <section class="about-operation"><h2>${operation[1]}</h2>${operation[2]}</section></main>`;
  return html.replace(shell, () => layout).replace('<body class="legal-site">', '<body class="legal-site about-page">')
    .replace('</head>', '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&amp;family=Noto+Sans+KR:wght@400;500;600;700;800;900&amp;display=swap"><link rel="stylesheet" href="/ui-region-scale.css"><link rel="stylesheet" href="/about.css"></head>');
}
