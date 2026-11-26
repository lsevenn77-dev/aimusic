"""Operator-requested cover source compaction. Verify before pointer swap/delete."""
import hashlib, json, math, pathlib, tempfile

def decoded_duration(path, command):
    result=command(['ffmpeg','-nostdin','-v','error','-protocol_whitelist','file,pipe','-i',str(path),'-map','0:a:0','-ac','2','-ar','44100','-f','framehash','-'])
    return sum(int(line.split(',')[3]) for line in result.stdout.decode().splitlines() if line and not line.startswith('#'))/44100

def compress_cover(job, request, download, command):
    prefix='/internal/cover-compression/'+job['track_id']+'/'
    if job['state']=='committed':
        request(prefix+'cleanup','POST',{},job).close()
        return
    with tempfile.TemporaryDirectory(prefix='aifect-cover-') as folder:
        root=pathlib.Path(folder); source=root/('source.'+job['source_ext']); output=root/'cover.mp3'
        download(prefix+'source',source,job)
        command(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-threads','1','-i',str(source),'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-c:a','libmp3lame','-b:a','256k','-ac','2','-ar','44100','-write_xing','1',str(output)])
        if output.stat().st_size>=job['source_bytes']:
            request(prefix+'skip','POST',{'reason':'Existing lossless source is already smaller; kept intact'},job).close();return
        probe=json.loads(command(['ffprobe','-v','error','-select_streams','a:0','-show_entries','format=duration:stream=codec_name,channels,sample_rate,bit_rate','-of','json',str(output)]).stdout)
        stream=probe['streams'][0]; duration=float(probe['format']['duration'])
        # MP3 format duration can include frame padding; decoded sample counts below
        # are the timing contract rather than a rounded container duration.
        def decoded(path): return decoded_duration(path,command)
        source_duration=decoded(source); actual=decoded(output)
        if stream['codec_name']!='mp3' or stream['channels']!=2 or int(stream['sample_rate'])!=44100 or abs(int(stream['bit_rate'])-256000)>1000 or not math.isfinite(duration) or abs(actual-source_duration)>.002 or abs(actual-job['duration'])>.05:
            raise ValueError('MP3 quality/timeline validation failed')
        with output.open('rb') as body: sha=hashlib.file_digest(body,'sha256').hexdigest()
        with output.open('rb') as body: request(prefix+'output','PUT',body,job,'audio/mpeg',{'X-Content-SHA256':sha}).close()
        stored=root/'stored.mp3';download(prefix+'output',stored,job)
        with stored.open('rb') as body: stored_sha=hashlib.file_digest(body,'sha256').hexdigest()
        if stored_sha!=sha or abs(decoded(stored)-actual)>.002:
            raise ValueError('Stored MP3 readback validation failed')
        request(prefix+'finish','POST',{'codec':'mp3','bitrate_kbps':256,'channels':2,'sample_rate':44100,'duration':actual,'sha256':sha},job).close()
        request(prefix+'cleanup','POST',{},job).close()
        print(json.dumps({'event':'cover_compacted','track':job['track_id'],'source_bytes':job['source_bytes'],'output_bytes':output.stat().st_size,'duration':actual}),flush=True)
