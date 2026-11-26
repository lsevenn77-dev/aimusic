// Keep the live race's controls and data nodes mounted when arranging the phone lobby.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function headingIcon(heading, name) {
  if (!heading) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'race-heading-icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '/crew-fishing/art/lobby-icons.svg#' + name);
  svg.append(use); heading.prepend(svg);
}

export function decorateRankings(board) {
  const headings = board.querySelectorAll('.cgl-title h2');
  headingIcon(headings[0], 'crown');
  headingIcon(headings[1], 'person');
}

function placeCourse(records, hero) {
  const map = hero.querySelector('.mapbox');
  const name = hero.querySelector('#courseName');
  const week = hero.querySelector('#weekTxt');
  const description = hero.querySelector('#courseDesc')?.parentElement;
  if (!map || !name || !week || !description) return;
  const details = element('details', 'race-course');
  const summary = element('summary', '', '이번 주 코스');
  details.append(summary, week, name, description, map);
  records.append(details);
  details.addEventListener('toggle', () => {
    if (details.open) window.dispatchEvent(new Event('resize'));
  });
}

function arrangeHero(root, hero, records) {
  const title = hero.querySelector('h2');
  const eyebrow = hero.querySelector('.cgl-eyebrow');
  const description = hero.querySelector(':scope > p.muted');
  const start = hero.querySelector('#practiceBtn');
  const quota = hero.querySelector('#raceQuota');
  if (!title || !description || !eyebrow || !start || !quota) return false;
  placeCourse(records, hero);
  const banner = element('div', 'race-banner');
  const heading = element('h1', '', title.textContent);
  title.remove();
  banner.append(eyebrow, heading, description);
  const actions = element('div', 'race-actions');
  actions.append(start, quota);
  hero.prepend(banner, actions);

  return true;
}

export function mountRacingLobby(startPractice) {
  const root = document.querySelector('#lobbyView.racing-lobby');
  if (!root || root.classList.contains('phone-race')) return;
  const hero = root.querySelector('.cgl-hero');
  const records = root.querySelector('.cgl-records');
  if (!hero || !records || !arrangeHero(root, hero, records)) return;
  headingIcon(records.querySelector('h2'), 'chart');
  headingIcon(root.querySelector('.cgl-help h2'), 'game');
  headingIcon(root.querySelector('.cgl-scoring h2'), 'calendar');
  const ghost = records.querySelector('dl dt');
  if (ghost) ghost.textContent = '내 고스트';
  const practiceValue = records.querySelector('dl > div:last-child dd');
  if (practiceValue) {
    const practice = element('button', 'race-practice', '연습하기 ›');
    practice.type = 'button';
    practice.setAttribute('aria-label', '연습 주행 시작 · 횟수 무제한');
    practice.addEventListener('click', startPractice);
    practiceValue.replaceChildren(practice);
  }

  const instructions = [
    ['A  D', '좌우 버튼으로 이동'],
    ['SPACE', '게이지 절반으로 1.6초 가속'],
    ['⤴', '코너 끝에서 방향을 떼면 부스터 충전'],
    ['✷', '벽에 닿으면 속도가 크게 줄어듭니다'],
  ];
  root.querySelectorAll('.howto > div').forEach((tile, i) => {
    const label = tile.querySelector('b');
    if (!label || !instructions[i]) return;
    const [symbol, tip] = instructions[i];
    const icon = element('span', 'race-control-icon', symbol);
    icon.setAttribute('aria-hidden', 'true');
    tile.replaceChildren(icon, label, element('span', '', tip));
  });

  const sheet = element('link');
  sheet.rel = 'stylesheet';
  sheet.href = '/crew-racing/kart-lobby.css';
  if(!document.getElementById('kart-lobby-style'))document.head.append(sheet);
  root.classList.add('phone-race');
}

