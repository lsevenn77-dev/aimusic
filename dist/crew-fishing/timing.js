// Four timestamps keep database work out of the browser/server clock estimate.
export function clockSample(before,after,result){
  const {serverTime,receivedTime}=result;
  if(!Number.isFinite(serverTime))return null;
  const received=Number.isFinite(receivedTime)?receivedTime:serverTime;
  return {offset:(received+serverTime-before-after)/2,
    delay:Math.max(0,after-before-Math.max(0,serverTime-received))};
}

// The server still calculates the hit. Only a recent, bounded input time is accepted.
export function inputElapsed(cast,elapsed,receivedTime){
  const current=receivedTime-cast.start;
  if(elapsed===undefined)return current; // Existing open pages remain compatible.
  if(!Number.isFinite(elapsed)||elapsed<0||elapsed>current+250||elapsed<current-2000)
    throw new RangeError('연결이 지연되어 이번 입력을 판정하지 않았어요. 막대에 맞춰 다시 눌러주세요.');
  return elapsed;
}
