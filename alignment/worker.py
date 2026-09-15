import json, os, pathlib, subprocess, tempfile, time, urllib.request

BASE=os.environ['AIFECT_ORIGIN'].rstrip('/')
TOKEN=os.environ['TRANSCODER_TOKEN']

def request(path,method='GET',data=None,job=None):
    headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json','User-Agent':'AIFECT-Lyrics/1.0 (+https://aifect.co.kr)'}
    if job: headers['X-Job-Token']=job['lease_token']
    if data is not None: data=json.dumps(data).encode()
    return urllib.request.urlopen(urllib.request.Request(BASE+path,data=data,headers=headers,method=method),timeout=120)

def process(job):
    path='/internal/lyrics/'+job['id']
    with tempfile.TemporaryDirectory(prefix='aifect-lyrics-') as folder:
        root=pathlib.Path(folder)
        with request(path+'/audio',job=job) as response, (root/'audio.m4a').open('wb') as out:
            count=0
            while block:=response.read(1024*1024):
                count+=len(block)
                if count>80*1024*1024: raise ValueError('audio_too_large')
                out.write(block)
        (root/'job.json').write_text(json.dumps(job),encoding='utf-8')
        # A child process enforces a hard deadline and releases model memory after each song.
        subprocess.run(['python','/app/engine.py',folder],check=True,capture_output=True,timeout=1800)
        result=json.loads((root/'result.json').read_text())
        with request(path+'/finish','POST',result,job): pass
        print(json.dumps({'event':'lyrics_ready','job':job['id'],'lines':len(result['timings'])}),flush=True)

def main():
    while True:
        job=None
        try:
            with request('/internal/lyrics/claim','POST',{}) as response: job=json.load(response)['job']
            if job: process(job)
        except Exception as exc:
            print(json.dumps({'event':'lyrics_error','type':type(exc).__name__,'status':getattr(exc,'code',None),'job':job['id'] if job else None}),flush=True)
            if job:
                try:
                    with request('/internal/lyrics/'+job['id']+'/fail','POST',{},job): pass
                except Exception: pass
        time.sleep(5 if job else 15)

if __name__=='__main__': main()
