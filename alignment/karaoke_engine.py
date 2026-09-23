"""Karaoke build steps, each run in a child process so model memory is released after every song.

separate: audio.m4a -> mr.m4a + vocals.m4a (+ vocals.wav for word alignment)
convert:  creator MR file -> mr.m4a, refusing files whose length does not match the song
words:    align the creator's lyrics on vocals.wav (or the full mix) and keep word timings
"""
import json, math, os, pathlib, subprocess, sys

RATE=44100
DURATION_TOLERANCE=3.0
EXIT_DURATION_MISMATCH=3
EXIT_UNREADABLE=4

def ffmpeg(*args,data=None,timeout=600):
    return subprocess.run(['ffmpeg','-nostdin','-v','error','-y',*args],input=data,check=True,capture_output=True,timeout=timeout).stdout

def probe_duration(path):
    out=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(path)],check=True,capture_output=True,timeout=60).stdout
    return float(json.loads(out)['format']['duration'])

def encode_m4a(pcm,target):
    ffmpeg('-f','f32le','-ar',str(RATE),'-ac','2','-i','pipe:0','-c:a','aac','-b:a','128k','-movflags','+faststart',str(target),data=pcm)

def to_alignment_wav(source,target):
    ffmpeg('-protocol_whitelist','file,pipe','-threads','1','-i',str(source),'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-t','1200','-ac','1','-ar','16000',str(target),timeout=120)

def separate(root):
    import numpy as np, torch
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    torch.set_num_threads(int(os.environ.get('KARAOKE_THREADS','2')))
    raw=ffmpeg('-i',str(root/'audio.m4a'),'-map','0:a:0','-vn','-f','f32le','-ac','2','-ar',str(RATE),'pipe:1')
    wav=torch.from_numpy(np.frombuffer(raw,dtype=np.float32).copy().reshape(-1,2).T)
    del raw
    model=get_model('htdemucs');model.eval()
    # Same loudness normalisation as the demucs CLI; separation quality depends on it.
    ref=wav.mean(0);mean,std=ref.mean(),ref.std()+1e-8
    with torch.no_grad():
        sources=apply_model(model,((wav-mean)/std)[None],device='cpu',shifts=1,split=True,overlap=0.25,progress=False)[0]
    del wav
    sources.mul_(std).add_(mean)
    vocals=sources[model.sources.index('vocals')]
    mr=sources.sum(0)-vocals
    del sources
    for name,track in (('mr',mr),('vocals',vocals)):
        pcm=track.clamp(-1,1).T.contiguous().numpy().astype(np.float32).tobytes()
        encode_m4a(pcm,root/f'{name}.m4a')
    to_alignment_wav(root/'vocals.m4a',root/'vocals.wav')

def convert(root,job):
    source=next(root.glob('mr-source.*'))
    try:
        length=probe_duration(source)
    except Exception:
        sys.exit(EXIT_UNREADABLE)
    if not math.isfinite(length) or abs(length-float(job['duration']))>DURATION_TOLERANCE:
        sys.exit(EXIT_DURATION_MISMATCH)
    try:
        ffmpeg('-i',str(source),'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-ac','2','-ar',str(RATE),'-c:a','aac','-b:a','128k','-movflags','+faststart',str(root/'mr.m4a'))
    except subprocess.CalledProcessError:
        sys.exit(EXIT_UNREADABLE)

def extract_words(result,lines,duration):
    segments=result.to_dict()['segments']
    if len(segments)!=len(lines):
        raise ValueError('line_count_mismatch')
    out=[];uncertain=False
    for expected,segment in zip(lines,segments):
        if ''.join(expected.split())!=''.join(segment['text'].split()):
            raise ValueError('text_mismatch')
        words=[]
        for w in segment.get('words',[]):
            start,end=float(w['start']),float(w['end'])
            if not math.isfinite(start) or not math.isfinite(end) or start<0 or end<start or end>duration+.25:
                raise ValueError('invalid_timing')
            if float(w.get('probability',1))<.35 or end==start:
                uncertain=True
            words.append({'t':w['word'].strip(),'s':round(start,3),'e':round(min(end,duration),3)})
        words=[w for w in words if w['t']]
        if not words:
            raise ValueError('empty_line')
        out.append({'words':words})
    return {'words':out,'needs_attention':uncertain}

def words(root,job):
    import torch, stable_whisper
    torch.set_num_threads(int(os.environ.get('KARAOKE_THREADS','2')))
    audio=root/'vocals.wav'
    if not audio.exists():
        to_alignment_wav(root/'align-source.m4a',audio)
    model_dir=os.environ.get('WHISPER_MODEL','/models/small')
    model=stable_whisper.load_faster_whisper(model_dir,device='cpu',compute_type='int8',cpu_threads=int(os.environ.get('KARAOKE_THREADS','2')),num_workers=1,local_files_only=True)
    text=job['lyrics_text']
    result=model.align(str(audio),text,language=job['language'],original_split=True,verbose=None,regroup=False,suppress_silence=True)
    if result is None:
        raise ValueError('alignment_failed')
    (root/'words.json').write_text(json.dumps(extract_words(result,text.splitlines(),float(job['duration']))),encoding='utf-8')

if __name__=='__main__':
    step,root=sys.argv[1],pathlib.Path(sys.argv[2])
    job=json.loads((root/'job.json').read_text(encoding='utf-8'))
    {'separate':lambda:separate(root),'convert':lambda:convert(root,job),'words':lambda:words(root,job)}[step]()
