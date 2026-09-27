"""Lossless archival only. Unsupported/high precision WAVs stay intact."""
import hashlib
import json
import pathlib
import tempfile


def file_sha(path):
    with open(path, 'rb') as body:
        return hashlib.file_digest(body, 'sha256').hexdigest()


def pcm_sha(path, command):
    # Decode at the original rate/channel count, using a lossless common integer representation.
    result = command(['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                      '-i', str(path), '-map', '0:a:0', '-c:a', 'pcm_s32le',
                      '-f', 'hash', '-hash', 'sha256', '-'], 240)
    return result.stdout.decode().strip().split('=')[-1]


def encode_lossless(source, output, command):
    probe = json.loads(command(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe',
                               '-show_streams', '-show_format', '-of', 'json', str(source)]).stdout)
    streams = probe.get('streams', [])
    if probe.get('format', {}).get('format_name') != 'wav' or len(streams) != 1:
        return {'skip': 'non_single_audio_wav'}
    stream = streams[0]
    if stream.get('codec_name') not in ('pcm_u8', 'pcm_s16le', 'pcm_s24le'):
        return {'skip': 'unsupported_precision_keep_wav'}
    if int(stream.get('channels', 0)) not in (1, 2):
        return {'skip': 'multichannel_keep_wav'}
    command(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe',
             '-threads', '1', '-i', str(source), '-map', '0:a:0', '-vn', '-sn', '-dn',
             '-c:a', 'flac', '-compression_level', '8', str(output)])
    source_hash, output_hash = pcm_sha(source, command), pcm_sha(output, command)
    if source_hash != output_hash:
        raise ValueError('Decoded audio mismatch; keep WAV')
    if output.stat().st_size >= source.stat().st_size:
        return {'skip': 'no_space_saved_keep_wav'}
    return {'source_pcm_sha': source_hash, 'output_pcm_sha': output_hash, 'stored_sha': file_sha(output)}


def archive_original(job, request, download, command):
    prefix = '/internal/archives/' + job['track_id'] + '/'
    if job['state'] == 'committed':
        with request(prefix + 'cleanup', 'POST', {}, job) as response:
            result = json.load(response)
        print(json.dumps({'event': 'archive_cleaned', 'track': job['track_id'], **result}), flush=True)
        return
    with tempfile.TemporaryDirectory(prefix='aifect-archive-') as folder:
        root = pathlib.Path(folder)
        source, output, stored = root/'source.wav', root/'lossless.flac', root/'stored.flac'
        download(prefix+'source', source, job)
        if source.stat().st_size != job['source_bytes']:
            raise ValueError('Source size mismatch; keep WAV')
        result = encode_lossless(source, output, command)
        if 'skip' in result:
            request(prefix+'skip', 'POST', {'reason': result['skip']}, job).close()
            print(json.dumps({'event': 'archive_skipped', 'track': job['track_id'], **result}), flush=True)
            return
        with output.open('rb') as body:
            request(prefix+'output', 'PUT', body, job, 'audio/flac',
                    {'X-Content-SHA256': result['stored_sha']}).close()
        # Read back the stored object, not just a successful upload response.
        download(prefix+'output', stored, job)
        if file_sha(stored) != result['stored_sha']:
            raise ValueError('Stored file mismatch; keep WAV')
        request(prefix+'commit', 'POST', result, job).close()
        with request(prefix+'cleanup', 'POST', {}, job) as response:
            done = json.load(response)
        print(json.dumps({'event': 'archived', 'track': job['track_id'],
                          'source_bytes': source.stat().st_size, 'flac_bytes': stored.stat().st_size,
                          'saved_bytes': done['saved_bytes']}), flush=True)
