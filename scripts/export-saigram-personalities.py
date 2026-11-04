"""Read only: export personality allowlists from the operator-owned Saigram source.
Never imports main.py, modifies SQLite, or copies dialogue/private user data.
"""
import sys,json,sqlite3,gzip,base64,hashlib,pathlib,argparse
parser=argparse.ArgumentParser();parser.add_argument('--api-root',required=True);parser.add_argument('--database',required=True);parser.add_argument('--web-bots',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
from datetime import datetime,timezone
sys.dont_write_bytecode=True
sys.path.insert(0,args.api_root)
import voice_axes,curated_bots,char_master
c=sqlite3.connect('file:'+str(pathlib.Path(args.database).resolve())+'?mode=ro',uri=True);c.row_factory=sqlite3.Row
chars=[dict(r) for r in c.execute('select id,name,mbti from characters')]
bots=[dict(r) for r in c.execute('select bot_account_id,handle,display_name,mbti,vibe from bot_accounts')]
byname={r['name']:r['id'] for r in chars if not r['id'].startswith(('bot_user_','custom_'))}
char_master.load(byname)
mb={r['id']:r['mbti'] for r in chars if r['mbti']}
for r in bots:
 if r['mbti']:mb.setdefault(r['bot_account_id'],r['mbti'])
ids=list(char_master._MASTER or {})
homes={i:char_master._get(char_master.get_profile(i),'basic.hometown') for i in ids}
summ={i:char_master._get(char_master.get_profile(i),'personality_emotion.core_personality_summary') for i in ids}
axes=voice_axes.assign(ids,homes,summ,mb)
bids=['bot_user_%04d'%i for i in range(1,294)]
axes.update(voice_axes.assign(bids,{i:'' for i in bids},{i:'' for i in bids},mb))
keep=['social_tone','softener','question_style','humor_style','comfort_style','anger_style','laugh','emoji_set','length_band','rhythm']
def personality(cid):
 a=curated_bots.voice(cid) or axes.get(cid,{})
 p=char_master.get_profile(cid) or {}
 fields={k:char_master._get(p,'personality_emotion.'+k) for k in ['core_personality_summary','strengths','weaknesses','comforting_style','humor_style','anger_expression']}
 return {'axes':{k:a[k] for k in keep if k in a},'traits':{k:v for k,v in fields.items() if v}}
out={}
master=json.load(open(str(pathlib.Path(args.api_root)/'character_master_v3.json')))
for item in master['characters']:
 name=char_master._get(item['profile'],'basic.display_name')
 cid=byname.get(name)
 if cid:out['saigram:character:'+item['character_id']]={'source_id':cid,'name':name,**personality(cid)}
for b in bots:
 cid=b['bot_account_id']
 if cid not in bids:continue
 out['saigram:bot:'+b['handle']]={'source_id':cid,'name':b['display_name'],**personality(cid)}
snapshot=[json.loads(l.strip().rstrip(',')) for l in pathlib.Path(args.web_bots).read_text().splitlines() if l.strip().startswith('{"handle"')]
for b in snapshot:
 if b['id'] in bids:out.setdefault('saigram:bot:'+b['handle'],{'source_id':b['id'],'name':b['name'],**personality(b['id'])})
sources={n:hashlib.sha256(pathlib.Path(str(pathlib.Path(args.api_root)/n)).read_bytes()).hexdigest() for n in ['voice_axes.py','mbti.py','character_master_v3.json','curated_bots.json','curated_bots_20260924.json','curated_bots_20260926.json']}
payload={'version':1,'extracted_at':datetime.now(timezone.utc).isoformat(),'source':'Saigram production read-only snapshot','source_files_sha256':sources,'profiles':out}
data=gzip.compress(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode())
pathlib.Path(args.output).write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
print('COUNT:'+str(len(out)))

