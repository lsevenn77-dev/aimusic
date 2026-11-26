const cues = ['jump', 'double', 'star', 'combo', 'collision', 'finish'];

export function gameSounds(signal) {
  let context;
  let rewardAfter = 0;
  const buffers = new Map();
  const playing = new Map();

  async function load(name) {
    const response = await fetch(new URL('./audio/' + name + '.wav', import.meta.url), {signal});
    if (!response.ok) return;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    if (!signal.aborted) buffers.set(name, buffer);
  }

  function stop(channel) {
    const voice = playing.get(channel);
    if (!voice) return;
    playing.delete(channel);
    const end = context.currentTime + 0.008;
    voice.gain.gain.linearRampToValueAtTime(0, end);
    voice.source.stop(end);
  }

  function quiet() {
    for (const channel of playing.keys()) stop(channel);
    rewardAfter = 0;
  }

  function unlock() {
    try {
      if (!context) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        void Promise.allSettled(cues.map(load));
      }
      quiet();
      void context.resume().catch(() => {});
    } catch { /* Audio is optional when the device has no output. */ }
  }

  function play(name) {
    if (context?.state !== 'running' || !buffers.has(name)) return;
    const now = context.currentTime;
    const reward = name === 'star' || name === 'combo';
    if (name === 'star' && now < rewardAfter) return;
    if (reward) rewardAfter = now + (name === 'combo' ? 0.28 : 0.10);
    const ending = name === 'finish' || name === 'collision';
    if (ending) quiet();
    const channel = reward ? 'reward' : ending ? 'result' : 'jump';
    stop(channel);
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.8, now);
    source.buffer = buffers.get(name);
    source.connect(gain).connect(context.destination);
    playing.set(channel, {source, gain});
    source.onended = () => {
      if (playing.get(channel)?.source === source) playing.delete(channel);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  signal.addEventListener('abort', () => {
    quiet();
    if (context) void context.close().catch(() => {});
    buffers.clear();
  }, {once:true});
  return {unlock, play, quiet};
}
