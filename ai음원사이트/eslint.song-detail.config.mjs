import base from './eslint.play.config.mjs';
export default [{...base[0],files:['dist/song-detail.js','tests/song-detail.test.mjs','tests/preview-song-detail.mjs','tests/song-detail-qa.js']}];
