"""Align supplied lyrics; never replace a creator's words with transcription."""
import json, math, pathlib, subprocess, sys

def extract_timings(result, lines, duration):
    segments=result.to_dict()['segments']
    if len(segments)!=len(lines):
        raise ValueError('line_count_mismatch')
    timings=[]; uncertain=0
    for expected,segment in zip(lines,segments):
        if ''.join(expected.split())!=''.join(segment['text'].split()):
            raise ValueError('text_mismatch')
        start,end=float(segment['start']),float(segment['end'])
        if not math.isfinite(start) or not math.isfinite(end) or start<0 or end<=start or end>duration+.25:
            raise ValueError('invalid_timing')
        if timings and start<timings[-1]['start']:
            raise ValueError('unordered_timing')
        words=segment.get('words',[])
        if any(float(w.get('probability',1))<.35 or w['end']<=w['start'] for w in words):
            uncertain+=1
        timings.append({'start':round(start,3),'end':round(min(end,duration),3)})
    return {'timings':timings,'needs_attention':uncertain>0}

def align(source,text,language,duration):
    import torch, stable_whisper
    torch.set_num_threads(2)
    model=stable_whisper.load_faster_whisper('/models/small',device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
    result=model.align(str(source),text,language=language,original_split=True,verbose=None,regroup=False,suppress_silence=True)
    if result is None:
        raise ValueError('alignment_failed')
    return extract_timings(result,text.splitlines(),duration)

if __name__=='__main__':
    root=pathlib.Path(sys.argv[1]);job=json.loads((root/'job.json').read_text())
    subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-threads','1','-i',str(root/'audio.m4a'),'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-t','1200','-ac','1','-ar','16000',str(root/'audio.wav')],check=True,capture_output=True,timeout=120)
    result=align(root/'audio.wav',job['source_text'],job['language'],job['duration'])
    (root/'result.json').write_text(json.dumps(result))
