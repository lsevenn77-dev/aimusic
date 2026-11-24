import catalog from './chat-sticker-catalog.json' with {type:'json'};

export const stickers = new Map(catalog.map(item => [item.key,item]));
export const token = key => '[aifect:' + key + ']';
export const DM_BODY_LIMIT = 2000;
export const DM_STICKER_LIMIT = 30;
export const stickerWarning = '이모티콘은 한 번에 최대 30개까지 보낼 수 있습니다.';
export const lengthWarning = '메시지는 2,000자까지 입력할 수 있습니다.';

// Only catalog entries are images. Unknown tokens in old messages stay text.
export function parts(body) {
  const result = [];
  let end = 0;
  for (const match of body.matchAll(/\[aifect:(cat_[a-z_]+)\]/g)) {
    if (!stickers.has(match[1])) continue;
    if (match.index > end) result.push({text:body.slice(end,match.index)});
    result.push({key:match[1]});
    end = match.index + match[0].length;
  }
  if (end < body.length) result.push({text:body.slice(end)});
  return result;
}

export function dmBodyStats(body) {
  const count = parts(body).filter(part => part.key).length;
  // The DM endpoint stores str(body, 2000): trim, then count UTF-16 units.
  const length = body.trim().length;
  const warning = count > DM_STICKER_LIMIT ? stickerWarning : length > DM_BODY_LIMIT ? lengthWarning : '';
  return {count,length,warning};
}

// Fit only the incoming portion. Never split a sticker or a Unicode code point,
// and keep the text on both sides of the selection in the validation budget.
export function fitDmInsertion(before, incoming, after) {
  const warning = dmBodyStats(before + incoming + after).warning;
  if (!warning) return {value:incoming,warning};
  let start = 0, end = incoming.length;
  while (start < end) {
    const mid = Math.ceil((start + end) / 2);
    if (dmBodyStats(before + incoming.slice(0,mid) + after).warning) end = mid - 1;
    else start = mid;
  }
  let offset = 0;
  for (const part of parts(incoming)) {
    const next = offset + (part.key ? token(part.key) : part.text).length;
    if (next > end) {
      if (part.key) end = offset;
      break;
    }
    offset = next;
  }
  if (end && /[\uD800-\uDBFF]/.test(incoming[end-1]) && /[\uDC00-\uDFFF]/.test(incoming[end])) end--;
  const value = incoming.slice(0,end);
  return {value:dmBodyStats(before + value + after).warning ? '' : value,warning};
}
