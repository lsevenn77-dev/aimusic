const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app/android/app/src/main/java/kr/co/aifect/app/MobileExperienceActivity.kt'),'utf8');
const js=source.split('val roomBehavior="""')[1]?.split('""".trimIndent()')[0];
const css=source.split('val roomCss="""')[1]?.split('""".trimIndent()')[0];
assert.ok(js&&css,'Room JS and CSS must exist');
for(const sku of ['navy','sunset','night'])assert.ok(css.includes('[data-background="'+sku+'"]'),sku);
assert.ok(css.includes('#main .voice-room[data-voice-room][data-paid-theme]'));
const asset='/assets/themes/v20261028/theme_aurora_night/background-mobile.webp';
let theme={sku:'theme_aurora_night',assets:{roomMobile:asset},expires_at:4010000000,server_now:1794243600};
let count=0,observer;const styles=new Map();
const root={dataset:{voiceRoom:'room_42',background:'navy'},style:{
 setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)}};
const window={addEventListener(){}},document={documentElement:{},hidden:false,
 querySelector:s=>s==='.voice-room[data-voice-room]'?root:null,addEventListener(){}};
const sandbox={window,document,MutationObserver:class{constructor(fn){observer=fn}observe(){}},
 fetch:async(url,opts)=>{assert.equal(url,'/api/voice/rooms/room_42/theme');assert.equal(opts.cache,'no-store');count++;return {ok:true,json:async()=>({theme})}},
 console:{warn:()=>{}},setTimeout,clearTimeout,setInterval:()=>1,Date};
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
 console.log('PASS: room selector, paid image, change to free theme, expired theme cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
