import {position, progressAfter} from './rules.js';
import {createRequestId} from './request-id.js';

// Practice catches live for the lifetime of this page and never enter official rankings.
export function practiceSession(info, draw, now = Date.now) {
  let current, score = 0;
  const records = new Map();
  const snapshot = () => ({cast:{...current}});

  return {
    scope: info.scope,
    lobby() {
      return {...info, open:true, remaining:1, mine:score, discovered:records.size,
        cast:current?.status === 'active' ? {...current} : null};
    },
    async request(action, body) {
      if (action === 'book') return {name:'내 연습 기록', records:Array.from(records.values())};
      if (action === 'cast') {
        if (current?.status !== 'active') {
          const fish = await draw();
          current = {...fish, id:createRequestId(), start:now(), status:'active', progress:0, warnings:0, seq:0, lastPass:-1};
        }
        return snapshot();
      }
      if (action !== 'pull' || !current || current.id !== body.id) throw Error('연습 낚시를 다시 시작해주세요.');
      const elapsed = body.elapsed ?? now() - current.start;
      const pass = Math.floor(2 * elapsed / current.cycle);
      if (current.status !== 'active' || body.seq !== current.seq + 1 || pass <= current.lastPass) return snapshot();
      const spot = position(elapsed, current.cycle);
      Object.assign(current, progressAfter(current, spot >= current.target && spot <= current.target + current.width), {lastPass:pass, seq:body.seq});
      current.value = current.status === 'caught' ? current.amount : 0;
      if (current.status === 'caught') {
        score += current.value;
        const previous = records.get(current.fish);
        current.notice = !previous ? 'new' : current.length > previous.length ? 'best' : '';
        const largest = current.notice ? {fish:current.fish, length:current.length, grade:current.grade, nickname:info.nickname, end_ms:now()} : previous;
        records.set(current.fish, {...largest, count:(previous?.count || 0) + 1});
      }
      return snapshot();
    }
  };
}
