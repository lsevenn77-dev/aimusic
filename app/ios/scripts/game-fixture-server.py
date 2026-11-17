#!/usr/bin/env python3
"""Serve the real Jump Rush client with isolated read-only API fixtures.
Usage: python3 game-fixture-server.py /path/to/web/dist
No production session, scores, purchases or API writes are used.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import sys

ROOT = Path(sys.argv[1]).resolve()
HTML = '''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{background:#0e141e;color:white;font-family:system-ui;margin:0}button,a{font:inherit;color:inherit}button{background:#292035;border:1px solid #7c6e91;border-radius:10px;padding:10px}a{color:#e6a3ce}[hidden]{display:none!important}</style>
<script src="/user-nickname.js"></script><main id="main"></main>
<script type="module">
import {mount} from '/crew-jump-view.js';
import {VERSION} from '/crew-jump-core.js';
import {JUMP_OUTFITS} from '/crew-jump-art/outfits.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail=error=>{const p=document.createElement('p');p.id='fixture-error';p.textContent=String(error?.message||error);document.body.append(p)};
window.addEventListener('error',event=>fail(event.error));window.addEventListener('unhandledrejection',event=>fail(event.reason));
const api=async(path,method='GET')=>{
 if(method!=='GET')throw Error('Fixture blocks writes: '+method);
 if(path.endsWith('/outfits'))return {equipped:'default',owned:['default'],blocked:[],balance:{S:0,G:0},outfits:JUMP_OUTFITS};
 return {version:VERSION,seed:"iphone-qa-1234",open:false,remaining:0,dailyLimit:3,best:null,ranking:[],members:[],personal:[],players:[],participantRanking:[],participated:false};
};
mount(document.querySelector('main'),{crew:'fixture-crew',viewer:'fixture-user',api,esc});
</script>'''

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_GET(self):
        path = self.path.split('?',1)[0]
        if path == '/jump-test.html':
            data=HTML.encode(); self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        if path == '/crew-jump-core.js':
            data=(ROOT.parent / 'shared/crew-jump.js').read_bytes(); self.send_response(200); self.send_header('Content-Type','text/javascript'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        if path in ['/crew-jump-view.js','/crew-jump-core.js','/crew-jump.css','/user-nickname.js'] or (path.startswith('/crew-jump-art/') and '..' not in path):
            return super().do_GET()
        self.send_error(404)
    def do_POST(self): self.send_error(405, 'Fixture blocks writes')

ThreadingHTTPServer(('127.0.0.1',4188),Handler).serve_forever()
