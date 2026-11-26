// Retry keys are not credentials. Support webviews and non-secure preview contexts too.
let serial=0;
export function createRequestId(cryptoAPI=globalThis.crypto){
  if(typeof cryptoAPI?.randomUUID==='function')return cryptoAPI.randomUUID();
  if(typeof cryptoAPI?.getRandomValues==='function'){
    const bytes=cryptoAPI.getRandomValues(new Uint8Array(16));
    return 'fishing-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }
  return 'fishing-'+Date.now().toString(36)+'-'+(++serial).toString(36)+'-'+Math.random().toString(36).slice(2,14);
}
