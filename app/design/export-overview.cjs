// Compose original Android captures into review boards without altering their content.
const sharp=require('sharp');
const fs=require('node:fs');
const path=require('node:path');
const boards={
 'overview.png':{title:'ANDROID UI / iOS HANDOFF',items:[['HOME','native-new-home.png'],['COMMUNITY','native-new-community.png'],['SING','native-sing.png'],['DIRECT MESSAGE','native-social-dm-photo-profile.png'],['CREW CHAT','native-social-crew-chat-first.png'],['MY PROFILE','native-polish-my-photo.png']]},
 'recording-flow.png':{title:'RECORDING / DUET / POST PRODUCTION',items:[['DUET PARTS','duet-editor-native.png'],['LYRICS + NEXT TURN','lyrics-duet-next-own-turn.png'],['SOUND SETTINGS','studio-sound.png'],['REVERB SETTINGS','studio-reverb.png'],['SYNC + BALANCE','studio-post-refined-top.png'],['SAVE + PUBLISH','studio-post-refined-bottom.png']]}
};
(async()=>{
 for(const [filename,board] of Object.entries(boards)){
  const width=1648,height=780,images=[];
  const labels=board.items.map(([label],i)=>`<text x="${44+i*264}" y="152" fill="#8EDDD2" font-family="Arial,sans-serif" font-size="14" font-weight="bold">${String(i+1).padStart(2,'0')}  ${label}</text>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#10131B"/><text x="240" y="70" fill="#F3F6F8" font-family="Arial,sans-serif" font-size="28" font-weight="bold">${board.title}</text><text x="240" y="101" fill="#A6ADBA" font-family="Arial,sans-serif" font-size="15">2026.10.07 · Native Android captures · Local sample data · 390dp</text>${labels}<text x="44" y="748" fill="#A6ADBA" font-family="Arial,sans-serif" font-size="14">Actual Android screens for design parity. Import assets and follow app/design/README.md in the iOS project.</text></svg>`;
  images.push({input:await sharp(path.join(__dirname,'brand/aifect-wordmark.svg')).resize(156,38).png().toBuffer(),left:44,top:44});
  for(let i=0;i<board.items.length;i++)images.push({input:await sharp(path.join(__dirname,'screens',board.items[i][1])).resize({width:240}).png().toBuffer(),left:44+i*264,top:174});
  fs.writeFileSync(path.join(__dirname,filename),await sharp(Buffer.from(svg)).composite(images).png().toBuffer());
 }
 console.log('Exported two boards from 12 original Android captures.');
})().catch(error=>{console.error(error);process.exitCode=1});
