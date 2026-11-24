// Shared by browser and server. Do not canonicalize prohibited full-width characters.
export const NICKNAME_DAYS=30;
export const BLOCKED_NICKNAME_PARTS=['운영자','관리자','어드민','공식계정','고객센터','admin','administrator','moderator','aifect','씨발','시발','병신','개새끼','fuck','shit'];
export function nicknamePolicy(value){
 const name=typeof value==='string'?value.trim():'';
 if(name.length<2||name.length>8)return {name,error:'닉네임은 2~8자로 입력해 주세요.'};
 if(!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]+$/.test(name))return {name,error:'닉네임은 한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.'};
 const key=name.toLowerCase();
 if(BLOCKED_NICKNAME_PARTS.some(word=>key.replaceAll('_','').includes(word)))return {name,error:'운영자 사칭 또는 금지어가 포함된 닉네임은 사용할 수 없습니다.'};
 return {name,key};
}
