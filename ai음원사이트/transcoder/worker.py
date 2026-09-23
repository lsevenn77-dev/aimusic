import json, os, time, tempfile, pathlib, subprocess, urllib.request, urllib.error, math

BASE=os.environ['AIFECT_ORIGIN'].rstrip('/')
TOKEN=os.environ['TRANSCODER_TOKEN']
def request(path, method='GET', data=None, job=None, content_type='application/json'):
    headers={'Authorization':'Bearer '+TOKEN,'Content-Type':content_type,'User-Agent':'AIFECT-Transcoder/1.0 (+https://aifect.co.kr)','Accept':'application/json, audio/*, image/*, application/octet-stream'}
    if job: headers['X-Job-Token']=job['lease_token']
    if isinstance(data,dict): data=json.dumps(data).encode()
    if hasattr(data,'fileno'): headers['Content-Length']=str(os.fstat(data.fileno()).st_size)
    req=urllib.request.Request(BASE+path,data=data,headers=headers,method=method)
    return urllib.request.urlopen(req,timeout=180)

def download(path,destination,job,max_bytes=80*1024*1024):
    with request(path,job=job) as response,open(destination,'wb') as out:
        total=0
        while True:
            block=response.read(1024*1024)
            if not block: break
            total+=len(block)
            if total>max_bytes: raise ValueError('File too large')
            out.write(block)

def command(args,timeout=240):
    return subprocess.run(args,check=True,capture_output=True,timeout=timeout)

def convert(job):
    prefix='/internal/jobs/'+job['id']+'/'
    with tempfile.TemporaryDirectory(prefix='aifect-') as folder:
        root=pathlib.Path(folder); source=root/('original.'+job['original_ext'])
        download(prefix+'original',source,job)
        result=command(['ffprobe','-v','error','-protocol_whitelist','file,pipe','-select_streams','a:0','-show_entries','format=duration,format_name:stream=codec_type','-of','json',str(source)])
        probe=json.loads(result.stdout); duration=float(probe['format']['duration'])
        allowed={'wav':['wav'],'flac':['flac'],'mp3':['mp3']}[job['original_ext']]
        if not any(f in probe['format']['format_name'].split(',') for f in allowed) or not probe.get('streams'): raise ValueError('Invalid audio format')
        if not math.isfinite(duration) or duration<5 or duration>1200: raise ValueError('Duration out of bounds')
        for kind in ['stream','preview']:
            output=root/(kind+'.m4a')
            args=['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-threads','1','-i',str(source),'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-c:a','aac','-b:a','128k','-ac','2','-ar','44100']
            if kind=='preview': args+=['-t','60']
            command(args+['-movflags','+faststart',str(output)])
            with output.open('rb') as body: request(prefix+kind,'PUT',body,job,'audio/mp4').close()
        if job['has_cover']:
            cover=root/'cover-source'; download(prefix+'cover-source',cover,job,5*1024*1024)
            output=root/'cover.jpg'
            command(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-threads','1','-i',str(cover),'-frames:v','1','-vf','scale=1000:1000:force_original_aspect_ratio=decrease','-q:v','3','-map_metadata','-1',str(output)],60)
            with output.open('rb') as body: request(prefix+'cover','PUT',body,job,'image/jpeg').close()
        request(prefix+'finish','POST',{'duration':duration},job).close()
        print(json.dumps({'event':'published','track':job['id'],'duration':duration}),flush=True)

def main():
    while True:
        job=None
        try:
            with request('/internal/jobs/claim','POST',{}) as response: job=json.load(response)['job']
            if job: convert(job)
        except Exception as exc:
            print(json.dumps({'event':'transcode_error','kind':type(exc).__name__,'status':getattr(exc,'code',None),'track':job['id'] if job else None}),flush=True)
            if job:
                try: request('/internal/jobs/'+job['id']+'/fail','POST',{},job).close()
                except Exception: pass
        time.sleep(5 if job else 15)

if __name__=='__main__': main()
