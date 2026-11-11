import {buildPublicImageAssets} from './public-image-assets.mjs';
import {buildOrigin} from '../ops/cafe24/build-origin.mjs';
import {builtinModules} from 'node:module';
import { build } from 'esbuild';
import { mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {businessFooterHTML} from '../shared/site-info.js';
import {pathToFileURL} from 'node:url';
import {bundleClient} from './client-bundle.mjs';
import {regionTokenCSS} from './ui-region-tokens.mjs';
import {readdir} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});
await mkdir('dist/client',{recursive:true});
// Shop banners supplied by the owner; public/ maps to the static URL root.
await cp('public/images/shop','dist/client/images/shop',{recursive:true});
await build({entryPoints:['shared/room-backing-worklet.js'],outfile:'dist/client/room-backing-worklet.js',bundle:true,format:'esm',target:'es2022'});
for(const file of ['room-release.css','room-bubbles.css','room-release.js','room-layout.js'])await cp('dist/'+file,'dist/client/'+file);
await build({entryPoints:['shared/chat-stickers.js'],outfile:'dist/client/chat-stickers.js',bundle:true,format:'iife',globalName:'AifectStickers',target:'es2022',minify:true});
await cp('dist/chat-stickers.css','dist/client/chat-stickers.css');
for(const file of ['chat-ui.js','chat-ui.css','messages-ui.js','messages-ui.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('shared/public-image-client.js', 'dist/client/public-image-client.js');
await cp('shared/crew-jump.js','dist/client/crew-jump-core.js');
for(const name of ['crew-game-lobby.js','crew-game-lobby.css','crew-jump-view.js','crew-jump.css','crew-jump-art','crew-rhythm','crew-racing','crew-fishing'])await cp('dist/'+name,'dist/client/'+name,{recursive:true});
for(const file of ['artist-fanpage.js','artist-fanpage.css'])await cp('dist/'+file,'dist/client/'+file);
for(const file of ['mobile-input.js','mobile-input.css'])await cp('dist/'+file,'dist/client/'+file);
for(const file of ['decorations.js','decoration-display.js','decorations.css','shop.css','shop-dialog.css','microphone-check.js','microphone-check.css','play-page.js','play-page.css'])await cp('dist/'+file,'dist/client/'+file);
for(const file of ['image-crop.js','crew-photo.js','crew-heif.js','crew-heif-worker.js','profile-collections.js','crew-integrated.js','crew-settings.js','integrated.css','profile-preview.js','profile-preview.css','mypage.js','mypage.css','profile-management.js'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/voice-room-template.js','dist/client/voice-room-template.js');
await cp('dist/account-deletion.js','dist/client/account-deletion.js');
await cp('dist/room-entry.css','dist/client/room-entry.css');
await cp('dist/voice-audio.js','dist/client/voice-audio.js');
await cp('dist/room-audio-session.js','dist/client/room-audio-session.js');
await cp('dist/selection-states.css','dist/client/selection-states.css');
await cp('dist/page-tabs.css','dist/client/page-tabs.css');
for(const file of ['voice-rooms.js','voice-rooms.css','voice-room-design.css','voice-room-controls.js','voice-diagnostics.js','live-karaoke.js','live-karaoke.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/music-card-controls.css','dist/client/music-card-controls.css');
await cp('dist/song-sidebar.css','dist/client/song-sidebar.css');
for(const file of ['song-covers.js','song-covers.css'])await cp('dist/'+file,'dist/client/'+file);
for(const file of ['song-detail.js','song-detail.css'])await cp('dist/'+file,'dist/client/'+file);
for(const file of ['dubbing-casting.js','dubbing-casting.css','dubbing-community.js','dubbing.js','dubbing.css','dubbing-rewarded.js','dubbing-recording.js'])await cp(`dist/${file}`,`dist/client/${file}`);
for(const file of ['mobile-ux.js','mobile-ux.css','player-shell.js','player-shell.css','public-music.css','design-system.css','design-system.js'])await cp(`dist/${file}`,`dist/client/${file}`);
await cp('dist/footer-layout.js','dist/client/footer-layout.js');
for(const file of ['mobile-topbar.js','mobile-topbar.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/unified-ui.css','dist/client/unified-ui.css');
for(const file of ['unified-search.js','unified-search.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/list-actions.css','dist/client/list-actions.css');
await cp('dist/icon-style-lock.css','dist/client/icon-style-lock.css');
await cp('dist/icon-feedback.css','dist/client/icon-feedback.css');
await cp('dist/popup-close.css','dist/client/popup-close.css');
await cp('dist/popup-layout.css','dist/client/popup-layout.css');
for(const file of ['popup-design-system.css','popup-commerce-design.css','popup-room-design.css','room-popup-layout.css','popup-game-design.css','sing-popup-design.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/room-create.css','dist/client/room-create.css');
await cp('dist/room-interior.css','dist/client/room-interior.css');
for(const file of ['user-nickname.js','profile-editor.js','profile-editor.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/uiux-space.css','dist/client/uiux-space.css');
await cp('dist/main-layout.css','dist/client/main-layout.css');
for(const file of ['scroll-top.js','scroll-top.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/message-notification.css','dist/client/message-notification.css');
await cp('dist/secondary-pages.css','dist/client/secondary-pages.css');
for(const file of ['management-design.css','account-design.css','membership-design.css','payout-design.css','gold-design.css','rewards-design.css','inventory-design.css','upload-design.css','notifications-design.css','sing-design.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/app-ads.txt','dist/client/app-ads.txt');
await cp('dist/artist-gallery.js','dist/client/artist-gallery.js');
for(const file of ['artist-directory.js','artist-directory.css'])await cp('dist/'+file,'dist/client/'+file);
for(const file of ['page-redesign.js','page-redesign.css','community-feed.css','gift-dashboard.css'])await cp('dist/'+file,'dist/client/'+file);
for(const file of ['release-refinements.js','release-refinements.css','notifications.js','notifications.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/social-layouts.js','dist/client/social-layouts.js');
await cp('dist/page-atmosphere.css','dist/client/page-atmosphere.css');
for(const file of ['diamonds.js','player-progress.css','player-progress.js','design-surfaces.css','music-classification.js','music-classification.css','chat-features.js','october-polish.css','canonical-origin.js','music-ui.js','music-experience.css','brand-refinement.css','account-settings.js','social-chat.js','recorder-worklet.js','improvements.js','improvements.css','recording-studio.css','recording-workspace.css','duet-lyrics.css','sing-drafts.js','sing-key.js','sing-effects.js','sing-punch.js','singing-hub.js','singing-hub.css','ads.txt','audio-ads.js','audio-ads.css','upload-ads.js','upload-ads.css','gifts.js','gifts.css','image-upload.js'])await cp(`dist/${file}`,`dist/client/${file}`);
// Delete the replaced, generated display-ad assets from incremental builds.
for(const file of ['web-ads.js','web-ads.css','sing-tune.js'])await rm(`dist/client/${file}`,{force:true});
await cp('dist/billing.js','dist/client/billing.js');
await cp('dist/gold-checkout.js','dist/client/gold-checkout.js');
for(const file of ['payment-checkout.js','payment-checkout.css'])await cp('dist/'+file,'dist/client/'+file);
for(const file of ['gold-payment-checkout.js','gold-payment-checkout.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/motion.js','dist/client/motion.js');
await cp('dist/motion.css','dist/client/motion.css');
await cp('dist/home.js','dist/client/home.js');
await cp('dist/home-content.css','dist/client/home-content.css');
await cp('dist/chart-ui.css','dist/client/chart-ui.css');
await cp('dist/input-controls.css','dist/client/input-controls.css');
for(const file of ['dropdown.js','dropdown.css'])await cp('dist/'+file,'dist/client/'+file);
await cp('dist/brand.css','dist/client/brand.css');
for(const file of ['admin.css','admin.js','admin-ai-bots.js','admin-cover-compression.js'])await cp(`dist/${file}`,`dist/client/${file}`);
await mkdir('dist/client/admin',{recursive:true});
await cp('dist/admin.html','dist/client/admin/dashboard.html');
await rm('dist/client/admin.html',{force:true});
for (const file of ['inventory.js','inventory.css','music-library.js','music-library.css','menu-integration.js','follow-management.js','follow-management.css','community-v3.js','community-v3.css','player-queue.css','community.js','community.css','polish.css','browse.js','browse.css','app.js','media-session.js','icons.js','views.js','studio.js','studio-manager.js','studio-manager.css','karaoke.js','lyrics.js','library.js','explorer.js','membership.js','alignment.js','actions.js','style.css','studio.css','lyrics.css','discovery.css','explorer.css','membership.css','alignment.css','policies.css','assets']) await cp(`dist/${file}`,`dist/client/${file}`,{recursive:true});
const indexHTML=(await readFile('dist/index.html','utf8')).replace('<!--INITIAL_RENDER_HEAD-->', '<style>'+await readFile('dist/render-state.css','utf8')+'</style><script>'+await readFile('dist/render-state.js','utf8')+'</script>');
await cp('dist/ui-region-scale.css','dist/client/ui-region-scale.css');
await cp('dist/gift-scale.css','dist/client/gift-scale.css');
await cp('dist/sing-recording-scale.css','dist/client/sing-recording-scale.css');
for(const name of await readdir('dist/client')){
 // Shared chat controls, singing presentation and popup roles use final CSS pixels. Their feature
 // geometry and the verified 20/15/14/13px popup type scale must not be remapped.
 if(!name.endsWith('.css')||name.startsWith('aifect-app-')||['ui-region-scale.css','scroll-top.css','room-release.css','room-bubbles.css','room-interior.css','chat-ui.css','messages-ui.css','page-tabs.css','sing-design.css','popup-design-system.css','popup-commerce-design.css','popup-room-design.css','room-popup-layout.css','popup-game-design.css','sing-popup-design.css'].includes(name))continue;
 const file='dist/client/'+name;
 await writeFile(file,regionTokenCSS(await readFile(file,'utf8')));
}
if(!indexHTML.includes('<!--BUSINESS_FOOTER-->'))throw new Error('Business footer placeholder is missing');
await build({entryPoints:['shared/playlist-policy.js'],outfile:'dist/client/playlist-policy.js',bundle:true,format:'iife',globalName:'AifectPlaylist',target:'es2022',minify:true});
await build({entryPoints:['shared/player.js'],outfile:'dist/client/player-core.js',bundle:true,format:'iife',globalName:'AifectPlayer',target:'es2022',minify:true});
await build({entryPoints:['shared/dubbing.js'],outfile:'dist/client/dubbing-core.js',bundle:true,format:'iife',globalName:'AifectDubbing',target:'es2022',minify:true});
await build({entryPoints:['shared/dubbing-reward-player.js'],outfile:'dist/client/dubbing-reward-core.js',bundle:true,format:'iife',globalName:'AifectDubbingRewards',target:'es2022',minify:true});
await build({entryPoints:['shared/gifts.js'],outfile:'dist/client/gifts-core.js',bundle:true,format:'iife',globalName:'AifectGifts',target:'es2022',minify:true});
await build({entryPoints:['shared/site-info.js'],outfile:'dist/client/site-info.js',bundle:true,format:'iife',globalName:'AifectSite',target:'es2022',minify:true});
await build({entryPoints:['shared/genres.js'],outfile:'dist/client/genres-core.js',bundle:true,format:'iife',globalName:'AifectGenres',target:'es2022',minify:true});
await build({entryPoints:['shared/alignment.js'],outfile:'dist/client/alignment-core.js',bundle:true,format:'iife',globalName:'AifectAlignment',target:'es2022',minify:true});
await build({entryPoints:['shared/queue.js'],outfile:'dist/client/queue-core.js',bundle:true,format:'iife',globalName:'AifectQueue',target:'es2022',minify:true});
await build({entryPoints:['shared/audio-ads.js'],outfile:'dist/client/audio-ads-core.js',bundle:true,format:'iife',globalName:'AifectAudioAdsCore',target:'es2022',minify:true});
await build({entryPoints:['shared/pitch-worker.js'],outfile:'dist/client/pitch-worker.js',bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'eof',banner:{js:'/*! Pitch engine: SoundTouchJS 2.1.1 (MPL-2.0). License and source: /third-party/SoundTouchJS-NOTICE.txt */'}});
await build({entryPoints:['shared/backing-worklet.js'],outfile:'dist/client/backing-worklet.js',bundle:true,format:'esm',target:'es2022',minify:true,legalComments:'eof',banner:{js:'/*! Pitch engine: SoundTouchJS 2.1.1 (MPL-2.0). License and source: /third-party/SoundTouchJS-NOTICE.txt */'}});
await cp('dist/third-party','dist/client/third-party',{recursive:true});
await cp('dist/vendor/heif','dist/client/vendor/heif',{recursive:true});
await cp('dist/crew-webp.js','dist/client/crew-webp.js');
const crewEncoderPackage='node_modules/@jsquash/webp/';
const crewEncoderOutput='dist/client/vendor/crew-webp/';
await mkdir(crewEncoderOutput,{recursive:true});
for(const file of ['codec/enc/webp_enc.js','codec/enc/webp_enc.wasm','meta.js','LICENSE','codec/LICENSE.codec.md']){
 await cp(crewEncoderPackage+file,crewEncoderOutput+file.split('/').pop());
}
await build({entryPoints:['shared/vocal-render-worker.js'],outfile:'dist/client/vocal-render-worker.js',bundle:true,format:'iife',target:'es2022',minify:true});
await build({entryPoints:['shared/vocal-worklet.js'],outfile:'dist/client/vocal-worklet.js',bundle:true,format:'esm',target:'es2022',minify:true});
await build({entryPoints:['shared/duet-guide.js'],outfile:'dist/client/duet-guide-core.js',bundle:true,format:'iife',globalName:'AifectDuetGuide',target:'es2022',minify:true});
await build({entryPoints:['shared/karaoke-audio.js'],outfile:'dist/client/karaoke-core.js',bundle:true,format:'iife',globalName:'AifectKaraoke',target:'es2022',minify:true});
await cp('dist/cover-export.js','dist/client/cover-export.js');
// These immutable filenames live in a versioned folder on the static asset host.
// Keep the source copies outside dist, since Sites packages the entire dist tree.
await cp('assets/products/bunnies-v1','dist/client/assets/products/bunnies-v1',{recursive:true});
await build({entryPoints:['shared/cover-mp3-worker.js'],outfile:'dist/client/cover-mp3-worker.js',bundle:true,format:'esm',target:'es2022',external:['./third-party/lamejs-1.2.7/lamejs.js']});
await build({entryPoints:['shared/lyrics.js'],outfile:'dist/client/lyrics-core.js',bundle:true,format:'iife',globalName:'AifectLyrics',target:'es2022',minify:true});
// Sites serves matching static assets before the Worker. Keep the app shell at
// a non-index path so / and /index.html always reach the live catalog renderer.
// A .txt asset avoids HTML canonical redirects when fetched through ASSETS.
await writeFile('dist/client/aifect-shell.txt',await bundleClient((await buildPublicImageAssets(indexHTML)).replace('<!--BUSINESS_FOOTER-->',businessFooterHTML()),pathToFileURL(resolve('dist/client')+sep)));
for(const file of ['nickname-profile-host.js','profile-embed.js'])await cp('dist/'+file,'dist/client/'+file);
await writeFile('dist/client/aifect-profile-shell.txt',(await readFile('dist/client/aifect-shell.txt','utf8')).replace('<head>','<head><script src="/profile-embed.js"></script>'));
await rm('dist/client/_headers',{force:true}); // Remove the obsolete generated asset rules on incremental builds.
await rm('dist/client/index.html',{force:true});
await rm('dist/client/profile-popup.html',{force:true});
const originRevision=await buildOrigin();
await build({define:{__CAFE24_BUILD__:JSON.stringify(originRevision)},entryPoints:['server/index.js'], outfile:'dist/server/index.js', bundle:true, format:'esm', platform:'neutral', mainFields:['module','main'], alias:{'node-fetch':resolve('server/apple-fetch.js')}, banner:{js:"import {createRequire as appleCreateRequire} from 'node:module'; const require=appleCreateRequire('/aifect-worker.js');"}, target:'es2022', external:['cloudflare:workers',...builtinModules,...builtinModules.map(x=>'node:'+x)], minify:false});
await mkdir('dist/.openai',{recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
// Replace generated migration output: renamed source files must never remain in a release archive.
const migrationOutput=resolve('dist/.openai/drizzle'),metadataRoot=resolve('dist/.openai');
if(!migrationOutput.startsWith(metadataRoot+sep))throw new Error('Migration output is outside the build directory');
await rm(migrationOutput,{recursive:true,force:true});
await cp('drizzle',migrationOutput,{recursive:true});
// Asset-first routing now works without a host-specific run_worker_first override.
await writeFile('dist/server/wrangler.json',JSON.stringify({main:'index.js',compatibility_date:'2026-09-01',assets:{directory:'../client',binding:'ASSETS'}}));
