import play from './eslint.play.config.mjs';
export default [{...play[0],files:['dist/home.js','tests/home.test.mjs','tests/home-qa.js','tests/preview-home.mjs']}];
