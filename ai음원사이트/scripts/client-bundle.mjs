import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';

// Keep classic script execution order and globals. Hash names invalidate only changed releases.
export async function bundleClient(html,directory){
 const scripts=[...html.matchAll(/<script\s+defer\s+src="([^"\s]+)"\s*><\/script>/g)];
 const styles=[...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"\s]+)"[^>]*>/g)].filter(m=>!/^https?:/.test(m[1]));
 const read=async match=>readFile(new URL(match[1].replace(/^\//,'').split('?')[0],directory),'utf8');
 const js=(await transform((await Promise.all(scripts.map(read))).join('\n;\n'),{loader:'js',target:'es2022',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false})).code;
 const css=(await transform((await Promise.all(styles.map(read))).join('\n'),{loader:'css',minify:true,target:'es2022'})).code;
 for(const [matches,body,extension] of [[scripts,js,'js'],[styles,css,'css']]){
  if(!matches.length)throw new Error('Missing client '+extension+' inputs');
  const filename='aifect-app-'+createHash('sha256').update(body).digest('hex').slice(0,16)+'.'+extension;
  await writeFile(new URL(filename,directory),body);
  const tag=extension==='js'?'<script defer src="/'+filename+'"></script>':'<link rel="stylesheet" href="/'+filename+'">';
  for(const [i,m] of matches.entries())html=html.replace(m[0],i===0?tag:'');
 }
 return html;
}
