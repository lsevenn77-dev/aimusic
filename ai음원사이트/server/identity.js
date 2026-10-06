import {one} from './db.js';

// OAuth account names remain private. A chosen profile name takes precedence everywhere.
// Older first-cover profiles copied the OAuth name automatically. Keep stored identity intact,
// but don't publish that copy until the listener explicitly saves it as a nickname.
export const producerNameSQL=(p='p')=>`CASE WHEN ${p}.id IS NULL THEN NULL WHEN ${p}.nickname_confirmed=1 OR NOT EXISTS(SELECT 1 FROM users identity_user WHERE identity_user.id=${p}.user_id AND identity_user.provider!='email' AND identity_user.name=${p}.name) OR EXISTS(SELECT 1 FROM tracks identity_track WHERE identity_track.producer_id=${p}.id AND identity_track.kind='original') THEN ${p}.name ELSE '리스너 '||substr(${p}.user_id,1,8) END`;
export const publicNameSQL=(u='u')=>`COALESCE((SELECT ${producerNameSQL('identity_profile')} FROM producers identity_profile WHERE identity_profile.user_id=${u}.id),CASE WHEN ${u}.provider='email' THEN ${u}.name ELSE '리스너 '||substr(${u}.id,1,8) END)`;
export async function publicUser(env,user){
 if(!user)return null;
 const p=await one(env,`SELECT p.id,${producerNameSQL()} name,p.image_version FROM producers p WHERE p.user_id=?`,user.id);
 return {id:user.id,email:user.email,provider:user.provider,premium_until:user.premium_until||0,name:p?.name||(user.provider==='email'?user.name:'리스너 '+user.id.slice(0,8)),profile_id:p?.id||null,image_version:p?.image_version||''};
}
