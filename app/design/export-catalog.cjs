// Keep the file://-friendly gallery and image hashes in sync with the checked-in catalog.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const root=__dirname;
const catalog=require('./screen-catalog.json');
(async()=>{
 const screens=[];
 for(const [file,category,title,description,source] of catalog){
  const relative='screens/'+file,bytes=fs.readFileSync(path.join(root,relative));
  const {width,height}=await sharp(bytes).metadata();
  if(width!==780||height!==1688)throw new Error(`${file}: unexpected capture dimensions ${width}x${height}`);
  screens.push({file:relative,category,title,description,source,width,height,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'capture-manifest.json'),'utf8'));
 manifest.screens=screens;
 manifest.verification.galleryScreens=screens.length;
 fs.writeFileSync(path.join(root,'capture-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const gallery=path.join(root,'index.html');
 const html=fs.readFileSync(gallery,'utf8').replace(/\r\n/g,'\n');
 const marker=/const screens = \[[\s\S]*?\];\nconst grid=/;
 if(!marker.test(html))throw new Error('Gallery catalog marker missing');
 fs.writeFileSync(gallery,html.replace(marker,'const screens = '+JSON.stringify(catalog,null,2)+';\nconst grid='));
 console.log(`Updated gallery and hashes for ${screens.length} original Android captures.`);
})().catch(error=>{console.error(error);process.exitCode=1});
