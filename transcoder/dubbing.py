"""Independent dubbing queue. Reuses the deployed transcoder's HTTP credential and FFmpeg.

Run separately: python dubbing.py (no changes to the music worker's scheduling).
PIKA_API_KEY stays in the server secret store; the worker only receives media CDN URLs.
"""
import array
import json
import math
import os
import pathlib
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import wave

FFMPEG = os.environ.get('FFMPEG_BIN', 'ffmpeg')
MAX_ASSET_BYTES = 32 * 1024 * 1024

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Media redirects are not allowed')

def download_asset(url, destination):
    u = urllib.parse.urlsplit(url)
    if u.scheme != 'https' or u.hostname != 'cdn.pika.art' or u.port or u.username or u.password:
        raise ValueError('Unexpected media host')
    request = urllib.request.Request(url, headers={'Accept': 'audio/*,application/octet-stream'})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
        if response.headers.get_content_type() not in ('audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/ogg', 'application/octet-stream'):
            raise ValueError('Unexpected media MIME')
        with open(destination, 'wb') as out:
            total = 0
            while True:
                block = response.read(256 * 1024)
                if not block:
                    break
                total += len(block)
                if total > MAX_ASSET_BYTES:
                    raise ValueError('Media is too large')
                out.write(block)
            if total < 44:
                raise ValueError('Empty audio')

def command(args):
    return subprocess.run([FFMPEG, '-nostdin', '-hide_banner', '-v', 'error', '-y', '-threads', '1'] + args,
                          check=True, capture_output=True, timeout=180)

def wave_info(path):
    peak = 0
    with wave.open(str(path), 'rb') as audio:
        rate = audio.getframerate()
        if audio.getsampwidth() != 2 or audio.getnchannels() != 2 or rate != 48000:
            raise ValueError('Invalid decoded audio')
        duration = audio.getnframes() / rate
        while True:
            block = audio.readframes(24000)
            if not block:
                break
            samples = array.array('h', block)
            peak = max(peak, max(abs(x) for x in samples))
    return {'duration': duration, 'sampleRate': rate, 'peakDb': 20 * math.log10(peak / 32768) if peak else -120}

def number(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError('Invalid timeline number')
    return float(value)

def duck_expression(lines):
    # 120 ms attack, 300 ms release. All clips use the same absolute recording clock.
    ramps = []
    for line in lines:
        start = number(line['start'], 0, 300)
        end = number(line['end'], start, 300)
        ramps.append(f"if(lt(t,{start-.12:.3f}),1,if(lt(t,{start:.3f}),1-0.7*(t-({start-.12:.3f}))/.12,if(lt(t,{end:.3f}),.3,if(lt(t,{end+.3:.3f}),.3+.7*(t-{end:.3f})/.3,1))))")
    # A left-nested min() exceeds FFmpeg's parser depth at the 120-line limit.
    # Pair the envelopes as a balanced tree so depth grows logarithmically.
    if not ramps:
        return '1'
    while len(ramps) > 1:
        ramps = [f'min({ramps[i]},{ramps[i+1]})' if i + 1 < len(ramps) else ramps[i]
                 for i in range(0, len(ramps), 2)]
    return ramps[0]

def render_background(timeline, assets, folder, download=download_asset, heartbeat=lambda: None):
    root = pathlib.Path(folder)
    duration = number(timeline['duration'], .1, 300)
    sounds = timeline['sounds']
    if len(sounds) > 24 or len(timeline['lines']) > 120:
        raise ValueError('Timeline too large')
    if len({s['id'] for s in sounds}) != len(sounds):
        raise ValueError('Duplicate cue')
    urls = {asset['cueId']: asset['url'] for asset in assets}
    args = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
    filters = [f'[0:a]atrim=duration={duration},asetpts=PTS-STARTPTS[base]']
    labels = ['[base]']
    duck = duck_expression(timeline['lines'])
    for index, cue in enumerate(sounds, 1):
        heartbeat()
        source, decoded = root / f'source-{index}', root / f'cue-{index}.wav'
        generated = number(cue['generationSeconds'], 1, 30)
        seconds = number(cue['durationSeconds'], .5, generated)
        start = number(cue['start'], 0, duration - seconds + .001)
        volume = number(cue['volume'], 0, .5)
        fade_in = number(cue['fadeInSeconds'], 0, seconds / 2)
        fade_out = number(cue['fadeOutSeconds'], 0, seconds / 2)
        for attempt in range(3):
            try:
                download(urls[cue['id']], source)
                break
            except (OSError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        command(['-protocol_whitelist', 'file,pipe', '-i', str(source), '-map', '0:a:0', '-vn', '-sn', '-dn',
                 '-t', str(generated + 2.1), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(decoded)])
        info = wave_info(decoded)
        if info['duration'] < seconds - .1 or info['duration'] > generated + 2:
            raise ValueError('Provider audio duration mismatch')
        args += ['-protocol_whitelist', 'file,pipe', '-i', str(decoded)]
        chain = f'[{index}:a]atrim=duration={seconds},asetpts=PTS-STARTPTS,loudnorm=I=-23:TP=-6:LRA=7,aresample=48000'
        if fade_in:
            chain += f',afade=t=in:d={fade_in}'
        if fade_out:
            chain += f',afade=t=out:st={seconds-fade_out}:d={fade_out}'
        chain += f',volume={volume},adelay={round(start*1000)}:all=1,asetnsamples=n=480:p=0'
        if cue['kind'] in ('bgm', 'ambient'):
            chain += f",volume='{duck}':eval=frame"
        chain += f'[s{index}]'
        filters.append(chain)
        labels.append(f'[s{index}]')
    filters.append(''.join(labels) + f'amix=inputs={len(labels)}:duration=first:normalize=0,alimiter=limit=0.63:level=disabled:latency=1,atrim=duration={duration},aresample=48000[out]')
    filter_file = root / 'mix.txt'
    filter_file.write_text(';\n'.join(filters), encoding='utf8')
    output = root / 'background.m4a'
    heartbeat()
    command(args + ['-filter_complex_script', str(filter_file), '-map', '[out]', '-t', str(duration), '-ar', '48000', '-ac', '2',
                    '-map_metadata', '-1', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(output)])
    verify = root / 'verify.wav'
    command(['-protocol_whitelist', 'file,pipe', '-i', str(output), '-t', str(duration + 1), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(verify)])
    meta = wave_info(verify)
    if abs(meta['duration'] - duration) > .1 or meta['peakDb'] > -1:
        raise ValueError('Final audio failed duration/peak validation')
    # The PCM timeline duration is authoritative; AAC may add one padded frame.
    meta['duration'] = duration
    return output, meta

def process(job, request):
    prefix = '/internal/dubbing/' + job['id'] + '/'
    deadline = time.monotonic() + 1800
    def heartbeat():
        request(prefix + 'heartbeat', 'POST', {}, job).close()
    while time.monotonic() < deadline:
        with request(prefix + 'step', 'POST', {}, job) as response:
            result = json.load(response)
        if result['state'] in ('unknown', 'failed', 'ready'):
            return
        if result['state'] == 'mixing':
            with tempfile.TemporaryDirectory(prefix='aifect-dubbing-') as folder:
                output, meta = render_background(result['timeline'], result['assets'], folder, heartbeat=heartbeat)
                with output.open('rb') as body:
                    request(prefix + 'output', 'PUT', body, job, 'audio/mp4').close()
                request(prefix + 'finish', 'POST', meta, job).close()
            return
        time.sleep(min(30, max(1, result.get('waitSeconds', 3))))
    raise TimeoutError('Dubbing job deadline')

def render_final(manifest, background, voices, folder, heartbeat=lambda: None):
    root = pathlib.Path(folder)
    duration = number(manifest['duration'], .1, 300)
    lines = manifest['lines']
    if not 1 <= len(lines) <= 120 or len({line['id'] for line in lines}) != len(lines):
        raise ValueError('Invalid recording manifest')
    args = ['-protocol_whitelist', 'file,pipe', '-i', str(background)]
    filters = [f'[0:a]aresample=48000,apad,atrim=duration={duration},asetpts=PTS-STARTPTS[bg]']
    labels = ['[bg]']
    last_end = 0
    for index, line in enumerate(lines, 1):
        heartbeat()
        start = number(line['start'], last_end, duration)
        end = number(line['end'], start + .1, duration)
        last_end = end
        source = voices[line['id']]
        with wave.open(str(source), 'rb') as audio:
            if audio.getnchannels() != 1 or audio.getframerate() != 48000 or audio.getsampwidth() != 2:
                raise ValueError('Invalid voice format')
            seconds = audio.getnframes() / 48000
            if not .1 <= seconds <= end - start + 1 / 48000:
                raise ValueError('Voice crosses next line')
        args += ['-protocol_whitelist', 'file,pipe', '-i', str(source)]
        filters.append(f'[{index}:a]atrim=duration={seconds},asetpts=PTS-STARTPTS,highpass=f=65,loudnorm=I=-18:TP=-3:LRA=7,aresample=48000,afade=t=in:d=0.008,afade=t=out:st={max(0,seconds-.015)}:d=0.015,adelay={round(start*1000)}:all=1[v{index}]')
        labels.append(f'[v{index}]')
    filters.append(''.join(labels) + f'amix=inputs={len(labels)}:duration=first:normalize=0,alimiter=limit=0.63:level=disabled:latency=1,atrim=duration={duration},aresample=48000[out]')
    config = root / 'final-mix.txt'
    config.write_text(';\n'.join(filters), encoding='utf8')
    output = root / 'final.m4a'
    command(args + ['-filter_complex_script', str(config), '-map', '[out]', '-t', str(duration), '-ar', '48000', '-ac', '2', '-map_metadata', '-1', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(output)])
    verify = root / 'final-verify.wav'
    command(['-protocol_whitelist', 'file,pipe', '-i', str(output), '-t', str(duration + 1), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', str(verify)])
    meta = wave_info(verify)
    if abs(meta['duration'] - duration) > .1 or meta['peakDb'] > -1:
        raise ValueError('Final recording failed validation')
    meta['duration'] = duration
    return output, meta

def process_final(job, request):
    prefix = '/internal/dubbing-final/' + job['id'] + '/'
    def heartbeat():
        request(prefix + 'heartbeat', 'POST', {}, job).close()
    def download(name, destination, limit):
        with request(prefix + 'input/' + name, 'GET', None, job) as response, open(destination, 'wb') as out:
            size = 0
            while True:
                block = response.read(256 * 1024)
                if not block:
                    break
                size += len(block)
                if size > limit:
                    raise ValueError('Recording input too large')
                out.write(block)
    with request(prefix + 'step', 'POST', {}, job) as response:
        manifest = json.load(response)
    with tempfile.TemporaryDirectory(prefix='aifect-dubbing-final-') as folder:
        root = pathlib.Path(folder)
        background = root / 'background.m4a'
        download('background', background, 12 * 1024 * 1024)
        voices = {}
        for index, line in enumerate(manifest['lines']):
            heartbeat()
            target = root / f'voice-{index}.wav'
            # IDs originate in the validated server manifest, not filesystem paths.
            if not all(c.isascii() and (c.isalnum() or c in '_-') for c in line['id']):
                raise ValueError('Invalid line ID')
            download('line-' + line['id'], target, 48 * 48000 * 2 + 44)
            voices[line['id']] = target
        output, meta = render_final(manifest, background, voices, folder, heartbeat)
        heartbeat()
        with output.open('rb') as body:
            request(prefix + 'output', 'PUT', body, job, 'audio/mp4').close()
        request(prefix + 'finish', 'POST', meta, job).close()

def main():
    from worker import request
    prefer_final = False
    while True:
        job = None
        final = False
        try:
            for final in ([True, False] if prefer_final else [False, True]):
                with request(('/internal/dubbing-final/' if final else '/internal/dubbing/') + 'claim', 'POST', {}) as response:
                    job = json.load(response)['job']
                if job:
                    (process_final if final else process)(job, request)
                    prefer_final = not final
                    break
        except Exception as exc:
            print(json.dumps({'event': 'dubbing_error', 'kind': type(exc).__name__, 'job': job['id'] if job else None}), flush=True)
            if job and isinstance(exc, (ValueError, subprocess.SubprocessError)):
                try:
                    request(('/internal/dubbing-final/' if final else '/internal/dubbing/') + job['id'] + '/fail', 'POST', {}, job).close()
                except Exception:
                    pass
        time.sleep(5 if job else 15)

if __name__ == '__main__':
    main()
