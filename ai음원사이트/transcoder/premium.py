import hashlib, json, math, pathlib, tempfile

def convert_premium(job, request, download, command):
    prefix='/internal/premium-audio/'+job['track_id']+'/'
    with tempfile.TemporaryDirectory(prefix='aifect-premium-') as folder:
        root=pathlib.Path(folder)
        source=root/('original.'+job['original_ext'])
        output=root/'premium.m4a'
        # Always use the uploaded original (or its lossless archive), never the AAC 128 stream.
        download(prefix+'source',source,job)
        command(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-threads','1','-i',str(source),'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-c:a','aac','-b:a','256k','-ac','2','-ar','44100','-movflags','+faststart',str(output)])
        probe=json.loads(command(['ffprobe','-v','error','-protocol_whitelist','file,pipe','-select_streams','a:0','-show_entries','format=duration:stream=codec_name,channels,sample_rate,bit_rate','-of','json',str(output)]).stdout)
        stream=probe['streams'][0];duration=float(probe['format']['duration'])
        if stream['codec_name']!='aac' or stream['channels']!=2 or int(stream['sample_rate'])!=44100 or not math.isfinite(duration) or abs(duration-job['duration'])>1:
            raise ValueError('Premium output validation failed')
        with output.open('rb') as encoded:
            sha=hashlib.file_digest(encoded,'sha256').hexdigest()
        with output.open('rb') as body:
            request(prefix+'output','PUT',body,job,'audio/mp4',{'X-Content-SHA256':sha}).close()
        request(prefix+'finish','POST',{'codec':'aac','bitrate_kbps':256,'channels':2,'sample_rate':44100,'duration':duration,'sha256':sha},job).close()
        print(json.dumps({'event':'premium_ready','track':job['track_id'],'bitrate':int(stream.get('bit_rate',0)),'duration':duration}),flush=True)
