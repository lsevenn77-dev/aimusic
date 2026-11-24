import {withSourceCookie} from './signup-source.js';
import {queueLibraryMigration} from './library-migration.js';
import {playlistsRoute} from './playlists.js';
import {myBoxesRoute} from './my-boxes.js';
import {queueWelcomeCampaign,welcomeNoticeRoute} from './welcome-notices.js';
import {cspReport} from './csp-report.js';
import {imageOriginRequest,imageExportRequest} from './image-mirror.js';
import {recordVisit,pruneVisits} from './visitors.js';
import {publicPath,tryPublicOrigin} from './cafe24-origin.js';
import {brandAliases,brandPublicDocument} from '../shared/web-brand.js';
import {publicDiscoveryRoute} from './public-discovery.js';
import {aboutPresentation} from './about-presentation.js';
import {guidePresentation,isGuidePath} from './guide-pages.js';
import {queueLyricAnalysis,runLyricBatch,lyricAnalysisAdmin} from './lyric-analysis.js';
import {followManagement} from './follow-management.js';
import {expireDubbingCombinations} from './dubbing-casting.js';
import {artistFanpageRoute} from './artist-fanpage.js';
import {giftCheckoutRoute} from './gift-checkout.js';
import {aiBotsRoute,runBotEngine,queueBotHeartbeat} from './ai-bots.js';
import {coverCompressionAdmin} from './cover-compression.js';
import {syncCrewGrowth,syncRecentCrewGrowth} from './crew-growth.js';
import {profileCollectionsRoute} from './profile-collections.js';
import {crewNoticeRoute} from './crew-notices.js';
import {relationRoute} from './relations.js';
import {decorationRoute} from './decorations.js';
import {giftInventoryRoute} from './gift-inventory.js';
import {fishingRoute} from './crew-fishing.js';
import {rhythmRoute} from './crew-rhythm.js';
import {racingRoute} from './crew-racing.js';
import {jumpRoute} from './crew-jump.js';
import {crewV3Route} from './crew-v3.js';
import {communityRankingRoute} from './community-rankings.js';
import {dubbingAdminRoute} from './dubbing-admin.js';
import {playRoute} from './play.js';
import {adminMcpRoute} from './admin-mcp.js';
import {dubbingReportsAdminRoute} from './dubbing-reports.js';
import {pitchCorrectionRoute} from './pitch-correction.js';
import {dubbingRoute} from './dubbing.js';
import {readProjectPoster} from './dubbing-poster.js';
import {playlistImageRoute} from './playlist-images.js';
import {musicClassificationRoute,musicClassificationInternal,classifyNext} from './music-classification.js';
import {songTagSuggestionsRoute} from './song-tag-suggestions.js';
import {profileGalleryRoute} from './profile-gallery.js';
import {artistGalleryRoute} from './artist-gallery.js';
import {publicContentContext,publicContentRequest} from './block-policy.js';
import {accountSafetyRoute,blockedContext,filterBlockedResponse,drainDeletedFiles} from './account-safety.js';
import {applePaymentRoute,appleNotification} from './apple-payments.js';
import {playerRoute,playerBackfillRoute} from './player.js';
import {profileRoute} from './profiles.js';
import {playBillingRoute,playWebhook} from './play-billing.js';
import {pushRoute,dispatchPush,retryPush} from './push.js';
import {notificationsRoute} from './notifications.js';
import {chatFeaturesRoute,queueChatImageCleanup,cleanupChatImages} from './chat-features.js';
import {socialRoute} from './social.js';
import {chatStreamRoute} from './chat-stream.js';
import {voiceRoomsRoute} from './voice-rooms.js';
import {publicUser} from './identity.js';
import {coverRankingRoute} from './cover-rankings.js';
import {commentModerationRoute} from './comment-moderation.js';
import {trackModerationRoute} from './track-moderation.js';
import {json,fail,rate,query,now,one,rows} from './db.js';
import {viewer,authRoute,hash} from './auth.js';
import {catalogRoute} from './catalog.js';
import {homeTracks,homePlaylists} from './home-shelves.js';
import {musicLibraryRoute} from './music-library.js';
import {mediaRoute,internalRoute} from './media.js';
import {membershipRoute} from './membership.js';
import {audioAdsRoute} from './audio-ads.js';
import {uploadAdsRoute} from './upload-ads.js';
import {lyricsRoute} from './lyrics.js';
import {alignmentRoute} from './alignment.js';
import {karaokeRoute} from './karaoke.js';
import {coverRoute} from './covers.js';
import {duetRoute} from './duets.js';
import {giftRoute} from './gifts.js';
import {payoutRoute} from './payouts.js';
import {adminDashboardRoute} from './admin-dashboard.js';
import {adminSessionRoute,consoleViewer,isConsoleAdmin} from './admin-session.js';
import {diamondRoute} from './diamonds.js';
import {accountPageRoute} from './account-pages.js';
import {checkoutEnabled} from './nicepay.js';
import {publicPageRoute} from './public-pages.js';
import {paymentPageRoute} from './payment-page.js';
import {tossTestCheckoutRoute} from './toss-test-checkout.js';
import {tossGoldTestCheckoutRoute} from './toss-gold-test-checkout.js';
import {goldPaymentPageRoute} from './gold-payment-page.js';
import {publicMusicRoute} from './public-music.js';
import {goldCallback,goldOrderRoute} from './gold-checkout.js';
import {billingRoute,billingWebhook,billingTick} from './billing.js';
import {observeReadRequest} from './request-timing.js';
async function fetchRequest(req,env,ctx){
 const url=new URL(req.url),path=url.pathname;
 const fishingClock=path.startsWith('/api/crew-fishing/')?{receivedTime:Date.now(),started:performance.now()}:undefined;
 try{
  queueWelcomeCampaign(req,env,ctx);
  if(url.hostname==='www.aifect.co.kr'){
   url.protocol='https:';url.host='aifect.co.kr';
   return Response.redirect(url.href,['GET','HEAD'].includes(req.method)?301:308);
  }
  if(url.hostname==='image-origin.aifect.co.kr')return await imageOriginRequest(req,env);
  if(path==='/security/csp-report')return cspReport(req);
  if(path.startsWith('/internal/image-mirror/'))return await imageExportRequest(req,env);
  if(path==='/mcp')return await adminMcpRoute(req,env);
  if(path==='/profile-popup'&&['GET','HEAD'].includes(req.method)){
   const asset=await env.ASSETS.fetch(new Request(new URL('/aifect-profile-shell.txt',url)));
   if(!asset.ok)return asset;
   return new Response(req.method==='HEAD'?null:asset.body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','content-security-policy':"frame-ancestors 'self'",'x-content-type-options':'nosniff','referrer-policy':'same-origin','x-robots-tag':'noindex, nofollow'}});
  }
  const tossTestResponse=await tossTestCheckoutRoute(req,env,path);if(tossTestResponse)return tossTestResponse;
  const tossGoldTestResponse=await tossGoldTestCheckoutRoute(req,env,path);if(tossGoldTestResponse)return tossGoldTestResponse;
  // Google sign-in is registered for the public domain, not the legacy Sites
  // address. Redirect page visits before a login flow creates domain cookies.
  if(url.hostname==='wavv-music-design-lseve.sassy-auk-0975.chatgpt.site'&&['GET','HEAD'].includes(req.method)&&!/^\/(api|media|internal)\//.test(path)){
   url.protocol='https:';url.host='aifect.co.kr';return Response.redirect(url.href,308);
  }
  if((req.method==='GET'||req.method==='HEAD')&&path.startsWith('/api/dubbing/projects/')){
   const poster=path.match(/^\/api\/dubbing\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/poster$/i);
   if(poster)return await readProjectPoster(req,env,poster[1]);
  }
  if(env.BUCKET&&ctx?.waitUntil&&(path.startsWith('/api/')||path.startsWith('/internal/')))ctx.waitUntil(drainDeletedFiles(env).catch(()=>console.error('Account file cleanup pending')));
  if(path.startsWith('/api/')||path.startsWith('/internal/'))queueChatImageCleanup(env,ctx);
  if(path==='/api/apple/notifications')return await appleNotification(req,env);
  if(path==='/api/play/notifications')return await playWebhook(req,env);
  if(path==='/api/gold/nicepay/callback')return await goldCallback(req,env);
  if(path==='/api/billing/nicepay/webhook')return await billingWebhook(req,env);
  if(path==='/internal/billing/tick')return await billingTick(req,env);
  if(path==='/internal/player/backfill')return await playerBackfillRoute(req,env);
  if(path.startsWith('/internal/music-classification/'))return await musicClassificationInternal(req,env,path);
  if(path.startsWith('/internal/')){const result=await internalRoute(req,env,path);if(result?.ok&&ctx?.waitUntil){if(path==='/internal/jobs/claim'&&req.method==='POST'){queueLibraryMigration(env,ctx);queueBotHeartbeat(env,ctx);retryPush(env,ctx);queueLyricAnalysis(env,ctx);}if(env.GEMINI_API_KEY&&(path==='/internal/jobs/claim'||path.endsWith('/finish')))ctx.waitUntil(classifyNext(env).catch(()=>console.error('Music classification pending')));if(path.endsWith('/finish')){ctx.waitUntil(dispatchPush(env).catch(()=>console.error('Participation push pending')));ctx.waitUntil(syncRecentCrewGrowth(env).catch(()=>console.error('Crew growth pending')));}}return result;}
  // Render signed-in deletion locally. The public renderer never receives a user's identity.
  if(path==='/account/delete'&&req.method==='GET'){
   const account=await viewer(req,env);if(account)return accountPageRoute(req,path,account);
  }
  if(['GET','HEAD'].includes(req.method)&&['/.well-known/assetlinks.json','/api/android/release-policy'].includes(path)){
   const data=path.startsWith('/.well-known/')?[{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:'kr.co.aifect.app',sha256_cert_fingerprints:['06:35:DF:33:94:55:E1:E8:E4:B3:6A:B0:23:BD:ED:41:9F:37:F1:DB:0B:C2:6E:9D:1B:BA:83:F7:0D:1A:8C:BF']}}]:{minimum_version_code:Math.max(1,Number.parseInt(env.ANDROID_MIN_VERSION_CODE,10)||1)};
   return new Response(req.method==='HEAD'?null:JSON.stringify(data),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  }
  if(brandAliases.has(path)&&['GET','HEAD'].includes(req.method))return Response.redirect(new URL(brandAliases.get(path),url),302);
  const songPath=path.match(/^\/song\/([\w-]+)\/?$/);
  if(songPath&&['GET','HEAD'].includes(req.method))return Response.redirect(new URL('/#song/'+songPath[1]+url.search,url),302);
  const originPage=await publicDiscoveryRoute(req,env,path)??await tryPublicOrigin(req,env,path);if(originPage)return originPage;
  const accountPage=accountPageRoute(req,path);if(accountPage)return accountPage;
  const musicResponse=await publicMusicRoute(req,env,path);if(musicResponse)return musicResponse;
  if(['/admin','/admin/','/admin.html'].includes(path))return new Response('페이지를 찾을 수 없습니다.',{status:404,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
  const publicResponse=publicPageRoute(req,path,{checkoutOpen:checkoutEnabled(env)});if(publicResponse)return publicResponse;
  const paymentResponse=paymentPageRoute(req,path);if(paymentResponse)return paymentResponse;
  const goldPaymentResponse=goldPaymentPageRoute(req,path);if(goldPaymentResponse)return goldPaymentResponse;
  if(!path.startsWith('/api/')&&!path.startsWith('/media/')){
   if(!['GET','HEAD'].includes(req.method))return json({error:'허용되지 않는 요청입니다.'},405);
   const bundle=path.match(/^\/cached-(aifect-app-[a-f0-9]{16}\.(?:js|css))$/);
   if(bundle){
    const resource=new URL('/'+bundle[1],url);
    const asset=await env.ASSETS.fetch(new Request(resource,req));
    if(!asset.ok&&asset.status!==304)return asset;
    const headers=new Headers(asset.headers);headers.set('cache-control','public, max-age=31536000, immutable');
    return new Response(asset.body,{status:asset.status,headers});
   }
   return env.ASSETS.fetch(req);
  }
  // Provider form POSTs have their own browser binding and token checks.
  const oauthCallback=/^\/api\/auth\/(google|apple)\/callback$/.test(path);
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!oauthCallback){
   const origin=req.headers.get('origin');
   if(origin!==url.origin||req.headers.get('sec-fetch-site')==='cross-site')fail(403,'사이트에서 다시 요청해주세요.');
  }
  if(path.startsWith('/api/auth/')&&!path.endsWith('/callback'))await rate(env,'auth-ip:'+await hash(req.headers.get('cf-connecting-ip')||'local'),40,900);
  const editorPayload=/^\/api\/dubbing\/editor-drafts\/[\w-]+$/.test(path);
  const maxJson=path==='/api/visits'?256:editorPayload?512*1024:path==='/api/dubbing/generations'?256*1024:path==='/api/uploads'||/^\/api\/dubbing\/projects(?:\/[^/]+)?$/.test(path)||/^\/api\/studio\/tracks\/[^/]+(?:\/lyrics\/align)?$/.test(path)?131072:32768;
  const binary=path==='/api/dubbing/projects/b7c81f9a-2182-4dc5-bcb2-6dc0aee0a899/sound/revision'||/^\/api\/dubbing\/projects\/[\w-]+\/poster$/.test(path)||/^\/api\/artists\/[\w-]+\/fanpage\/banner$/.test(path)||path==='/api/admin/ai-bots/assets'||/^\/api\/crews\/[\w-]+\/notice-images$/.test(path)||/^\/api\/dubbing\/projects\/[^/]+\/recording\/[\w-]+\/lines\/[\w-]+$/.test(path)||/^\/api\/playlists\/[\w-]+\/image$/.test(path)||/^\/api\/producers\/[\w-]+\/gallery$/.test(path)||/^\/api\/artists\/[\w-]+\/gallery$/.test(path)||/^\/api\/(dm\/[\w-]+\/images|crews\/[\w-]+\/images?)$/.test(path)||path==='/api/me/profile/image'||/^\/api\/uploads\/[^/]+\/(audio|cover|duet-instrument|duet-partner)$/.test(path)||/^\/api\/studio\/(artists|producers|tracks)\/[^/]+\/image$/.test(path)||/^\/api\/studio\/tracks\/[^/]+\/karaoke\/mr$/.test(path);
  // Some ingress requests expose an empty stream for HEAD/GET (Content-Length: 0).
  // Rebuilding those with a body throws before the public media handler runs.
  const profileMultipart=path==='/api/me/profile'&&req.method==='PUT'&&req.headers.get('content-type')?.startsWith('multipart/form-data');
  // The official producer upload handler checks the manifest digest and enforces its own byte limits.
  const officialAudioUpload=req.method==='PUT'&&/^\/api\/dubbing\/projects\/[\w-]+\/sound\/official-rebuild\/(?:manifest|asset\/[\w-]+)$/.test(path);
  if(!['GET','HEAD'].includes(req.method)&&!binary&&!profileMultipart&&!officialAudioUpload&&req.body){
   if(Number(req.headers.get('content-length')||0)>maxJson)fail(413,'요청이 너무 큽니다.');
   const reader=req.body.getReader(),chunks=[];let size=0;
   try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxJson){await reader.cancel().catch(()=>{});fail(413,'요청이 너무 큽니다.');}chunks.push(value);}}finally{reader.releaseLock();}
   const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
   req=new Request(req,{body});
  }
  if(path==='/api/visits')return await recordVisit(req,env);
  const adminSession=await adminSessionRoute(req,env,path);if(adminSession)return adminSession;
  const user=(path.startsWith('/api/admin/')?await consoleViewer(req,env):null)||await viewer(req,env);
  const welcome=await welcomeNoticeRoute(req,env,path,user);if(welcome)return welcome;
  if(path==='/api/admin/mcp/identity'){
   if(!isConsoleAdmin(user))fail(403,'기존 관리자 콘솔에 로그인해주세요.');
   if(req.method!=='GET')fail(405,'GET만 지원합니다.');
   const principal=req.headers.get('oai-authenticated-user-id');
   if(!principal)fail(401,'이 도메인에서 ChatGPT로 로그인한 뒤 다시 확인해주세요.');
   return json({principal_id:principal,registered:principal===env.AIFECT_MCP_OWNER_ID,enabled:env.AIFECT_MCP_ENABLED==='true'});
  }
  const bots=await aiBotsRoute(req,env,path,user);if(bots)return bots;
  const coverCompression=await coverCompressionAdmin(req,env,path,user);if(coverCompression)return coverCompression;
  env=await blockedContext(env,user);
  if(publicContentRequest(req,url))env=publicContentContext(env);
  // Keep the home feed in the API Worker. The public HTML renderer shares
  // catalog helpers with discovery, but must not import home candidate queries.
  if(req.method==='GET'&&url.searchParams.get('home')==='1'&&(path==='/api/discovery'||path==='/api/playlists')){
   const data=path==='/api/discovery'?await homeTracks(env,url.searchParams.get('slots')):{playlists:await homePlaylists(env,user?.id||'')};
   return await filterBlockedResponse(env,json(data));
  }
  const followPage=await followManagement(req,env,path,user);if(followPage)return followPage;
  if(path.startsWith('/api/crew-fishing/'))return await fishingRoute(req,env,path,user,Date.now(),fishingClock);
  if(path.startsWith('/api/crew-rhythm/'))return await rhythmRoute(req,env,path,user);
  if(path.startsWith('/api/crew-racing/'))return await racingRoute(req,env,path,user);
  if(path.includes('/jump')&&path.startsWith('/api/crews/')){const jump=await jumpRoute(req,env,path,user);if(jump)return jump;}
  const play=await playRoute(req,env,path,user);if(play)return play;
  const voiceResponse=await voiceRoomsRoute(req,env,path,user,ctx);if(voiceResponse)return voiceResponse;
  const dubbingReportAdmin=await dubbingReportsAdminRoute(req,env,path,user);if(dubbingReportAdmin)return dubbingReportAdmin;
  const dubbingAdmin=await dubbingAdminRoute(req,env,path,user);if(dubbingAdmin)return dubbingAdmin;
  const dubbing=await dubbingRoute(req,env,path,user);if(dubbing){if(dubbing.ok&&req.method==='POST')ctx.waitUntil(dispatchPush(env));if(dubbing.ok&&['POST','PUT','PATCH'].includes(req.method)&&user&&ctx?.waitUntil)ctx.waitUntil(syncActorCrew(env,user.id).catch(()=>console.error('Crew growth pending')));return dubbing;}
  const correction=await pitchCorrectionRoute(req,env,path,user);if(correction)return correction;
  const safety=await accountSafetyRoute(req,env,path,user);if(safety)return safety;
  const playlistImage=await playlistImageRoute(req,env,path,user);if(playlistImage)return playlistImage;
  if(path==='/api/studio'&&ctx?.waitUntil&&env.GEMINI_API_KEY)ctx.waitUntil(classifyNext(env).catch(()=>console.error('Music classification pending')));
  const lyricAdmin=await lyricAnalysisAdmin(req,env,path,user);if(lyricAdmin)return lyricAdmin;
  const tagSuggestions=await songTagSuggestionsRoute(req,env,path,user);if(tagSuggestions)return tagSuggestions;
  const classificationResponse=await musicClassificationRoute(req,env,path,user);if(classificationResponse)return classificationResponse;
  const profileGalleryResponse=await profileGalleryRoute(req,env,path,user);if(profileGalleryResponse)return profileGalleryResponse;
  const fanpageResponse=await artistFanpageRoute(req,env,path,user);if(fanpageResponse){if(fanpageResponse.ok&&req.method==='POST')ctx.waitUntil(dispatchPush(env));return fanpageResponse;}
  const galleryResponse=await artistGalleryRoute(req,env,path,user);if(galleryResponse)return galleryResponse;
  const playResponse=await playBillingRoute(req,env,path,user);if(playResponse)return playResponse;
  retryPush(env,ctx);
  const pushResponse=await pushRoute(req,env,path,user);if(pushResponse)return pushResponse;
  const notifications=await notificationsRoute(req,env,path,user);if(notifications){if(notifications.ok&&req.method==='POST')ctx.waitUntil(dispatchPush(env));return notifications;}
  const chatStream=await chatStreamRoute(req,env,path,user);if(chatStream)return chatStream;
  const adminDashboard=await adminDashboardRoute(req,env,path,user);if(adminDashboard)return adminDashboard;
  const audioAdsResponse=audioAdsRoute(req,env,path,user);if(audioAdsResponse)return audioAdsResponse;
  const uploadAdsResponse=uploadAdsRoute(req,env,path,user);if(uploadAdsResponse)return uploadAdsResponse;
  if(ctx?.waitUntil&&Math.random()<.005)ctx.waitUntil(env.DB.batch([
   query(env,'DELETE FROM sessions WHERE expires<?',now()),
   query(env,'DELETE FROM oauth_states WHERE expires<?',now()),
   query(env,'DELETE FROM rate_limits WHERE expires<?',now())
  ]).catch(()=>console.error('Expired authentication state cleanup failed')));
  const result=await playlistsRoute(req,env,path,user)||await myBoxesRoute(req,env,path,user)||await giftCheckoutRoute(req,env,path,user)||await musicLibraryRoute(req,env,path,user)||await profileCollectionsRoute(req,env,path,user)||await crewNoticeRoute(req,env,path,user)||await relationRoute(req,env,path,user)||await decorationRoute(req,env,path,user)||await giftInventoryRoute(req,env,path,user)||await playerRoute(req,env,path,user)||await chatFeaturesRoute(req,env,path,user)||await applePaymentRoute(req,env,path,user)||await profileRoute(req,env,path,user)||await crewV3Route(req,env,path,user)||await socialRoute(req,env,path,user)||await authRoute(req,env,path,user)||await billingRoute(req,env,path,user)||await membershipRoute(req,env,path,user)||await alignmentRoute(req,env,path,user)||await karaokeRoute(req,env,path,user)||await coverRoute(req,env,path,user)||await duetRoute(req,env,path,user)||await goldOrderRoute(req,env,path,user)||await giftRoute(req,env,path,user)||await communityRankingRoute(req,env,path)||await coverRankingRoute(req,env,path)||await commentModerationRoute(req,env,path,user)||await trackModerationRoute(req,env,path,user)||await diamondRoute(req,env,path,user)||await payoutRoute(req,env,path,user)||await lyricsRoute(req,env,path,user)||await catalogRoute(req,env,path,user)||await mediaRoute(req,env,path,user);
  if(result){
   if(result.ok&&['POST','PUT','PATCH'].includes(req.method)&&user&&ctx?.waitUntil&&/^\/api\/(tracks|uploads|studio|covers)/.test(path))ctx.waitUntil(syncActorCrew(env,user.id).catch(()=>console.error('Crew growth pending')));
   if(['POST','PUT','PATCH'].includes(req.method)&&result.ok&&(path.startsWith('/api/artists/')||path.startsWith('/api/crews/')||path.startsWith('/api/dubbing/')||path.startsWith('/api/dm/')||/^\/api\/(tracks|producers)\/[^/]+\/(comments|gifts)$/.test(path)||/^\/api\/me\/gift-inventory\/[\w-]+\/send$/.test(path)))ctx.waitUntil(dispatchPush(env).catch(()=>console.error('Push dispatch failed')));
   if(path.startsWith('/api/auth/')&&result.headers.get('content-type')?.includes('application/json')){
    const body=await result.clone().json();if(body.user){body.user=await publicUser(env,body.user);return new Response(JSON.stringify(body),{status:result.status,headers:result.headers});}
   }
   return req.method==='GET'&&!/^\/api\/(apple|play|gold|diamonds|billing|payout|account|me|studio)/.test(path)?await filterBlockedResponse(env,result):result;
  }
  return json({error:'페이지를 찾을 수 없습니다.'},404);
 }catch(e){
  if(!e.status)console.error(JSON.stringify({path,error:e.name,...((path.includes('/billing/')||path.includes('/gold/')||path.includes('/play/')||path.includes('/apple/'))?{}:{message:String(e.message).slice(0,300)})}));
  const status=e.status||500,message=e.status?e.message:'잠시 연결이 원활하지 않습니다. 입력 내용은 유지되니 다시 시도해주세요.';
  if(path.includes('/auth/')&&path.endsWith('/callback'))return new Response(null,{status:303,headers:{location:'/#account?error='+encodeURIComponent(message),'cache-control':'no-store'}});
  return json({error:message},status);
 }
}
async function serve(req,env,ctx){
 let response=await observeReadRequest(req,env,ctx,fetchRequest);
 if(!response.headers.get('content-type')?.startsWith('text/html'))return response;
 const pageURL=new URL(req.url);
 if(req.method==='GET' && response.ok && !/^\/(api|internal|media)(?:\/|$)/.test(pageURL.pathname)){
  response=withSourceCookie(req,response);
 }
 const headers=new Headers(response.headers);
 if(new URL(req.url).protocol==='https:')headers.set('strict-transport-security','max-age=31536000');
 // Payment documents keep their own embedding policy.
 if(!headers.has('content-security-policy')){
  headers.set('content-security-policy',"frame-ancestors 'none'");
  headers.set('content-security-policy-report-only',"default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; report-uri /security/csp-report");
 }
 const url=new URL(req.url),guide=isGuidePath(url.pathname)&&response.status===200;
 if(guide && (req.method==='GET'||req.method==='HEAD')){
  // Only this authored guide script is executable; payment documents retain their CSP.
  headers.set('content-security-policy',`default-src 'none'; script-src ${url.origin}/guide-pages.js; connect-src ${url.origin}/api/membership ${url.origin}/api/billing/status; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
 }
 if(req.method==='GET' && publicPath(url.pathname) && response.body){
  headers.delete('content-length');
  const branded=brandPublicDocument(await response.text());
  const html=guide ? guidePresentation(branded,url.pathname) : url.pathname==='/about' && response.status===200 ? aboutPresentation(branded) : branded;
  const countable=response.ok && !url.pathname.startsWith('/account/');
  if(countable){
   // Keep public documents' restrictive policies, allowing just the visit script and endpoint.
   const csp=headers.get('content-security-policy')||'';
   if(/(?:^|;)\s*default-src /.test(csp)){
    const directives=csp.split(';').map(s=>s.trim()).filter(Boolean);
    for(const [name,path] of [['script-src','/visitor.js'],['connect-src','/api/visits']]){
     const i=directives.findIndex(s=>s.startsWith(name+' '));
     const policy=i<0?directives.find(s=>s.startsWith('default-src ')):directives[i];
     const values=policy.split(/\s+/).slice(1).filter(s=>s!=="'none'");
     const value=[name,...values,url.origin+path].join(' ');
     if(i<0)directives.push(value);else directives[i]=value;
    }
    headers.set('content-security-policy',directives.join('; '));
   }
  }
  const document=countable?html.replace('</head>','<script defer src="/visitor.js"></script></head>'):html;
  return new Response(document,{status:response.status,statusText:response.statusText,headers});
 }
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {fetch:serve,async scheduled(event,env,ctx){ctx.waitUntil(pruneVisits(env));ctx.waitUntil(runLyricBatch(env));ctx.waitUntil(dispatchPush(env));ctx.waitUntil(runBotEngine(env));ctx.waitUntil(cleanupChatImages(env));ctx.waitUntil(expireDubbingCombinations(env));ctx.waitUntil(classifyNext(env));ctx.waitUntil(syncRecentCrewGrowth(env));}};

async function syncActorCrew(env,uid){const membership=await one(env,'SELECT crew_id FROM crew_members WHERE user_id=?',uid);if(membership)await syncCrewGrowth(env,membership.crew_id);}
