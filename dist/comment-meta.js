const commentSeoulDate = new Intl.DateTimeFormat('en', {
 timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
});
const commentSeoulTime = new Intl.DateTimeFormat('en', {
 timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function formatCommentTime(created, now = new Date()) {
 const date = commentSeoulDate.format(created);
 if (date === commentSeoulDate.format(now)) return commentSeoulTime.format(created);
 const parts = commentSeoulDate.formatToParts(created);
 const value = type => parts.find(part => part.type === type).value;
 return `${value('year').padStart(4, '0')}. ${value('month')}. ${value('day')}.`;
}

function commentMetaHTML({created, creator, edited}, author, {className = '', extra = ''} = {}) {
 const instant = new Date(typeof created === 'number' ? created * 1000 : NaN);
 const time = Number.isFinite(instant.getTime())
  ? `<time class="comment-age" datetime="${instant.toISOString()}">${formatCommentTime(instant)}</time>` : '';
 return `<div class="comment-meta ${className}">${author}${creator ? '<span class="creator-badge">제작자</span>' : ''}${extra}${time}${edited ? '<span class="comment-edited">· 수정됨</span>' : ''}</div>`;
}

function refreshCommentTimes(root, now = new Date()) {
 for (const label of root.querySelectorAll('time.comment-age[datetime]')) {
  const text = formatCommentTime(new Date(label.dateTime), now);
  if (label.textContent !== text) label.textContent = text;
 }
}

function millisecondsUntilCommentMidnight(now) {
 // Seoul's current civil time is UTC+09:00 year-round.
 const day = 86_400_000, seoulTime = now.getTime() + 9 * 3_600_000;
 return day - ((seoulTime % day + day) % day);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.document === document) {
 let timer;
 const update = () => {
  clearTimeout(timer);
  const now = new Date();
  refreshCommentTimes(document, now);
  timer = setTimeout(update, millisecondsUntilCommentMidnight(now));
 };
 document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
 window.addEventListener('pageshow', update);
 update();
}
