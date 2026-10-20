(()=>{
  const app=document.getElementById('admin-app');
  if(!app||app.dataset.ready==='1')return;
  app.dataset.ready='1';

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const fmt=new Intl.NumberFormat('ko-KR');
  const money=value=>'₩'+fmt.format(Math.round(Number(value)||0));
  const num=value=>fmt.format(Math.round(Number(value)||0));
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const kstDate=seconds=>{
    if(!seconds)return '-';
    return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'2-digit',month:'2-digit',day:'2-digit'}).format(new Date(Number(seconds)*1000));
  };
  const kstDateTime=seconds=>{
    if(!seconds)return '-';
    return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(Number(seconds)*1000));
  };
  const statusName=value=>({
    active:'활성',cancelled:'해지',failed:'실패',pending:'결제대기',registering:'카드등록',review:'확인중',idle:'대기',
    scheduled:'지급예정',held:'정보대기',paid:'지급완료',removed:'삭제',dismissed:'유지'
  }[value]||value||'-');
  const state={days:7,data:null,me:null,view:'dashboard',payoutPeriod:null};

  function toast(message){
    const el=$('#admin-toast');
    el.textContent=message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>el.classList.remove('show'),2300);
  }

  async function api(url,options={}){
    const headers=new Headers(options.headers||{});
    if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
    const res=await fetch(url,{credentials:'same-origin',...options,headers});
    let body={};
    try{body=await res.json();}catch{}
    if(res.status===401&&url!=='/api/admin/login')showLogin('로그인 시간이 만료되었습니다. 다시 로그인해주세요.');
    if(!res.ok)throw new Error(body.error||'요청을 처리하지 못했습니다.');
    return body;
  }

  function showLogin(message=''){
    state.data=null;state.me=null;
    app.classList.add('locked');
    $('#admin-content').hidden=true;
    const gate=$('#access-gate');
    gate.hidden=false;
    gate.innerHTML='<form class="admin-login" id="admin-login-form">'+
      '<img src="/assets/aifect-wordmark.svg" alt="AIFECT">'+
      '<h1>관리자 로그인</h1><p>관리자 비밀번호를 입력해주세요.</p>'+
      '<label>비밀번호<input id="admin-password" name="password" type="password" autocomplete="current-password" maxlength="256" required></label>'+
      '<p id="login-error" class="login-error" role="alert">'+esc(message)+'</p>'+
      '<button class="primary-button" type="submit">로그인</button>'+
      '<a class="login-home" href="/">AIFECT 홈으로</a></form>';
    $('#admin-login-form').addEventListener('submit',async e=>{
      e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;
      $('#login-error').textContent='';
      try{
        await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:$('#admin-password').value})});
        $('#admin-password').value='';await init();
      }catch(error){$('#login-error').textContent=error.message;$('#admin-password').value='';$('#admin-password').focus();}
      finally{button.disabled=false;}
    });
  }

  function navigate(view){
    state.view=view;
    $$('.view-page').forEach(page=>page.classList.toggle('hidden',page.dataset.page!==view));
    $$('.admin-nav-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));
    if(view==='tracks')loadTrackReview();
    if(view==='moderation'){loadCommentReports();loadDubbingReports();}
    if(view==='dubbing')loadDubbing();
    if(view==='payouts')loadPayouts();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function kpiCard(icon,label,value,detail,positive=true){
    return '<article class="kpi-card"><div class="kpi-icon">'+icon+'</div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><em style="'+(positive?'':'color:var(--muted)')+'">'+esc(detail)+'</em></article>';
  }

  function renderKPIs(data){
    const s=data.summary;
    $('#kpi-grid').innerHTML=[
      kpiCard('♙','총 회원',num(s.users),'누적 회원'),
      kpiCard('♕','활성 Premium',num(s.active_subscribers),'현재 이용 중'),
      kpiCard('▶','유효 재생',num(s.qualified_plays),'최근 '+data.days+'일'),
      kpiCard('♫','공개 음원',num(s.published_tracks),'현재 공개'),
      kpiCard('◌','창작자',num(s.creators),'등록 프로필'),
      kpiCard('＋','신규 회원',num(s.new_users),'최근 '+data.days+'일')
    ].join('');
  }

  function normalizeSeries(series,days){
    const map=new Map((series||[]).map(x=>[x.day,Number(x.value)||0]));
    const out=[];
    const today=new Date();
    const kst=new Date(today.getTime()+9*3600*1000);
    const y=kst.getUTCFullYear(),m=kst.getUTCMonth(),d=kst.getUTCDate();
    const samples=days<=7?7:days<=30?Math.min(days,15):18;
    const step=Math.max(1,Math.floor(days/samples));
    for(let offset=days-1;offset>=0;offset-=step){
      const dt=new Date(Date.UTC(y,m,d-offset));
      const key=dt.toISOString().slice(0,10);
      let sum=0;
      for(let i=0;i<step;i++){
        const part=new Date(dt.getTime()+i*86400000).toISOString().slice(0,10);
        sum+=map.get(part)||0;
      }
      out.push({day:key,value:sum});
    }
    return out.slice(-samples);
  }

  function barChart(svg,raw,days){
    const data=normalizeSeries(raw,days),W=720,H=280,p={l:42,r:18,t:18,b:34};
    if(!data.length||data.every(x=>!x.value)){svg.innerHTML='<text x="360" y="140" text-anchor="middle" class="axis-label">기간 내 집계된 재생이 없습니다.</text>';return;}
    const max=Math.max(...data.map(x=>x.value),1),usable=W-p.l-p.r,gap=9,bw=Math.max(5,(usable-gap*(data.length-1))/data.length);
    let out='<defs><linearGradient id="playGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e86eb3"/><stop offset="1" stop-color="#8b73e8"/></linearGradient></defs>';
    [0,.25,.5,.75,1].forEach(r=>{
      const y=p.t+(H-p.t-p.b)*(1-r);
      out+='<line class="chart-gridline" x1="'+p.l+'" y1="'+y+'" x2="'+(W-p.r)+'" y2="'+y+'"/>';
      out+='<text class="axis-label" x="'+(p.l-8)+'" y="'+(y+3)+'" text-anchor="end">'+num(max*r)+'</text>';
    });
    data.forEach((x,i)=>{
      const h=(x.value/max)*(H-p.t-p.b-8),xx=p.l+i*(bw+gap),yy=H-p.b-h;
      out+='<rect class="chart-bar" x="'+xx+'" y="'+yy+'" width="'+bw+'" height="'+h+'" rx="5"><title>'+esc(x.day)+' · '+num(x.value)+'회</title></rect>';
      if(data.length<=10||i%2===0)out+='<text class="axis-label" x="'+(xx+bw/2)+'" y="'+(H-12)+'" text-anchor="middle">'+x.day.slice(5).replace('-','/')+'</text>';
    });
    svg.innerHTML=out;
  }

  function lineChart(svg,raw,days){
    const data=normalizeSeries(raw,days),W=460,H=280,p={l:38,r:18,t:22,b:34};
    if(!data.length||data.every(x=>!x.value)){svg.innerHTML='<text x="230" y="140" text-anchor="middle" class="axis-label">기간 내 신규 회원이 없습니다.</text>';return;}
    const max=Math.max(...data.map(x=>x.value),1),usableW=W-p.l-p.r,usableH=H-p.t-p.b;
    const pts=data.map((x,i)=>[p.l+(i/(Math.max(1,data.length-1)))*usableW,H-p.b-(x.value/max)*usableH,x]);
    let out='<defs><linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a82ff"/><stop offset="1" stop-color="#6fd8ff"/></linearGradient></defs>';
    [0,.5,1].forEach(r=>{const y=p.t+usableH*(1-r);out+='<line class="chart-gridline" x1="'+p.l+'" y1="'+y+'" x2="'+(W-p.r)+'" y2="'+y+'"/>';});
    out+='<polyline class="chart-line" points="'+pts.map(x=>x[0]+','+x[1]).join(' ')+'"/>';
    pts.forEach((pt,i)=>{
      out+='<circle class="chart-dot" cx="'+pt[0]+'" cy="'+pt[1]+'" r="5"><title>'+esc(pt[2].day)+' · '+num(pt[2].value)+'명</title></circle>';
      if(data.length<=10||i%2===0)out+='<text class="axis-label" x="'+pt[0]+'" y="'+(H-12)+'" text-anchor="middle">'+pt[2].day.slice(5).replace('-','/')+'</text>';
    });
    svg.innerHTML=out;
  }

  function detailedChart(svg,raw,days){
    const normalized=normalizeSeries(raw,days);
    const W=980,H=330,p={l:52,r:24,t:24,b:38};
    const max=Math.max(...normalized.map(x=>x.value),1);
    let out='<defs><linearGradient id="detailGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e86eb3"/><stop offset=".55" stop-color="#9a82ff"/><stop offset="1" stop-color="#6fd8ff"/></linearGradient></defs>';
    [0,.25,.5,.75,1].forEach(r=>{const y=p.t+(H-p.t-p.b)*(1-r);out+='<line class="chart-gridline" x1="'+p.l+'" y1="'+y+'" x2="'+(W-p.r)+'" y2="'+y+'"/><text class="axis-label" x="'+(p.l-10)+'" y="'+(y+4)+'" text-anchor="end">'+num(max*r)+'</text>';});
    if(normalized.length){
      const pts=normalized.map((x,i)=>[p.l+i*(W-p.l-p.r)/Math.max(1,normalized.length-1),H-p.b-(x.value/max)*(H-p.t-p.b),x]);
      out+='<polyline points="'+pts.map(x=>x[0]+','+x[1]).join(' ')+'" fill="none" stroke="url(#detailGradient)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
      pts.forEach((pt,i)=>{out+='<circle cx="'+pt[0]+'" cy="'+pt[1]+'" r="5" fill="#f18ac4" stroke="#141824" stroke-width="3"><title>'+num(pt[2].value)+'회</title></circle>';if(i%2===0||normalized.length<9)out+='<text class="axis-label" x="'+pt[0]+'" y="'+(H-13)+'" text-anchor="middle">'+pt[2].day.slice(5).replace('-','/')+'</text>';});
    }
    svg.innerHTML=out;
  }

  function renderRevenue(data){
    const r=data.revenue,total=r.subscription_krw+r.gold_gross_krw;
    $('#revenue-total').textContent=money(total);
    $('#revenue-grid').innerHTML=[
      ['웹 구독 결제',money(r.subscription_krw),num(r.subscription_payments)+'건'],
      ['골드 결제',money(r.gold_gross_krw),num(r.gold_orders)+'건'],
      ['결제 수수료',money(r.gold_fee_krw),'골드 결제 기록'],
      ['선물 플랫폼 몫',money(r.gift_platform_krw),num(r.gifts)+'건 선물']
    ].map(([a,b,c])=>'<div class="mini-stat"><small>'+a+'</small><strong>'+b+'</strong><em>'+c+'</em></div>').join('');

    $('#revenue-kpis').innerHTML=[
      kpiCard('♕','웹 구독 결제',money(r.subscription_krw),num(r.subscription_payments)+'건'),
      kpiCard('◎','골드 결제',money(r.gold_gross_krw),num(r.gold_orders)+'건'),
      kpiCard('◇','선물 플랫폼 몫',money(r.gift_platform_krw),num(r.gifts)+'건'),
      kpiCard('◌','창작자 선물 몫',money(r.gift_creator_krw),'확정 배분')
    ].join('');
    $('#revenue-detail').innerHTML='<div class="revenue-grid">'+[
      ['기간 총 결제',money(total),'웹 구독 + 골드'],
      ['골드 수수료',money(r.gold_fee_krw),'결제 건 기록'],
      ['골드 세금',money(r.gold_tax_krw),'결제 건 기록'],
      ['정산대기',money(data.payouts.pending_krw),num(data.payouts.pending_count)+'건']
    ].map(([a,b,c])=>'<div class="mini-stat"><small>'+a+'</small><strong>'+b+'</strong><em>'+c+'</em></div>').join('')+'</div>';
    $('#payout-summary-box').innerHTML='<div class="stat-box"><small>지급 예정·정보 대기</small><strong>'+money(data.payouts.pending_krw)+'</strong><div class="management-meta"><span class="soft-badge">'+num(data.payouts.pending_count)+'건</span><span class="soft-badge">다이아 현금 정산 신청</span></div></div>';
  }

  function renderProviders(data){
    const colors=['#e86eb3','#9a82ff','#6fd8ff','#58d7a7','#f0c76c','#ff7f91'];
    const providers=data.providers||[],total=providers.reduce((a,x)=>a+x.count,0);
    $('#provider-total').textContent=num(total)+'명';
    $('#provider-center').textContent=num(total);
    const labels={email:'이메일',google:'Google',kakao:'Kakao',apple:'Apple'};
    let acc=0,segments=[];
    providers.forEach((x,i)=>{const start=total?acc/total*100:0;acc+=x.count;const end=total?acc/total*100:0;segments.push(colors[i%colors.length]+' '+start+'% '+end+'%');});
    $('#provider-donut').style.background=segments.length?'conic-gradient('+segments.join(',')+')':'#202532';
    $('#provider-legend').innerHTML=providers.map((x,i)=>'<div class="legend-row"><span class="legend-dot" style="background:'+colors[i%colors.length]+'"></span><span>'+esc(labels[x.provider]||x.provider)+'</span><strong>'+num(x.count)+'</strong></div>').join('')||'<div class="empty-state">가입 채널 데이터가 없습니다.</div>';
  }

  function cover(track){
    if(track.has_cover)return '<img class="album-thumb" src="/media/'+encodeURIComponent(track.id)+'/cover" alt="">';
    return '<span class="album-thumb"></span>';
  }

  function renderLists(data){
    $('#top-track-list').innerHTML=(data.top_tracks||[]).map((x,i)=>'<div class="rank-row"><span class="rank-no">'+(i+1)+'</span>'+cover(x)+'<div class="row-main"><strong>'+esc(x.title)+'</strong><span>'+esc(x.artist)+'</span></div><span class="row-value">▶ '+num(x.plays)+'</span></div>').join('')||'<div class="empty-state">기간 내 재생 데이터가 없습니다.</div>';
    $('#recent-track-list').innerHTML=(data.recent_tracks||[]).map(x=>'<div class="compact-row">'+cover(x)+'<div class="row-main"><strong>'+esc(x.title)+'</strong><span>'+esc(x.artist)+' · '+esc(x.genre||'장르 미지정')+'</span></div><span class="row-value">'+kstDate(x.created)+'</span></div>').join('')||'<div class="empty-state">공개된 음원이 없습니다.</div>';
    const alerts=[];
    if(data.summary.pending_comment_reports)alerts.push(['report','신고',num(data.summary.pending_comment_reports)+'건의 댓글 신고가 대기 중입니다.','moderation']);
    if(data.summary.reported_tracks)alerts.push(['track','음원',num(data.summary.reported_tracks)+'곡에 음질 신고 이력이 있습니다.','tracks']);
    if(data.payouts.pending_count)alerts.push(['payout','정산',num(data.payouts.pending_count)+'건 · '+money(data.payouts.pending_krw)+' 지급 대기','payouts']);
    if(!alerts.length)alerts.push(['payout','정상','현재 즉시 확인할 운영 알림이 없습니다.','dashboard']);
    $('#operation-alerts').innerHTML=alerts.map(x=>'<button class="alert-row" data-jump="'+x[3]+'" type="button"><span class="alert-label '+x[0]+'">'+x[1]+'</span><span class="row-main"><strong>'+esc(x[2])+'</strong></span><span class="row-value">›</span></button>').join('');
    $('#report-badge').textContent=data.summary.pending_comment_reports||'';
    $('#report-badge').hidden=!data.summary.pending_comment_reports;
    $('#track-badge').textContent=data.summary.reported_tracks||'';
    $('#track-badge').hidden=!data.summary.reported_tracks;
    $('#payout-badge').textContent=data.payouts.pending_count||'';
    $('#payout-badge').hidden=!data.payouts.pending_count;
  }

  function renderPlaysView(data){
    const s=data.summary;
    $('#play-stat-strip').innerHTML=[
      ['유효 재생',num(s.qualified_plays)],
      ['공개 음원',num(s.published_tracks)],
      ['활성 Premium',num(s.active_subscribers)],
      ['기간',data.days+'일']
    ].map(x=>'<div class="stat-box"><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div>').join('');
    $('#play-range-label').textContent='최근 '+data.days+'일';
    detailedChart($('#plays-detail-chart'),data.series.plays,data.days);
    $('#top-track-table').innerHTML=(data.top_tracks||[]).map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(x.title)+'</td><td>'+esc(x.artist)+'</td><td>'+num(x.plays)+'</td><td>'+num(x.likes)+'</td></tr>').join('')||'<tr><td colspan="5">기간 내 재생 데이터가 없습니다.</td></tr>';
  }

  function renderPeople(data){
    $('#people-users-count').textContent=num(data.recent_users.length)+'명 표시';
    $('#recent-user-table').innerHTML=data.recent_users.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.provider)+'</td><td>'+(x.premium?'이용 중':'무료')+'</td><td>'+kstDate(x.created)+'</td></tr>').join('')||'<tr><td colspan="4">회원 데이터가 없습니다.</td></tr>';
    $('#people-creators-count').textContent=num(data.recent_creators.length)+'명 표시';
    $('#recent-creator-table').innerHTML=data.recent_creators.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+num(x.tracks)+'</td><td>'+num(x.followers)+'</td><td>'+kstDate(x.created)+'</td></tr>').join('')||'<tr><td colspan="4">창작자 데이터가 없습니다.</td></tr>';
  }

  function renderSubscriptions(data){
    const states=data.subscription_states||[];
    const webTotal=states.reduce((a,x)=>a+x.n,0),cancelled=states.filter(x=>x.cancel_requested||x.state==='cancelled').reduce((a,x)=>a+x.n,0);
    $('#subscription-kpis').innerHTML=[
      kpiCard('♕','전체 Premium',num(data.summary.active_subscribers),'스토어 포함'),
      kpiCard('▣','웹 구독 레코드',num(webTotal),'NICEPAY'),
      kpiCard('✓','갱신 상태',num(Math.max(0,webTotal-cancelled)),'취소요청 제외'),
      kpiCard('×','해지·취소 요청',num(cancelled),'웹 구독')
    ].join('');
    $('#subscription-state-grid').innerHTML=states.map(x=>'<div class="status-card"><span>'+esc(statusName(x.state))+(x.cancel_requested?' · 취소요청':'')+'</span><strong>'+num(x.n)+'</strong><div class="progress-track"><div class="progress-fill" style="width:'+Math.min(100,webTotal?x.n/webTotal*100:0)+'%"></div></div></div>').join('')||'<div class="empty-state">웹 정기결제 데이터가 없습니다.</div>';
  }

  function renderGold(data){
    const r=data.revenue;
    $('#gold-kpis').innerHTML=[
      kpiCard('◎','골드 결제액',money(r.gold_gross_krw),num(r.gold_orders)+'건'),
      kpiCard('↘','결제 수수료',money(r.gold_fee_krw),'결제 기록 합계'),
      kpiCard('◇','플랫폼 선물 몫',money(r.gift_platform_krw),num(r.gifts)+'건'),
      kpiCard('♥','창작자 선물 몫',money(r.gift_creator_krw),'확정 배분')
    ].join('');
    $('#gold-table').innerHTML=(data.recent_gold||[]).map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.channel)+'</td><td>'+num(x.gold)+'G</td><td>'+money(x.price_krw)+'</td><td>'+kstDateTime(x.paid_at)+'</td></tr>').join('')||'<tr><td colspan="5">결제 내역이 없습니다.</td></tr>';
  }

  function renderDashboard(data){
    state.data=data;
    renderKPIs(data);
    barChart($('#plays-chart'),data.series.plays,data.days);
    lineChart($('#users-chart'),data.series.users,data.days);
    $('#plays-total').textContent=num(data.summary.qualified_plays)+'회';
    $('#new-users-total').textContent='+'+num(data.summary.new_users)+'명';
    $('#insight-text').textContent='최근 '+data.days+'일 동안 유효 재생 '+num(data.summary.qualified_plays)+'회, 신규 회원 '+num(data.summary.new_users)+'명입니다.';
    renderRevenue(data);
    renderProviders(data);
    renderLists(data);
    renderPlaysView(data);
    renderPeople(data);
    renderSubscriptions(data);
    renderGold(data);
    $('#generated-at').textContent='갱신 '+kstDateTime(data.generated_at);
  }

  async function loadDashboard(showNotice=false){
    const button=$('#refresh-button');button.disabled=true;
    try{
      const data=await api('/api/admin/dashboard?days='+state.days);
      renderDashboard(data);
      if(showNotice)toast('최신 운영 데이터를 불러왔습니다.');
    }catch(error){
      toast(error.message);
      if(!state.data)$('#admin-content').innerHTML='<section class="access-gate"><h1>대시보드를 불러오지 못했습니다.</h1><p>'+esc(error.message)+'</p></section>';
    }finally{button.disabled=false;}
  }

  async function globalSearch(query){
    const q=query.trim();
    if(q.length<2){toast('검색어를 2자 이상 입력해주세요.');return;}
    navigate('search');
    $('#search-result-caption').textContent='“'+q+'” 검색 중...';
    $('#search-result-content').innerHTML='<div class="admin-card panel-loader">검색 중입니다.</div>';
    try{
      const result=await api('/api/admin/dashboard/search?q='+encodeURIComponent(q));
      $('#search-result-caption').textContent='“'+q+'” 검색 결과';
      const group=(title,rows,renderer)=>'<section class="search-group"><h2>'+title+' <span class="soft-badge">'+rows.length+'</span></h2>'+(rows.length?rows.map(renderer).join(''):'<div class="empty-state">결과 없음</div>')+'</section>';
      $('#search-result-content').innerHTML='<div class="search-groups">'+
        group('음원',result.tracks,x=>'<div class="search-result-row"><strong>'+esc(x.title)+'</strong><span>'+esc(x.artist)+' · '+esc(statusName(x.status))+'</span></div>')+
        group('창작자',result.creators,x=>'<div class="search-result-row"><strong>'+esc(x.name)+'</strong><span>곡 '+num(x.tracks)+' · 팔로워 '+num(x.followers)+'</span></div>')+
        group('사용자',result.users,x=>'<div class="search-result-row"><strong>'+esc(x.name)+'</strong><span>'+esc(x.email)+' · '+(x.premium?'Premium':'무료')+'</span></div>')+
        '</div>';
    }catch(error){$('#search-result-content').innerHTML='<div class="admin-card empty-state">'+esc(error.message)+'</div>';}
  }

  async function loadTrackReview(){
    const box=$('#track-review-content');
    box.innerHTML='<div class="panel-loader">음원 검토 목록을 불러오는 중입니다.</div>';
    const view=$('#track-review-filter').value,q=$('#track-review-search').value.trim();
    try{
      const result=await api('/api/admin/track-review?view='+encodeURIComponent(view)+'&q='+encodeURIComponent(q));
      if(!result.tracks.length){box.innerHTML='<div class="empty-state">조건에 맞는 음원이 없습니다.</div>';return;}
      box.innerHTML=result.tracks.map(x=>{
        const reasons=(x.reasons||[]).map(r=>'<span class="soft-badge">'+(r==='inactive'?'장기 비활성':'음질 신고')+'</span>').join('');
        const action=x.status==='removed'?'restore':'remove';
        return '<article class="management-card"><div class="management-card-head"><div><h3>'+esc(x.title)+'</h3><p>'+esc(x.producer)+' · '+esc(statusName(x.status))+'</p></div><span class="soft-badge">신고 '+num(x.report_count)+'</span></div><div class="management-meta">'+reasons+'<span class="soft-badge">최근 재생 '+(x.last_played?kstDate(x.last_played):'없음')+'</span></div><div class="management-actions"><button class="small-button '+(action==='remove'?'danger':'good')+'" data-track-action="'+action+'" data-id="'+esc(x.id)+'">'+(action==='remove'?'공개에서 제거':'공개 복구')+'</button></div></article>';
      }).join('');
    }catch(error){box.innerHTML='<div class="empty-state">'+esc(error.message)+'</div>';}
  }

  async function changeTrackVisibility(id,action){
    const note=prompt(action==='remove'?'제거 사유 메모를 입력하세요. (선택)':'복구 메모를 입력하세요. (선택)','');
    if(note===null)return;
    try{
      await api('/api/admin/track-review/'+encodeURIComponent(id)+'/visibility',{method:'POST',body:JSON.stringify({action,note})});
      toast(action==='remove'?'음원을 공개 목록에서 제거했습니다.':'음원을 다시 공개했습니다.');
      await Promise.all([loadTrackReview(),loadDashboard()]);
    }catch(error){toast(error.message);}
  }

  async function loadCommentReports(){
    const box=$('#comment-report-content'),status=$('#comment-report-filter').value;
    box.innerHTML='<div class="panel-loader">댓글 신고를 불러오는 중입니다.</div>';
    try{
      const result=await api('/api/admin/comment-reports?status='+encodeURIComponent(status));
      if(!result.reports.length){box.innerHTML='<div class="empty-state">해당 상태의 신고가 없습니다.</div>';return;}
      box.innerHTML=result.reports.map(x=>'<article class="management-card"><div class="management-card-head"><div><h3>'+esc(x.title)+'</h3><p>사유 '+esc(x.reason)+' · '+kstDateTime(x.created)+'</p></div><span class="soft-badge">'+esc(statusName(x.status))+'</span></div><div class="management-meta"><span class="soft-badge">신고 내용</span><span>'+esc(x.details||'상세 설명 없음')+'</span></div><p style="margin-top:12px;color:#c7cbd5">“'+esc(x.body_snapshot||'')+'”</p>'+(x.status==='pending'?'<div class="management-actions"><button class="small-button good" data-report-action="dismissed" data-id="'+esc(x.id)+'">유지</button><button class="small-button danger" data-report-action="removed" data-id="'+esc(x.id)+'">댓글 삭제</button></div>':'')+'</article>').join('');
    }catch(error){box.innerHTML='<div class="empty-state">'+esc(error.message)+'</div>';}
  }

  async function resolveCommentReport(id,status){
    if(status==='removed'&&!confirm('신고된 댓글을 삭제 처리할까요?'))return;
    try{
      await api('/api/admin/comment-reports/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status})});
      toast(status==='removed'?'댓글을 삭제 처리했습니다.':'신고를 유지 처리했습니다.');
      await Promise.all([loadCommentReports(),loadDashboard()]);
    }catch(error){toast(error.message);}
  }

  function payoutStatusClass(status){return status==='paid'?'good':status==='held'?'danger':'';}

  async function loadPayouts(period){
    const query=period?'?period='+encodeURIComponent(period):'';
    try{
      const result=await api('/api/admin/payouts'+query);
      state.payoutPeriod=result.period||null;
      const select=$('#payout-period-select');
      select.innerHTML=(result.periods||[]).map(x=>'<option value="'+esc(x.period)+'" '+(x.period===result.period?'selected':'')+'>'+esc(x.period)+'</option>').join('');
      if(!result.periods?.length)select.innerHTML='<option value="">마감된 기간 없음</option>';
      const close=$('#payout-close-button');
      close.hidden=!result.closable;
      close.dataset.period=result.closable||'';
      if(result.closable)close.textContent=result.closable+' 월 마감';

      const statements=result.statements||[],gross=statements.reduce((a,x)=>a+Number(x.gross_krw||0),0),net=statements.reduce((a,x)=>a+Number(x.net_krw||0),0);
      $('#payout-kpis').innerHTML=[
        kpiCard('▣','정산서',num(statements.length)+'건',result.period||'마감 전'),
        kpiCard('₩','총 정산액',money(gross),'세전'),
        kpiCard('✓','실지급 합계',money(net),'원천징수 후')
      ].join('');
      $('#payout-table').innerHTML=statements.map(x=>{
        const tax=Number(x.income_tax_krw||0)+Number(x.local_tax_krw||0);
        const button=x.status==='scheduled'?'<button class="small-button good" data-payout-paid="'+esc(x.id)+'">지급 완료</button>':'';
        return '<tr><td>'+esc(x.profile)+'</td><td>'+money(x.gross_krw)+'</td><td>'+money(tax)+'</td><td>'+money(x.net_krw)+'</td><td><span class="soft-badge '+payoutStatusClass(x.status)+'">'+esc(statusName(x.status))+'</span></td><td>'+esc(x.due_on||'-')+'</td><td>'+button+'</td></tr>';
      }).join('')||'<tr><td colspan="7">선택한 기간에 정산서가 없습니다.</td></tr>';
    }catch(error){toast(error.message);}
  }

  async function closePayoutPeriod(period){
    if(!period||!confirm(period+' 월 정산을 마감할까요?'))return;
    try{
      const result=await api('/api/admin/payouts/close',{method:'POST',body:JSON.stringify({period})});
      toast(result.credited+'명의 선물 수익을 다이아로 확정했습니다.');
      await Promise.all([loadPayouts(result.period),loadDashboard()]);
    }catch(error){toast(error.message);}
  }

  async function markPayoutPaid(id){
    const ref=prompt('송금/지급 확인 번호 또는 메모를 입력하세요.','');
    if(ref===null||!ref.trim()){toast('지급 확인 내용을 입력해주세요.');return;}
    if(!confirm('실제 송금을 완료한 정산서만 지급 완료 처리해야 합니다. 계속할까요?'))return;
    try{
      await api('/api/admin/payouts/'+encodeURIComponent(id)+'/paid',{method:'POST',body:JSON.stringify({ref:ref.trim()})});
      toast('정산서를 지급 완료로 처리했습니다.');
      await Promise.all([loadPayouts(state.payoutPeriod),loadDashboard()]);
    }catch(error){toast(error.message);}
  }

  async function init(){
    try{
      const session=await api('/api/admin/session');
      if(!session.authenticated){showLogin();return;}
      state.me={name:'관리자'};
      app.classList.remove('locked');
      $('#admin-name').textContent='로그아웃';
      $('#operator-heading').textContent='관리자';
      $('#access-gate').hidden=true;
      $('#admin-content').hidden=false;
      await loadDashboard();
    }catch(error){showLogin(error.message||'로그인 상태를 확인하지 못했습니다.');}
  }

  async function loadDubbing(){
    const box=$('#dubbing-admin-body');if(!box)return;box.innerHTML='<div class="panel-loader">더빙 운영 정보를 불러오는 중입니다.</div>';
    try{
      const d=await api('/api/admin/dubbing?days='+state.days);state.dubbing=d;
      const amount=Number(d.pika.settled_micro_usd||0)/1e6;
      box.innerHTML='<div class="kpi-grid">'+[
        kpiCard('◉','전체 작품',num(d.summary.projects),'완성 '+num(d.summary.completed)+' · 배역 제출 '+num(d.summary.submitted_roles)),
        kpiCard('✦','대본 생성',num(d.generations.filter(x=>x.kind==='script').reduce((a,x)=>a+x.count,0)),'최근 '+d.days+'일 · 성공·실패 포함'),
        kpiCard('♫','Pika 작업',num(d.pika.provider_jobs),'응답 미확인 '+num(d.pika.unconfirmed_requests)),
        kpiCard('$','Pika 확정 비용','$'+amount.toFixed(6),'원화 추정 '+money(d.pika.estimated_krw)),
        kpiCard('◇','신고·이의신청',num(d.summary.open_reports),'운영자 검토 필요'),
        kpiCard('▶','광고 보상',num(d.summary.ad_rewards),'최근 '+d.days+'일 · 웹 화면 광고')
      ].join('')+'</div><article class="admin-card"><h2>음향 제작 가격</h2><form id="dubbing-price-form" class="inline-controls"><label>작품당 Gold <input name="gold" type="number" min="1" max="10000" step="1" required value="'+d.settings.soundGold+'"></label><button class="primary-button" type="submit">가격 저장</button></form><p>기존 결제 금액은 유지됩니다. 변경된 가격은 다음 제작 확인창부터 적용됩니다.</p><p>실제 골드 차감: '+(d.flags.charging?'켜짐':'꺼짐')+' · 유료 API 실행: '+(d.flags.paidAPI?'켜짐':'꺼짐')+'</p></article><article class="admin-card"><h2>비용 · 사용량</h2><p>'+esc(d.costNote)+'</p><p>미정산·미확인 비용 '+num(d.pika.unsettled_costs)+'건 · 환율 미설정 '+num(d.pika.missing_fx)+'건</p><div class="management-list">'+d.generations.map(x=>'<div class="management-meta"><b>'+esc(x.kind==='script'?'대본':'음향 계획')+'</b><span>'+esc(x.state)+' '+num(x.count)+'건</span><span>입력 '+num(x.input_tokens)+' · 출력 '+num(x.output_tokens)+' 토큰</span></div>').join('')+'</div></article><article class="admin-card"><div class="card-heading"><h2>실패 · 확인 필요 작업</h2><button class="small-button" id="dubbing-reconcile">미처리 환급 확인</button></div><p>Pika 결과가 불명확한 작업은 유료 생성을 반복하지 않습니다. 최종 녹음 합성은 저장된 파일로만 재시도합니다.</p>'+ (d.jobs.length?d.jobs.map(j=>'<div class="management-card"><h3>'+esc(j.title)+'</h3><p>'+esc(j.kind==='final'?'최종 합성':'배경 음향')+' · '+esc(j.state)+' · 시도 '+j.attempts+'</p><p>'+esc(j.error)+'</p>'+(j.can_retry?'<label class="dubbing-review-note">재시도 사유<textarea maxlength="2000" rows="2" required></textarea></label><button class="small-button" data-final-retry="'+esc(j.id)+'" data-updated="'+j.updated+'">최종 합성 재시도</button>':'')+'</div>').join(''):'<div class="empty-state">확인이 필요한 작업이 없습니다.</div>')+'</article><article class="admin-card"><h2>Gold 이용·환급 내역</h2><div class="data-table-wrap"><table><thead><tr><th>작품</th><th>사용</th><th>환급</th><th>상태</th><th>일시</th></tr></thead><tbody>'+d.payments.map(p=>'<tr><td>'+esc(p.title)+'</td><td>'+p.gold+'G</td><td>'+p.refunded_gold+'G</td><td>'+esc(p.state)+'</td><td>'+kstDateTime(p.created)+'</td></tr>').join('')+'</tbody></table></div></article>';
      $('#dubbing-price-form').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;try{await api('/api/admin/dubbing/settings',{method:'PUT',body:JSON.stringify({soundGold:Number(e.currentTarget.elements.gold.value),version:d.settings.version})});toast('제작 가격을 저장했습니다.');await loadDubbing();}catch(err){toast(err.message);}finally{b.disabled=false;}};
      $('#dubbing-reconcile').onclick=async e=>{e.currentTarget.disabled=true;try{await api('/api/admin/dubbing/reconcile',{method:'POST',body:'{}'});await loadDubbing();toast('환급 상태를 확인했습니다.');}catch(err){toast(err.message);loadDubbing();}};
      $$('[data-final-retry]',box).forEach(b=>b.onclick=async()=>{const input=b.closest('.management-card').querySelector('textarea'),note=input.value.trim();if(!note){input.reportValidity();return;}b.disabled=true;try{await api('/api/admin/dubbing/final/'+b.dataset.finalRetry+'/retry',{method:'POST',body:JSON.stringify({updated:Number(b.dataset.updated),note})});toast('최종 합성을 다시 예약했습니다.');await loadDubbing();}catch(err){toast(err.message);b.disabled=false;}});
    }catch(e){box.innerHTML='<div class="empty-state">'+esc(e.message)+'</div>';}
  }
  async function loadDubbingReports(){
    const box=$('#dubbing-rights-list');if(!box)return;box.innerHTML='<div class="panel-loader">권리 신고를 불러오는 중입니다.</div>';
    try{const d=await api('/api/admin/dubbing-reports?status='+$('#dubbing-rights-status').value);
      const links=value=>{let list=[];try{list=JSON.parse(value);}catch{}return list.map(v=>/^https:\/\//.test(v)?'<a href="'+esc(v)+'" target="_blank" rel="noopener noreferrer">'+esc(v)+'</a>':'').join('<br>');};
      const actions={pending:[['removed','공개 중단'],['dismissed','신고 종결']],removed:[['restored','복원']],appealed:[['restored','복원'],['upheld','중단 유지']],upheld:[['restored','복원']]};
      box.innerHTML=d.reports.length?d.reports.map(r=>'<article class="management-card"><div class="management-card-head"><h3>'+esc(r.title)+'</h3><span class="soft-badge">'+esc(({pending:'접수',removed:'공개 중단',appealed:'이의신청',upheld:'중단 유지',restored:'복원',dismissed:'종결'})[r.status]||r.status)+'</span></div><p>권리자 '+esc(r.rightsholder)+' · '+esc(r.contact)+'</p><p>'+esc(r.details)+'</p><p>'+links(r.evidence_json)+'</p><p>작성자의 공개 중단 작품 '+num(r.violations)+'개 · 3개 이상이면 새 더빙 제작·참여 제한</p>'+(r.appeal?'<h4>이의신청</h4><p>'+esc(r.appeal)+'</p><p>'+links(r.appeal_evidence_json)+'</p>':'')+'<p>연결 작품: '+JSON.parse(r.linked_projects||'[]').map(p=>'<a href="/#dubbing/'+encodeURIComponent(p.id)+'" target="_blank" rel="noopener">'+esc(p.title)+'</a>').join(' · ')+'</p><p>'+esc(r.decision)+'</p>'+((actions[r.status]||[]).length?'<label class="dubbing-review-note">작성자에게 표시할 검토 사유<textarea maxlength="2000" rows="3" required></textarea></label>':'')+'<div class="management-actions">'+(actions[r.status]||[]).map(([a,label])=>'<button class="small-button" data-rights-id="'+esc(r.id)+'" data-rights-version="'+r.version+'" data-rights-action="'+a+'">'+label+'</button>').join('')+'</div></article>').join(''):'<div class="empty-state">해당 상태의 권리 신고가 없습니다.</div>';
      $$('[data-rights-id]',box).forEach(b=>b.onclick=async()=>{const input=b.closest('.management-card').querySelector('textarea'),note=input.value.trim();if(!note){input.reportValidity();return;}b.disabled=true;try{await api('/api/admin/dubbing-reports/'+b.dataset.rightsId,{method:'PATCH',body:JSON.stringify({status:b.dataset.rightsAction,version:Number(b.dataset.rightsVersion),note})});toast('검토 결과를 저장했습니다.');await loadDubbingReports();}catch(err){toast(err.message);b.disabled=false;}});
    }catch(e){box.innerHTML='<div class="empty-state">'+esc(e.message)+'</div>';}
  }

  $('#dubbing-rights-status').addEventListener('change',loadDubbingReports);
  $$('.admin-nav-item').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));
  app.addEventListener('click',e=>{const jump=e.target.closest('[data-jump]');if(jump&&app.contains(jump))navigate(jump.dataset.jump);});
  async function refreshCurrentView(){await loadDashboard(true);if(state.view==='dubbing')await loadDubbing();if(state.view==='moderation')await Promise.all([loadCommentReports(),loadDubbingReports()]);}
  $('#period-select').addEventListener('change',async e=>{state.days=Number(e.target.value)||7;await refreshCurrentView();});
  $('#refresh-button').addEventListener('click',refreshCurrentView);
  $('#admin-search-form').addEventListener('submit',e=>{e.preventDefault();globalSearch($('#admin-search-input').value);});
  $('#profile-button').addEventListener('click',async()=>{
    try{await api('/api/admin/logout',{method:'POST'});location.replace('/admin/dashboard');}
    catch(error){toast(error.message);}
  });
  $('#track-review-filter').addEventListener('change',loadTrackReview);
  $('#track-review-search-button').addEventListener('click',loadTrackReview);
  $('#track-review-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadTrackReview();}});
  $('#track-review-content').addEventListener('click',e=>{const btn=e.target.closest('[data-track-action]');if(btn)changeTrackVisibility(btn.dataset.id,btn.dataset.trackAction);});
  $('#comment-report-filter').addEventListener('change',loadCommentReports);
  $('#comment-report-refresh').addEventListener('click',loadCommentReports);
  $('#comment-report-content').addEventListener('click',e=>{const btn=e.target.closest('[data-report-action]');if(btn)resolveCommentReport(btn.dataset.id,btn.dataset.reportAction);});
  $('#payout-period-select').addEventListener('change',e=>loadPayouts(e.target.value));
  $('#payout-close-button').addEventListener('click',e=>closePayoutPeriod(e.currentTarget.dataset.period));
  $('#payout-table').addEventListener('click',e=>{const btn=e.target.closest('[data-payout-paid]');if(btn)markPayoutPaid(btn.dataset.payoutPaid);});
  $('#admin-dialog-close').addEventListener('click',()=>$('#admin-dialog').close());

  init();
})();
