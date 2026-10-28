import existing from './eslint.play.config.mjs';
export default [{...existing[0],files:['dist/mobile-input.js','dist/social-chat.js','tests/mobile-input.test.mjs','tests/chat-client-loading.test.mjs']}];
