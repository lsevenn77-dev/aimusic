import {JUMP_OUTFITS,DEFAULT_OUTFIT} from './outfits.js';

export function mountOutfitShop(dialog,{api,url,esc,onChange=()=>{}}){
 const $=selector=>dialog.querySelector(selector),abort=new AbortController();
 let wardrobe=null,selected=DEFAULT_OUTFIT,busy=false,dead=false;
 const format=value=>Number(value).toLocaleString('ko-KR');
 const note=message=>{$('[data-shop-status]').textContent=message;};
 function render(){
  const focused=dialog.ownerDocument?.activeElement?.dataset?.look;
  const look=JUMP_OUTFITS.find(item=>item.id===selected)||JUMP_OUTFITS[0];
  const owned=wardrobe?.owned.includes(look.id),equipped=wardrobe?.equipped===look.id,blocked=wardrobe?.blocked.includes(look.id);
  $('[data-shop-balance]').textContent=wardrobe?'실버 '+format(wardrobe.balance.S)+' S · 골드 '+format(wardrobe.balance.G)+' G':'잔액을 확인하는 중…';
  $('.arc-look-shelves').innerHTML=['S','G'].map(unit=>'<section class="arc-outfit-group"><h3>'+(unit==='S'?'실버 의상':'골드 의상')+'</h3><div>'+JUMP_OUTFITS.filter(item=>item.unit===unit).map(item=>{
   const state=wardrobe?.equipped===item.id?'착용 중':wardrobe?.owned.includes(item.id)?'보유 중':wardrobe?.blocked.includes(item.id)?'사용 불가':format(item.price)+' '+item.unit;
   return '<button type="button" class="arc-look" data-look="'+item.id+'" aria-pressed="'+(selected===item.id)+'" '+(busy?'disabled':'')+'><img src="'+item.image+'" width="160" height="205" alt=""><b>'+esc(item.name)+'</b><span>'+state+'</span></button>';
  }).join('')+'</div></section>').join('');
  const model=$('.arc-run-model');model.dataset.outfit=look.id;model.style.backgroundImage='url("'+(look.sprite||look.image)+'")';
  $('[data-look-name]').textContent=look.name;
  $('[data-look-price]').textContent=look.id===DEFAULT_OUTFIT?'기본 제공':owned?'보유 중':format(look.price)+' '+look.unit;
  const button=$('[data-look-action]'),enough=wardrobe&&wardrobe.balance[look.unit]>=look.price;
  button.disabled=busy||!wardrobe||equipped||blocked||(!owned&&!enough);
  button.textContent=busy?'처리 중…':equipped?'착용 중':blocked?'사용할 수 없는 의상':owned?'착용하기':!enough?(look.unit==='S'?'실버':'골드')+' 부족':format(look.price)+' '+look.unit+' · 구매하고 착용';
  $('[data-shop-retry]').hidden=!!wardrobe||busy;
  if(!busy&&JUMP_OUTFITS.some(item=>item.id===focused))$('[data-look="'+focused+'"]').focus();
 }
 async function refresh(selectEquipped=false){
  if(dead)return null;
  busy=true;render();note('의상 정보를 불러오는 중…');
  try{
   const result=await api(url+'/outfits','GET',undefined,{fresh:true});
   if(dead)return null;
   wardrobe=result;if(selectEquipped)selected=result.equipped;
   onChange(result);note('');return result;
  }catch(error){if(!dead){wardrobe=null;note(error.message||'의상 정보를 불러오지 못했어요.');}throw error;}
  finally{if(!dead){busy=false;render();}}
 }
 async function activate(){
  if(dead||busy||!wardrobe||$('[data-look-action]').disabled)return;
  const outfit=selected,buying=!wardrobe.owned.includes(outfit);
  busy=true;render();note('');
  try{
   const result=await api(url+'/outfits/'+(buying?'buy':'equip'),'POST',{outfit});
   if(dead)return;
   wardrobe=result;onChange(result);note(buying?'구매하고 착용했어요.':'착용했어요.');
  }catch(error){
   if(dead)return;
   // A lost purchase response can still have committed. Refresh ownership before retrying.
   try{wardrobe=await api(url+'/outfits','GET',undefined,{fresh:true});if(!dead)onChange(wardrobe);}catch{wardrobe=null;}
   if(!dead)note(error.message||'구매 상태를 다시 확인해주세요.');
  }finally{if(!dead){busy=false;render();}}
 }
 dialog.addEventListener('click',event=>{
  if(event.target.closest('[data-shop-close]'))dialog.close();
  const choice=event.target.closest('[data-look]');
  if(choice&&!busy&&JUMP_OUTFITS.some(item=>item.id===choice.dataset.look)){selected=choice.dataset.look;note('');render();}
  if(event.target.closest('[data-look-action]'))void activate();
  if(event.target.closest('[data-shop-retry]')&&!busy)void refresh().catch(()=>{});
 },{signal:abort.signal});
 return {
  get busy(){return busy;},
  open(){if(dead||dialog.open)return;dialog.showModal();if(!busy)void refresh(true).catch(()=>{});},
  refresh,
  destroy(){dead=true;abort.abort();if(dialog.open)dialog.close();}
 };
}
