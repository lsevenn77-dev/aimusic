import {nicknameContext} from './nickname-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL('../dist/' + name, import.meta.url), 'utf8');

test('common room sound settings keep device and personal volume controls, but no diagnostics UI', () => {
  const context = nicknameContext({
    esc: value => String(value),
    icon: name => '<span>' + name + '</span>',
    number: value => String(value),
    AifectGifts: {GIFT_CATALOG: []},liveRoomTypeFields:()=>'<fieldset>types</fieldset>'
  });
  vm.runInContext(read('voice-room-template.js') + '\nthis.renderRoom = voiceRoomHTML;', context);
  const html = context.renderRoom('smoke-room');

  assert.match(html, /<summary>입력 장치 · 개인 청취 볼륨<\/summary>/);
  for (const id of ['voice-input', 'voice-output', 'voice-music-volume', 'voice-listen-volume']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /연결 진단|통계 내려받기|voice-diagnostics-summary|diagnostics-export/);
  assert.match(html, /장치가 지원하지 않는 효과는 원음으로 연결됩니다/);
});

test('removed diagnostics download action is not available, while internal transport diagnostics remain', () => {
  const controls = read('voice-room-controls.js');
  assert.doesNotMatch(controls, /diagnostics-export|연결 진단/);
  assert.match(controls, /startMicTest\(\)/);
  assert.match(read('voice-room-template.js'), /id="voice-input-meter"/);
  assert.doesNotMatch(read('live-karaoke.js'), /장치 · 고급 설정|연결 진단|diagnostics-export/);
  const diagnostics = read('voice-diagnostics.js');
  assert.doesNotMatch(diagnostics, /voice-diagnostics-summary|aifect-voice-stats\.json|download\(\)/);
  assert.match(diagnostics, /async sample\(\)/);
  assert.match(diagnostics, /summary\(\)/);
});
