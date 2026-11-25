import {currencyAmount} from '../../shared/currency.js';
import {rearPreview} from './arcade.js';

const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
const front=id=>new URL('./front-v2/'+id+'.webp',import.meta.url).href;
function model(id,view){
  if(view==='rear')return rearPreview(id);
  const im=new Image();im.src=front(id);im.alt='';im.decoding='async';return im;
}
export function createShowroom(cars,changeCar,refresh){
  const $=id=>document.getElementById(id), dialog=$('garageDialog'), opener=$('garageOpen');
  const garage=$('garage'),status=$('garageStatus');
  const wallet=make('div','garage-wallet'), label=make('strong','','보유 재화'), amounts=make('span','wallet-amounts');
  wallet.setAttribute('role','status'); wallet.append(label,amounts);status.before(wallet);
  const format=n=>n.toLocaleString('ko-KR');
  let state,selected=cars[0].id,view='front';
  const featured=make('section','garage-stage'),picture=make('div','stage-car');
  const info=make('div','stage-info'),caption=make('small','','선택한 차량'),name=make('h3'),speed=make('p','stage-speed');
  info.append(caption,name,speed);featured.append(picture,info);
  const views=make('div','garage-views');views.setAttribute('role','group');views.setAttribute('aria-label','차량 보기');
  const viewButtons=new Map();
  for(const [key,title] of [['front','앞모습'],['rear','주행 뒷모습']]){
    const b=make('button','',title);b.type='button';b.onclick=()=>{view=key;paint();};viewButtons.set(key,b);views.append(b);
  }
  garage.before(featured,views);
  const controls=new Map(),action=make('button','act garage-action');action.type='button';
  for(const c of cars){
    const b=make('button','carcard');b.type='button';b.dataset.car=c.id;
    const th=make('span','thumb'),nm=make('span','nm',c.name),stat=make('small','car-speed');
    stat.textContent=(280+c.speedBonus)+' km/h (+'+c.speedBonus+')';
    b.append(th,nm,stat);b.onclick=()=>{selected=c.id;status.textContent='';paint();};controls.set(c.id,b);garage.append(b);
  }
  garage.setAttribute('role','group');garage.setAttribute('aria-label','차량 선택 · 최고속도');
  const footer=dialog.querySelector('.cgl-store-note');footer.before(action);
  function paint(){
    if(!state)return;
    const c=cars.find(x=>x.id===selected),on=c.id===state.carId,owned=state.owned.has(c.id);
    picture.replaceChildren(model(c.id,view));name.textContent=c.name;caption.textContent=on?'장착 중':owned?'보유 차량':'미보유 차량';
    speed.textContent='최고속도 '+(280+c.speedBonus)+' km/h (+'+c.speedBonus+')';
    for(const [key,b] of viewButtons)b.setAttribute('aria-pressed',String(view===key));
    for(const row of cars){
      const b=controls.get(row.id);b.setAttribute('aria-pressed',String(row.id===c.id));b.classList.toggle('on',row.id===state.carId);
      b.setAttribute('aria-label',row.name+' · 최고속도 '+(280+row.speedBonus)+' km/h, +'+row.speedBonus+(row.id===state.carId?' · 장착 중':''));
      if(b.dataset.view!==view){b.firstChild.replaceChildren(model(row.id,view));b.dataset.view=view;}
    }
    const balance=state.balance;
    if(balance){
      amounts.innerHTML=currencyAmount(balance.S,'S',{size:20})+' · '+currencyAmount(balance.G,'G',{size:20});
    }else amounts.textContent=state.walletPhase==='error'?'잔액 확인 실패':state.signedIn===false?'로그인 후 확인':'잔액 확인 중…';
    const missing=!owned&&balance?Math.max(0,c.price-balance[c.currency]):0;
    action.textContent=on?'장착 중':owned?'장착하기':c.price.toLocaleString('ko-KR')+ ' '+c.currency.toLowerCase()+(missing?' · '+format(missing)+ ' '+c.currency.toLowerCase()+' 부족':' · 구매하기');
    action.disabled=state.busy||on||!state.signedIn||(!owned&&(!balance||missing>0));
    action.onclick=()=>changeCar(owned?'equip':'buy',c,action);
  }
  opener.onclick=()=>{selected=state.carId;view='front';paint();dialog.showModal();dialog.querySelector('.cgl-store-scroll').scrollTop=0;refresh();};
  $('garageClose').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  dialog.addEventListener('close',()=>opener.focus());
  return {update(next){state=next;const c=cars.find(x=>x.id===state.carId);$('equippedCarName').textContent=c.name;$('equippedCarImage').src=front(c.id);if(!dialog.open)selected=c.id;paint();},focusSelection(){controls.get(selected)?.focus({preventScroll:true});}};
}
