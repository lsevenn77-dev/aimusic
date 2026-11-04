const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const score=row=>Number(row?.points??row?.score??0).toLocaleString('ko-KR');

function board(title,description,records,own,kind,unit){
  const rows=records.filter(row=>Number(row.place)>0&&Number(row.place)<=100).map(row=>{
    const key=kind==='crew'?(row.crew_id||row.id):row.profile_id;
    const image=key&&row.image_version?`<img alt="" loading="lazy" decoding="async" src="/media/${kind}/${encodeURIComponent(key)}?v=${encodeURIComponent(row.image_version)}">`:'';
    return `<li class="cgl-row"><b>${Number(row.place)}</b><i class="cgl-avatar" aria-hidden="true">${esc(Array.from(row.name||'✦')[0])}${image}</i><span class="cgl-name">${esc(row.name)}${row.difficulty?`<small>${esc(row.difficulty.toUpperCase())}</small>`:''}</span><strong>${score(row)}${unit}</strong></li>`;
  }).join('');
  return `<section class="cgl-ranking"><header class="cgl-title"><h2>${title}</h2><small>TOP 100</small></header><p class="cgl-description">${esc(description)}</p><div class="cgl-scroll" tabindex="0" role="region" aria-label="${title} 최대 100위">${rows?`<ol>${rows}</ol>`:'<div class="cgl-empty"><span aria-hidden="true">✧</span>아직 공식 기록이 없어요.</div>'}</div><div class="cgl-own">${own}</div></section>`;
}

export function rankingsMarkup({crews=[],players=[],crewId,crewDescription='크루원 상위 10명의 주간 최고점 합계',playerDescription='개인별 주간 최고점',unit='점'}={}){
  unit=esc(unit);
  const team=crews.find(row=>(row.crew_id||row.id)===crewId),mine=players.find(row=>row.mine);
  return `<div class="cgl-pair">${board('크루 순위',crewDescription,crews,team?`우리 크루 ${Number(team.place)}위 · ${score(team)}${unit}`:'우리 크루 · 기록 없음','crew',unit)}${board('개인 순위',playerDescription,players,mine?`내 순위 ${Number(mine.place)}위 · ${score(mine)}${unit}`:'내 순위 · 기록 없음','producer',unit)}</div>`;
}

export function renderGameRankings(root,options){
  root.classList.add('crew-game-board');
  root.innerHTML=rankingsMarkup(options);
  for(const img of root.querySelectorAll('.cgl-avatar img'))img.addEventListener('error',()=>img.remove(),{once:true});
}
