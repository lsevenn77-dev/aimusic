import play from './eslint.play.config.mjs';
export default [{...play[0],files:['dist/song-covers.js','server/song-covers.js','tests/song-cover-list.test.mjs','tests/preview-song-covers.mjs']}];
