"""Prepare reviewed AI-only assets from the operator's existing Saigram export.
Reads a local Git bundle checkout, never crawls members or changes the source.
No production database/R2 writes. Output is a reviewable AIFECT import catalogue.
"""
import concurrent.futures, hashlib, io, json, pathlib, re, subprocess, urllib.request
from PIL import Image, ImageOps
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'work/saigram-source'
OUT=ROOT/'dist/assets/ai-bot-import'
OUT.mkdir(parents=True,exist_ok=True)
def git(path):
    return subprocess.check_output(['git','-C',str(SOURCE),'show','HEAD:'+path]).decode('utf-8')
bots=[json.loads(line.strip().rstrip(',')) for line in git('web/lib/bots.generated.ts').splitlines() if line.strip().startswith('{"handle"')]
master=json.loads(git('api/character_master_v3.json'))
manifest=json.loads(pathlib.Path('C:/Users/lseve/Downloads/saigram-converted/manifest.json').read_text(encoding='utf-8-sig'))
mapping={row['character_id']:row for row in manifest if row['mode']=='public' and row['status']=='converted'}
items=[]
for c in master['characters']:
    basic=c['profile']['basic']; name=basic['display_name']['value']; legacy=basic['legacy_id']['value']
    local=mapping.get(legacy)
    path=pathlib.Path(local['output_path']) if local else pathlib.Path('C:/Users/lseve/Downloads')/(name+'.png')
    if path.is_file():items.append(dict(name=name,source_key='saigram:character:'+c['character_id'],path=str(path)))
for b in bots:
    key=b['imageKey']
    if not re.fullmatch(r'assets/bot-profiles/bot_\d+\.webp',key):continue
    items.append(dict(name=b['name'],source_key='saigram:bot:'+b['handle'],url='https://img.dasi-on.co.kr/'+key))
def prepare(item):
    try:
        if 'path' in item: data=pathlib.Path(item['path']).read_bytes()
        else:
            req=urllib.request.Request(item['url'],headers={'User-Agent':'AIFECT-Authorized-Asset-Import/1.0'})
            with urllib.request.urlopen(req,timeout=20) as r:
                if urllib.parse.urlparse(r.url).hostname!='img.dasi-on.co.kr':raise ValueError('Unexpected CDN redirect')
                data=r.read(5*1024*1024+1)
        if len(data)>5*1024*1024:raise ValueError('Oversized image')
        image=ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')
        image=ImageOps.fit(image,(512,512),method=Image.Resampling.LANCZOS)
        out=io.BytesIO();image.save(out,'WEBP',quality=85,method=6);data=out.getvalue()
        sha=hashlib.sha256(data).hexdigest();filename=sha+'.webp';(OUT/filename).write_bytes(data)
        return dict(name=item['name'],source_key=item['source_key'],image='/assets/ai-bot-import/'+filename,sha=sha,status='ready',bytes=len(data))
    except Exception as e:return dict(name=item['name'],source_key=item['source_key'],status='failed',error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: results=list(pool.map(prepare,items))
seen=set()
for row in results:
    if row['status']=='ready':
        if row['sha'] in seen: row['status']='duplicate'
        seen.add(row['sha'])
catalog=dict(source='Saigram operator-owned AI export',source_commit=subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD']).decode().strip(),snapshot=True,items=results)
(OUT/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(candidates=len(items),ready=sum(i['status']=='ready' for i in results),duplicates=sum(i['status']=='duplicate' for i in results),failed=sum(i['status']=='failed' for i in results)),ensure_ascii=False))
