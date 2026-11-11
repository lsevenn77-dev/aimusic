const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app/android/app/src/main/java/kr/co/aifect/app/MobileExperienceActivity.kt'),'utf8');
const js=source.split('val roomBehavior="""')[1]?.split('""".trimIndent()')[0];
const css=source.split('val roomCss="""')[1]?.split('""".trimIndent()')[0];
assert.ok(js&&css,'Room JS and CSS must exist');
for(const sku of ['navy','sunset','night'])assert.ok(css.includes('[data-background="'+sku+'"]'),sku);
assert.ok(css.includes('#main .voice-room[data-voice-room][data-paid-theme]'));
assert.ok(css.includes('#player,body>.player{display:none!important}'),'hidden website player must not occupy room space');
assert.ok(css.includes('--room-pad-end:8px!important'),'native app should not reserve a second navigation bar');
assert.ok(css.includes('height:100dvh!important'),'room should use the whole WebView viewport');
assert.ok(css.includes(':not([data-room-keyboard])'),'keyboard must retain native viewport handling');
assert.ok(css.includes('padding-bottom:0!important'),'composer panel must not double-pad bottom');
const asset='/assets/themes/v20261028/theme_aurora_night/background-mobile.webp';
let theme={sku:'theme_aurora_night',assets:{roomMobile:asset},expires_at:4010000000,server_now:1794243600};
let count=0,observer;const styles=new Map();
const root={dataset:{voiceRoom:'room_42',background:'navy'},style:{
 setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)}};
const window={addEventListener(){}},document={documentElement:{},hidden:false,
 querySelector:s=>s==='.voice-room[data-voice-room]'?root:null,addEventListener(){}};
const sandbox={window,document,MutationObserver:class{constructor(fn){observer=fn}observe(){}},
 fetch:async(url,opts)=>{assert.equal(url,'/api/voice/rooms/room_42/theme');assert.equal(opts.cache,'no-store');count++;return {ok:true,json:async()=>({theme})}},
 console:{warn:()=>{}},setTimeout,clearTimeout,setInterval:()=>1,Date,URL,location:{origin:'https://aifect.co.kr'}};
vm.runInNewContext(js,sandbox);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await pause(45);
 assert.ok(count>0);assert.equal(root.dataset.paidTheme,'theme_aurora_night');
 assert.ok(styles.get('background-image')?.includes(asset));
 theme={sku:'sunset',assets:null,expires_at:0,server_now:1794243600};
 root.dataset.themeSku='sunset';root.dataset.background='sunset';
 observer([{type:'attributes',target:root,attributeName:'data-background'}]);
 await pause(175);
 assert.equal(root.dataset.mobileThemeApplied,'sunset');
 assert.equal(root.dataset.paidTheme,undefined);
 assert.equal(styles.get('background-image'),undefined);
 theme={sku:'theme_aurora_night',assets:{roomMobile:asset},expires_at:1794243500,server_now:1794243600};
 window.__aifectMobileRoomThemeSync.refresh(0);
 await pause(35);
 assert.equal(root.dataset.paidTheme,undefined);
 assert.equal(styles.get('background-image'),undefined);
 // A future CDN image and an as-yet-unknown product ID need no APK changes.
 theme={sku:'theme_future_2027',assetPaths:{roomMobile:'https://cdn.aifect.example/themes/new-2027.webp?v=42'},expires_at:4010000000,server_now:1794243600};
 window.__aifectMobileRoomThemeSync.refresh(0);
 await pause(35);
 assert.equal(root.dataset.paidTheme,'theme_future_2027');
 assert.ok(styles.get('background-image').includes('https://cdn.aifect.example/themes/new-2027.webp?v=42'));
 theme={sku:'theme_future_2027',assets:{roomMobile:'http://unsafe.example.com/evil.png'},expires_at:4010000000,server_now:1794243600};
 window.__aifectMobileRoomThemeSync.refresh(0);
 await pause(35);
 assert.equal(root.dataset.paidTheme,undefined);
 console.log('PASS: server-driven room images (including new CDN paths), free switching and safety');
})().catch(e=>{console.error(e);process.exitCode=1});
