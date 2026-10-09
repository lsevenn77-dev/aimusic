// Compose original Android captures into review boards without altering their content.
const sharp=require('sharp');
const fs=require('node:fs');
const path=require('node:path');
const boards={
 'overview.png':{title:'ANDROID 2.5.35 / iOS HANDOFF',items:[['HOME','01-home.png'],['COMMUNITY','03-community.png'],['SING','04-sing.png'],['MESSAGES','11-message-list.png'],['MY PROFILE','19-my-profile.png'],['PLAYER','09-player.png']]},
 'social-flow.png':{title:'MESSAGES / CREW / KEYBOARD',items:[['PINNED CREW','11-message-list.png'],['DIRECT MESSAGE','12-direct-message.png'],['DM KEYBOARD','13-dm-keyboard.png'],['CREW HOME','14-crew-home.png'],['CREW CHAT','17-crew-chat.png'],['CREW KEYBOARD','18-crew-keyboard.png']]},
 'profile-flow.png':{title:'PROFILE / GALLERY / GIFTS',items:[['MY PROFILE','19-my-profile.png'],['PUBLIC PROFILE','21-public-profile.png'],['DIRECT GIFT','22-person-gift.png'],['ARTIST','23-artist-profile.png'],['GALLERY','24-artist-gallery.png'],['WALLET','26-wallet.png']]},
 'recording-flow.png':{title:'RECORDING / DUET / POST PRODUCTION',items:[['DUET PARTS','31-duet-editor.png'],['LYRICS + NEXT TURN','32-recording-lyrics.png'],['SOUND SETTINGS','33-sound-settings.png'],['REVERB SETTINGS','34-reverb-settings.png'],['SYNC + BALANCE','35-post-production.png'],['SAVE + PUBLISH','36-save-recording.png']]}
};
(async()=>{
 for(const [filename,board] of Object.entries(boards)){
  const width=1648,height=780,images=[];
  const labels=board.items.map(([label],i)=>`<text x="${44+i*264}" y="152" fill="#8EDDD2" font-family="Arial,sans-serif" font-size="14" font-weight="bold">${String(i+1).padStart(2,'0')}  ${label}</text>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#10131B"/><text x="240" y="70" fill="#F3F6F8" font-family="Arial,sans-serif" font-size="28" font-weight="bold">${board.title}</text><text x="240" y="101" fill="#A6ADBA" font-family="Arial,sans-serif" font-size="15">2026.10.09 · Native Android captures · Local sample data · 390dp</text>${labels}<text x="44" y="748" fill="#A6ADBA" font-family="Arial,sans-serif" font-size="14">Actual Android screens for design parity. Import assets and follow app/design/README.md in the iOS project.</text></svg>`;
  images.push({input:await sharp(path.join(__dirname,'brand/aifect-wordmark.svg')).resize(156,38).png().toBuffer(),left:44,top:44});
  for(let i=0;i<board.items.length;i++)images.push({input:await sharp(path.join(__dirname,'screens/2.5.35',board.items[i][1])).resize({width:240}).png().toBuffer(),left:44+i*264,top:174});
  fs.writeFileSync(path.join(__dirname,filename),await sharp(Buffer.from(svg)).composite(images).png().toBuffer());
 }
 console.log('Exported four boards from current Android 2.5.35 captures.');
})().catch(error=>{console.error(error);process.exitCode=1});
