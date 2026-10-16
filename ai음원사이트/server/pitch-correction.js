import {json} from './db.js';
export async function pitchCorrectionRoute(req,env,path,user){
 if(!path.startsWith('/api/pitch-correction'))return null;
 return json({error:'음정보정 기능은 더 이상 제공하지 않습니다.'},410);
}
