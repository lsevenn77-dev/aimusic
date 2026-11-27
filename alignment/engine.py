"""Align supplied lyrics; never replace a creator's words with transcription."""
import json, math, pathlib, subprocess, sys, unicodedata
from bisect import bisect_left
from difflib import SequenceMatcher

def sung_text(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if c.isalnum())

def anchored_timings(model, source, lines, language, duration):
    """Locate the supplied lines on the recording before measuring them individually."""
    # Recognition provides acoustic landmarks only. All returned lyrics still
    # come from the creator. Never publish the transcription or search windows.
    segments, _ = model.transcribe_original(str(source), language=language, beam_size=3,
                                             word_timestamps=True, condition_on_previous_text=False)
    heard, seconds = [], []
    for segment in segments:
        for word in segment.words or []:
            token = sung_text(word.word)
            if token and 0 <= word.start < word.end <= duration + .25:
                heard.append(token)
                seconds.extend([min(duration, (word.start + word.end) / 2)] * len(token))
    lengths = [len(sung_text(line)) for line in lines]
    written = ''.join(sung_text(line) for line in lines)
    matches = SequenceMatcher(None, written, ''.join(heard), autojunk=False).get_matching_blocks()
    anchors = [(i + j + .5, seconds[k + j]) for i,k,n in matches if n >= 3 for j in range(n)]
    coverage = len(anchors) / max(1, len(written))
    if not all(lengths) or coverage < .30:
        raise ValueError(f'insufficient_recognized_lyrics: matched {coverage:.0%}')
    positions = [0] + [p for p,_ in anchors] + [len(written)]
    times = [0] + [t for _,t in anchors] + [duration]
    def locate(position):
        right = bisect_left(positions, position)
        if right == 0 or positions[right] == position:
            return times[right]
        left = right - 1
        ratio = (position - positions[left]) / (positions[right] - positions[left])
        return times[left] + (times[right] - times[left]) * ratio
    windows, supported = [], []
    pos = 0
    for line, length in zip(lines, lengths):
        stop = pos + length
        first, last = bisect_left(positions,pos+.5), bisect_left(positions,stop)
        supported.append(last - first >= min(length, max(2, math.ceil(length * .3))))
        start, end = max(0, locate(pos) - 1.2), min(duration, locate(stop) + 1.2)
        if end - start > 30 or end <= start:
            raise ValueError('lyric_without_nearby_acoustic_landmarks')
        windows.append({'start':start,'end':end,'text':line})
        pos = stop
    measured = model.align_words(str(source), windows, language=language, verbose=None,
                                 regroup=False, suppress_silence=False, normalize_text=False)
    if measured is None:
        raise ValueError('line_alignment_failed')
    measured_lines = measured.to_dict()['segments']
    if len(measured_lines) != len(lines):
        raise ValueError('line_count_mismatch')
    for i, (verified, segment) in enumerate(zip(supported, measured_lines)):
        if not verified and not any(w['end'] > w['start'] and w.get('probability',0) >= .45 for w in segment.get('words',[])):
            raise ValueError(f'insufficient_acoustic_evidence_at_line_{i+1}')
    return regroup_timings(measured, lines, duration)

def regroup_timings(result, lines, duration):
    """Use measured word boundaries when the model moves punctuation or line breaks."""
    if result is None:
        raise ValueError('alignment_failed')
    words = [(sung_text(w['word']), w) for segment in result.to_dict()['segments'] for w in segment.get('words', [])]
    spans = []
    position = 0
    for text, word in words:
        if text:
            spans.append((position, position + len(text), word))
            position += len(text)
    expected = [sung_text(line) for line in lines]
    if not all(expected) or ''.join(expected) != ''.join(text for text, _ in words):
        raise ValueError('text_mismatch')
    timings = []
    position = index = 0
    for text in expected:
        stop = position + len(text)
        measured = []
        while index < len(spans) and spans[index][0] < stop:
            _, end, word = spans[index]
            start_time, end_time = float(word['start']), float(word['end'])
            if not math.isfinite(start_time) or not math.isfinite(end_time) or start_time < 0 or end_time > duration + .25:
                raise ValueError('invalid_timing')
            if min(end_time, duration) > start_time:
                measured.append((start_time, min(end_time, duration)))
            if end > stop:
                break
            index += 1
        if not measured:
            raise ValueError('line_without_timed_audio')
        start, end = round(measured[0][0], 3), round(measured[-1][1], 3)
        if end <= start or timings and start < timings[-1]['start']:
            raise ValueError('unordered_timing')
        timings.append({'start': start, 'end': end})
        position = stop
    return {'timings': timings, 'needs_attention': True}

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
    lines = text.splitlines()
    options = dict(language=language, original_split=True, verbose=None, regroup=False)
    result=model.align(str(source),text,**options,suppress_silence=True)
    if result is not None:
        try:
            return extract_timings(result,lines,duration)
        except ValueError:
            try:
                return regroup_timings(result,lines,duration)
            except ValueError:
                pass
    # Long pauses and elongated syllables in music can exhaust the audio before
    # all lyrics are aligned. Retry the same recording without speech-duration caps.
    result = model.align(str(source), text, **options, token_step=0, fast_mode=True,
                         suppress_silence=False, nonspeech_skip=None, word_dur_factor=None, max_word_dur=None)
    try:
        return regroup_timings(result,lines,duration)
    except ValueError:
        return anchored_timings(model,source,lines,language,duration)

if __name__=='__main__':
    root=pathlib.Path(sys.argv[1]);job=json.loads((root/'job.json').read_text())
    subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-threads','1','-i',str(root/'audio.m4a'),'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-t','1200','-ac','1','-ar','16000',str(root/'audio.wav')],check=True,capture_output=True,timeout=120)
    result=align(root/'audio.wav',job['source_text'],job['language'],job['duration'])
    (root/'result.json').write_text(json.dumps(result))
