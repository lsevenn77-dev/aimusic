import json, os, pathlib, subprocess, sys, tempfile, time, urllib.request

BASE=os.environ['AIFECT_ORIGIN'].rstrip('/')
TOKEN=os.environ['TRANSCODER_TOKEN']
# karaoke_engine.py exit codes meaning "the creator's MR file is wrong", reported instead of a generic failure.
KARAOKE_REASONS={3:'duration_mismatch',4:'unreadable'}
HERE=pathlib.Path(__file__).resolve().parent

def request(path,method='GET',data=None,job=None,content_type='application/json'):
    headers={'Authorization':'Bearer '+TOKEN,'Content-Type':content_type,'User-Agent':'AIFECT-Lyrics/1.0 (+https://aifect.co.kr)'}
    if job: headers['X-Job-Token']=job['lease_token']
    if isinstance(data,dict): data=json.dumps(data).encode()
    if hasattr(data,'fileno'): headers['Content-Length']=str(os.fstat(data.fileno()).st_size)
    return urllib.request.urlopen(urllib.request.Request(BASE+path,data=data,headers=headers,method=method),timeout=180)

def download(path,job,target):
    with request(path,job=job) as response, target.open('wb') as out:
        count=0
        while block:=response.read(1024*1024):
            count+=len(block)
            if count>80*1024*1024: raise ValueError('audio_too_large')
            out.write(block)

def upload(path,job,source):
    with source.open('rb') as body: request(path,'PUT',body,job,'audio/mp4').close()

def process(job):
    path='/internal/lyrics/'+job['id']
    with tempfile.TemporaryDirectory(prefix='aifect-lyrics-') as folder:
        root=pathlib.Path(folder)
        download(path+'/audio',job,root/'audio.m4a')
        (root/'job.json').write_text(json.dumps(job),encoding='utf-8')
        # A child process enforces a hard deadline and releases model memory after each song.
        subprocess.run([sys.executable,str(HERE/'engine.py'),folder],check=True,capture_output=True,timeout=1800)
        result=json.loads((root/'result.json').read_text())
        with request(path+'/finish','POST',result,job): pass
        print(json.dumps({'event':'lyrics_ready','job':job['id'],'lines':len(result['timings'])}),flush=True)

def karaoke_step(name,folder,timeout):
    subprocess.run([sys.executable,str(HERE/'karaoke_engine.py'),name,folder],check=True,capture_output=True,timeout=timeout)

def karaoke(job):
    path='/internal/karaoke/'+job['id']
    with tempfile.TemporaryDirectory(prefix='aifect-karaoke-') as folder:
        root=pathlib.Path(folder)
        (root/'job.json').write_text(json.dumps(job),encoding='utf-8')
        if not job['mr_ready']:
            if job['mr_source']=='upload':
                download(path+'/mr-source',job,root/('mr-source.'+job['mr_ext']))
                karaoke_step('convert',folder,600)
            else:
                download(path+'/audio',job,root/'audio.m4a')
                karaoke_step('separate',folder,2400)
                upload(path+'/vocals',job,root/'vocals.m4a')
            upload(path+'/mr',job,root/'mr.m4a')
        result={'words':None}
        if job['lyrics_text']:
            if not (root/'vocals.wav').exists():
                download(path+('/vocals' if job['vocals_ready'] else '/audio'),job,root/'align-source.m4a')
            try:
                karaoke_step('words',folder,900)
                result=json.loads((root/'words.json').read_text(encoding='utf-8'))
            except Exception as exc:
                # The MR is still usable; the server marks only the word timings as failed.
                print(json.dumps({'event':'karaoke_words_error','type':type(exc).__name__,'job':job['id']}),flush=True)
        with request(path+'/finish','POST',result,job): pass
        print(json.dumps({'event':'karaoke_ready','job':job['id'],'words':result['words'] is not None}),flush=True)

def report_failure(kind,job,exc):
    reason=KARAOKE_REASONS.get(exc.returncode) if kind=='karaoke' and isinstance(exc,subprocess.CalledProcessError) else None
    try:
        with request(f'/internal/{kind}/'+job['id']+'/fail','POST',{'reason':reason} if reason else {},job): pass
    except Exception: pass

def main():
    # One process, one song at a time: lyrics jobs first (creators wait on them), then karaoke builds.
    while True:
        job=None;kind='lyrics'
        try:
            with request('/internal/lyrics/claim','POST',{}) as response: job=json.load(response)['job']
            if job: process(job)
            else:
                kind='karaoke'
                with request('/internal/karaoke/claim','POST',{}) as response: job=json.load(response)['job']
                if job: karaoke(job)
        except Exception as exc:
            detail=(exc.stderr or b'')[-600:].decode('utf-8','replace') if isinstance(exc,subprocess.CalledProcessError) else None
            print(json.dumps({'event':kind+'_error','type':type(exc).__name__,'status':getattr(exc,'code',None),'job':job['id'] if job else None,'detail':detail},ensure_ascii=False),flush=True)
            if job: report_failure(kind,job,exc)
        time.sleep(5 if job else 15)

if __name__=='__main__': main()
