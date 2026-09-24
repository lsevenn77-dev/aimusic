import type { CapacitorConfig } from '@capacitor/cli';

// Release builds open the live site. For testing a local dev server, build with
// AIFECT_APP_URL=http://localhost:4174 and forward the port with `adb reverse tcp:4174 tcp:4174`.
const url = process.env.AIFECT_APP_URL || 'https://aifect.co.kr';

const config: CapacitorConfig = {
  appId: 'kr.co.aifect.app',
  appName: 'AIFECT',
  webDir: 'www',
  backgroundColor: '#000000',
  appendUserAgent: 'AIFECTApp/1',
  server: {
    url,
    cleartext: url.startsWith('http://'),
    errorPath: 'offline.html',
    allowNavigation: ['aifect.co.kr', 'kauth.kakao.com', 'accounts.kakao.com', 'logins.daum.net', 'appleid.apple.com'],
  },
};

export default config;
