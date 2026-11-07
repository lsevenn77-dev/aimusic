// View feedback reads the deterministic race state. No extra tick or input is sent to the simulation.
export function drivingHud(rules, segmentAt, playerOffset) {
  const stage = document.querySelector('#race');
  const warning = document.createElement('div');
  warning.className = 'race-corner';
  warning.hidden = true;
  const charge = document.createElement('output');
  charge.className = 'race-charge';
  charge.setAttribute('aria-live', 'off');
  charge.hidden = true;
  stage.querySelector('.hud').append(warning, charge);
  let port = null, previousRun = null, lastHits = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener('message', event => {
    if (event.data !== 'aifect:racing-haptics' || !event.ports[0]) return;
    if (event.source !== null && (event.source !== window || event.origin !== location.origin)) return;
    port?.close();
    port = event.ports[0];
  });
  return function update(run, paused) {
    if (run !== previousRun) { previousRun = run; lastHits = 0; }
    const active = !paused && !run.ended && run.countdown <= 0;
    if (active && run.walls > lastHits && !document.hidden) {
      if (port) port.postMessage('wall');
      else navigator.vibrate?.(32);
    }
    lastHits = run.walls;
    stage.classList.toggle('boosting', active && run.boostT > 0 && !reduced.matches);
    stage.classList.toggle('wall-hit', active && run.shake > .12);
    const drifting = active && run.drift;
    charge.hidden = !drifting;
    if (drifting) {
      const value = '드리프트 충전 +' + Math.floor(Math.min(rules.driftMaxGain, run.charge, 100 - run.gauge));
      if (charge.textContent !== value) charge.textContent = value;
    }
    const position = run.z + playerOffset;
    const ahead = segmentAt(position + run.speed * .9).curve;
    const warn = active && run.speed > rules.maxSpeed * .48 && Math.abs(ahead) >= 4.7 && Math.abs(segmentAt(position).curve) < 4.7;
    warning.hidden = !warn;
    if (warn) {
      const label = ahead > 0 ? '급커브  ››' : '‹‹  급커브';
      if (warning.textContent !== label) warning.textContent = label;
    }
  };
}

