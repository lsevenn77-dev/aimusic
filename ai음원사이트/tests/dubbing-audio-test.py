"""Local FFmpeg integration: synthetic signals only, no Pika request or real user audio."""
import importlib.util
import json
import math
import os
import pathlib
import shutil
import struct
import subprocess
import tempfile
import unittest
import wave

spec = importlib.util.spec_from_file_location('dubbing', pathlib.Path(__file__).parents[1] / 'transcoder/dubbing.py')
dubbing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dubbing)

def sine(path, seconds=4):
    with wave.open(str(path), 'wb') as out:
        out.setparams((2, 2, 48000, 0, 'NONE', 'not compressed'))
        for i in range(round(seconds * 48000)):
            sample = round(9000 * math.sin(2 * math.pi * 440 * i / 48000))
            out.writeframesraw(struct.pack('<hh', sample, sample))

def rms(path, start, end):
    with wave.open(str(path), 'rb') as audio:
        audio.setpos(round(start * 48000))
        data = audio.readframes(round((end - start) * 48000))
    samples = struct.unpack('<' + 'h' * (len(data) // 2), data)
    return math.sqrt(sum(x*x for x in samples) / len(samples))

class DubbingAudio(unittest.TestCase):
    def test_short_music_accents_leave_speech_clear_and_keep_event_effects(self):
        repo = pathlib.Path(__file__).parents[1]
        source = """
import {sampleScript} from './tests/dubbing-fixtures.mjs';
import {dubbingSoundTimeline} from './shared/dubbing.js';
const s=sampleScript(),cue=s.soundCues[0];
s.soundCues=[{...cue,id:'door',kind:'sfx',lineId:s.lines[1].id,anchor:'start',durationSeconds:2,generationSeconds:2,volume:.3,fadeInSeconds:.05,fadeOutSeconds:.1},
 {...cue,id:'intro',kind:'bgm',musicUse:'intro',anchor:'scene',endLineId:s.lines[1].id,durationSeconds:20,generationSeconds:20,volume:.4,fadeInSeconds:.3,fadeOutSeconds:.8}];
console.log(JSON.stringify(dubbingSoundTimeline(s)));
"""
        timeline = json.loads(subprocess.check_output([os.environ.get('NODE_BIN', 'node'), '--input-type=module', '-e', source], cwd=repo))
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            tone = root / 'provider-fixture.wav'
            music_source = root / 'music.wav'
            sine(tone, 2)
            sine(music_source, 10)
            assets = [{'cueId': 'door', 'url': 'sfx'}, {'cueId': 'intro', 'url': 'bgm'}]
            download = lambda url, dest: shutil.copyfile(music_source if url == 'bgm' else tone, dest)
            current, old = root / 'current', root / 'old'
            current.mkdir(); old.mkdir()
            _, meta = dubbing.render_background(timeline, assets, current, download=download)
            legacy = json.loads(json.dumps(timeline))
            next(c for c in legacy['sounds'] if c['kind'] == 'bgm')['volume'] = .4
            dubbing.render_background(legacy, assets, old, download=download)
            audio, old_audio = current / 'verify.wav', old / 'verify.wav'
            self.assertEqual(meta['duration'], timeline['duration'])
            ratio = rms(audio, .6, 1.2) / rms(old_audio, .6, 1.2)
            self.assertTrue(.22 < ratio < .28, ratio)
            self.assertLess(rms(audio, 2.5, 3.5), rms(audio, .6, 1.2) * .65)
            self.assertLess(rms(audio, 6, 12), 1, 'ordinary dialogue has no continuous music')
            effect_start = next(c['start'] for c in timeline['sounds'] if c['kind'] == 'sfx')
            self.assertGreater(rms(audio, effect_start + .3, effect_start + .8), rms(audio, .6, 1.2) * 2)
            self.assertLess(rms(audio, 25, 28), 1)

    def test_music_continues_past_thirty_seconds_and_stops_at_the_selected_line(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            source = root / 'long-score.wav'
            sine(source, 42)
            timeline = {'duration': 48, 'lines': [{'start': 32, 'end': 36}], 'sounds': [{
                'id': 'score', 'kind': 'bgm', 'generationSeconds': 42, 'durationSeconds': 42,
                'start': 1, 'volume': .4, 'fadeInSeconds': .5, 'fadeOutSeconds': 1}]}
            _, meta = dubbing.render_background(timeline, [{'cueId': 'score', 'url': 'local-test'}], root,
                                                download=lambda url, dest: shutil.copyfile(source, dest))
            decoded = root / 'verify.wav'
            self.assertEqual(meta['duration'], 48)
            self.assertGreater(rms(decoded, 38, 39), 100)
            self.assertGreater(rms(decoded, 33, 34), rms(decoded, 38, 39) * .45)
            self.assertLess(rms(decoded, 33, 34), rms(decoded, 38, 39) * .65)
            self.assertLess(rms(decoded, 44, 45), 1)

    def test_final_voices_are_placed_on_the_shared_clock(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            background, _ = dubbing.render_background({'duration': 6, 'lines': [], 'sounds': []}, [], folder)
            voices = {}
            for name, amplitude in [('one', 1000), ('two', 10000)]:
                target = root / (name + '.wav')
                with wave.open(str(target), 'wb') as out:
                    out.setparams((1, 2, 48000, 0, 'NONE', 'not compressed'))
                    out.writeframes(b''.join(struct.pack('<h', round(amplitude * math.sin(2*math.pi*220*i/48000))) for i in range(48000)))
                voices[name] = target
            manifest = {'duration': 6, 'lines': [{'id': 'one', 'start': 1, 'end': 2.2}, {'id': 'two', 'start': 3.5, 'end': 4.7}]}
            output, meta = dubbing.render_final(manifest, background, voices, folder)
            decoded = root / 'final-verify.wav'
            self.assertEqual(meta['duration'], 6)
            self.assertLess(meta['peakDb'], -1)
            self.assertLess(rms(decoded, .2, .6), 1)
            self.assertGreater(rms(decoded, 1.3, 1.7), 100)
            self.assertLess(rms(decoded, 2.5, 3), 1)
            self.assertGreater(rms(decoded, 3.8, 4.2), 100)
            self.assertLess(rms(decoded, 5, 5.7), 1)
            ratio = rms(decoded, 1.3, 1.7) / rms(decoded, 3.8, 4.2)
            self.assertTrue(.8 < ratio < 1.25, ratio)
            proof = pathlib.Path(__file__).parents[1] / 'outputs/dubbing-recording'
            proof.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(output, proof / 'synthetic-final-validation.m4a')
            (proof / 'audio-validation.json').write_text(json.dumps({'source': 'synthetic tones only, no human voice or paid API', **meta}, indent=2))
            manifest['lines'][0]['end'] = 1.5
            with self.assertRaises(ValueError):
                dubbing.render_final(manifest, background, voices, folder)

    def test_silence_uses_complete_clock(self):
        with tempfile.TemporaryDirectory() as folder:
            out, meta = dubbing.render_background({'duration': 3, 'lines': [], 'sounds': []}, [], folder)
            self.assertTrue(out.exists())
            self.assertEqual(meta['duration'], 3)
            self.assertEqual(meta['sampleRate'], 48000)
            self.assertLess(meta['peakDb'], -100)

    def test_download_decode_trim_fade_duck_and_final_peak(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            source = root / 'synthetic.wav'
            sine(source)
            timeline = {'duration': 6, 'lines': [{'start': 2, 'end': 3}], 'sounds': [{
                'id': 'tone', 'kind': 'ambient', 'generationSeconds': 4, 'durationSeconds': 4,
                'start': 1, 'volume': .5, 'fadeInSeconds': .2, 'fadeOutSeconds': .2}]}
            output, meta = dubbing.render_background(timeline, [{'cueId': 'tone', 'url': 'local-test'}], root,
                                                    download=lambda url, dest: shutil.copyfile(source, dest))
            decoded = root / 'verify.wav'
            self.assertLess(meta['peakDb'], -1)
            self.assertLess(rms(decoded, .2, .6), 1)
            self.assertGreater(rms(decoded, 1.4, 1.7), 50)
            self.assertLess(rms(decoded, 2.3, 2.7), rms(decoded, 1.4, 1.7) * .5)
            self.assertGreater(rms(decoded, 3.5, 3.8), rms(decoded, 2.3, 2.7) * 2)
            self.assertLess(rms(decoded, 5.3, 5.8), 1)
            proof = pathlib.Path(__file__).parents[1] / 'outputs/dubbing-stage2'
            proof.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(output, proof / 'synthetic-mix-validation.m4a')
            (proof / 'audio-validation.json').write_text(json.dumps({'source': 'synthetic local sine, not Pika', **meta}, indent=2))

    def test_remote_host_and_timeline_validation(self):
        for url in ['http://cdn.pika.art/a', 'https://127.0.0.1/a', 'https://cdn.pika.art.evil.test/a']:
            with self.assertRaises(ValueError):
                dubbing.download_asset(url, '/unused')
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                dubbing.render_background({'duration': 301, 'lines': [], 'sounds': []}, [], folder)

    def test_maximum_dialogue_count(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            source = root / 'synthetic.wav'
            sine(source)
            # Exercise the full 120-line expression while keeping the audio fixture small.
            timeline = {'duration': 6, 'lines': [{'start': i * .04, 'end': i * .04 + .02} for i in range(120)],
                        'sounds': [{'id': 'tone', 'kind': 'ambient', 'generationSeconds': 4,
                                    'durationSeconds': 4, 'start': 1, 'volume': .5,
                                    'fadeInSeconds': .2, 'fadeOutSeconds': .2}]}
            output, meta = dubbing.render_background(timeline, [{'cueId': 'tone', 'url': 'local-test'}], root,
                                                    download=lambda url, dest: shutil.copyfile(source, dest))
            self.assertTrue(output.exists())
            self.assertEqual(meta['duration'], 6)
            self.assertLess(meta['peakDb'], -1)

if __name__ == '__main__':
    unittest.main()
