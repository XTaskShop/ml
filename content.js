(() => {
  if (window.__ML_RADAR_V14__) return;
  window.__ML_RADAR_V14__ = true;

  const clean=(s='')=>String(s??'').replace(/\s+/g,' ').trim();
  const norm=(s='')=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const abs=v=>{ try { return v ? new URL(v,location.href).href : ''; } catch { return v||''; } };
  const brInt=(s='')=>{const d=String(s).replace(/\D/g,'');return d?Number(d):0};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const idRegex=/\bMLB(?:U)?-?\d{4,}\b/ig;
  let lastCards=[];
  let advancing=false;
  const SPEED={
    safe:{poll:220,cardTimeout:12000,minCards:45,stableNeed:3,fallbackStable:6,paginationWait:7500,scrollSettle:250,change1:5000,change2:5000,change3:5500,afterChange:450},
    fast:{poll:110,cardTimeout:7200,minCards:38,stableNeed:2,fallbackStable:4,paginationWait:3600,scrollSettle:80,change1:2600,change2:2800,change3:3300,afterChange:120},
    turbo:{poll:80,cardTimeout:6000,minCards:34,stableNeed:2,fallbackStable:3,paginationWait:2800,scrollSettle:45,change1:1900,change2:2200,change3:2700,afterChange:70}
  };
  const speedCfg=m=>SPEED[m]||SPEED.fast;
  function scrollOwnBottom(){const root=document.scrollingElement||document.documentElement;try{root.scrollTop=root.scrollHeight;}catch{}try{if(document.body&&document.body!==root)document.body.scrollTop=document.body.scrollHeight;}catch{}}
  try{document.documentElement.style.overscrollBehavior='contain';if(document.body)document.body.style.overscrollBehavior='contain';}catch{}

  function canonicalId(v=''){
    const m=String(v).toUpperCase().match(/\b(MLBU|MLB)-?(\d{4,})\b/);
    return m?`${m[1]}${m[2]}`:'';
  }
  function allIdsFromString(s=''){
    const out=new Set(); let text=String(s||'');
    for(let i=0;i<3;i++){
      try{text=decodeURIComponent(text)}catch{}
      for(const m of text.matchAll(idRegex)){const id=canonicalId(m[0]);if(id)out.add(id)}
    }
    return out;
  }
  function cardSelectors(){
    return ['li.ui-search-layout__item','li.ui-search-result','div.ui-search-result__wrapper','[data-testid="poly-card"]','.poly-card','article.ui-search-result'];
  }
  function uniqueElements(a){const s=new Set();return a.filter(x=>x&&!s.has(x)&&(s.add(x),true));}
  function isLikelyResultCard(el){
    if(!el || !el.querySelector) return false;
    return !!el.querySelector('a[href]') && !!(el.querySelector('.poly-component__title,.ui-search-item__title,h2,h3') || clean(el.textContent).length>40);
  }
  function getCards(){
    let best=[];
    for(const sel of cardSelectors()){
      const arr=[...document.querySelectorAll(sel)].filter(isLikelyResultCard);
      if(arr.length>best.length) best=arr;
    }
    if(best.length) return uniqueElements(best);
    const titles=[...document.querySelectorAll('a.poly-component__title,.poly-component__title,.ui-search-item__title,h2.ui-search-item__title')];
    return uniqueElements(titles.map(t=>t.closest('li,article,.ui-search-result,.poly-card,[data-testid="poly-card"]')||t.parentElement).filter(Boolean));
  }
  function titleOf(card){
    const el=card.querySelector('a.poly-component__title,.poly-component__title,.ui-search-item__title,h2.ui-search-item__title,h2,h3');
    return clean(el?.textContent||'');
  }
  function simpleSignature(cards=getCards()){
    return cards.slice(0,12).map((c,i)=>`${i}:${titleOf(c)}:${canonicalId((c.outerHTML.match(/MLBU?-?\d{4,}/i)||[])[0]||'')}`).join('||').slice(0,5000);
  }
  function activePageNumber(){
    const sels=['.andes-pagination__button--current','[aria-current="page"]','.andes-pagination__button--current a','.andes-pagination__button--current span'];
    for(const s of sels){
      const el=document.querySelector(s); const n=Number(clean(el?.textContent||'')); if(Number.isFinite(n)&&n>0) return n;
    }
    return 0;
  }
  function findNext(){
    // IMPORTANT: current Mercado Livre can render href="". Do NOT turn empty href into current URL.
    return document.querySelector(
      'li.andes-pagination__button--next a.andes-pagination__link[title="Seguinte"][data-andes-pagination-control="next"],'+
      'a.andes-pagination__link[title="Seguinte"][data-andes-pagination-control="next"],'+
      'li.andes-pagination__button--next a,'+
      'a[rel="next"],'+
      'button[title="Seguinte"],button[aria-label*="Seguinte" i]'
    );
  }
  function findPageButton(pageNo){
    const nodes=[...document.querySelectorAll('li.andes-pagination__button a,li.andes-pagination__button button,a.andes-pagination__link')];
    return nodes.find(el=>Number(clean(el.textContent||''))===Number(pageNo))||null;
  }
  function nextDiagnostics(){
    const el=findNext();
    return {
      exists:!!el,
      tag:el?.tagName||'',
      hrefRaw:el?.getAttribute?.('href')??null,
      hrefResolved:el?.getAttribute?.('href')?abs(el.getAttribute('href')):'',
      text:clean(el?.textContent||el?.getAttribute?.('title')||''),
      activePage:activePageNumber(),
      html:el?String(el.outerHTML||'').slice(0,800):''
    };
  }

  async function waitStableCards(mode='fast',timeoutOverride=0){
    const cfg=speedCfg(mode),timeout=timeoutOverride||cfg.cardTimeout;
    let best=[],last=0,stable=0,lastSig='';
    const started=Date.now();
    while(Date.now()-started<timeout){
      const cards=getCards();
      if(cards.length>best.length) best=cards;
      const sig=cards.length?simpleSignature(cards):'';
      if(cards.length>0 && cards.length===last && sig===lastSig) stable++; else stable=0;
      last=cards.length;lastSig=sig;
      if(cards.length>=cfg.minCards && stable>=cfg.stableNeed) break;
      if(cards.length>0 && stable>=cfg.fallbackStable) break;
      await sleep(cfg.poll);
    }
    lastCards=best.length?best:getCards();
    // O runner estreito pode mostrar contadores errados. A paginação é a fonte de verdade.
    if(!findNext()){
      scrollOwnBottom();
      const until=Date.now()+cfg.paginationWait;
      while(Date.now()<until){ if(findNext()) break; await sleep(Math.max(90,cfg.poll)); }
    }
    return lastCards;
  }

  function readTotal(){
    const cardsNow=getCards().length;
    const values=[];
    const candidates=[
      document.querySelector('.ui-search-search-result__quantity-results')?.textContent,
      document.querySelector('[class*="quantity-results"]')?.textContent,
      document.querySelector('[class*="quantity-results"]')?.getAttribute?.('aria-label'),
      document.querySelector('[data-testid*="quantity"]')?.textContent,
      document.title
    ].filter(Boolean);
    for(const raw of candidates){
      for(const m of String(raw).matchAll(/([\d\.]+)\s+resultados?/ig)){const n=brInt(m[1]);if(n>=cardsNow&&n<10000000)values.push(n);}
    }
    if(!values.length){
      const text=clean(document.body?.innerText||'').slice(0,50000);
      for(const m of text.matchAll(/([\d\.]+)\s+resultados?/ig)){const n=brInt(m[1]);if(n>=cardsNow&&n<10000000)values.push(n);}
    }
    return values.length?Math.max(...values):0;
  }

  function collectIds(card){
    const ids=new Set();
    const add=s=>allIdsFromString(s).forEach(x=>ids.add(x));
    add(card.outerHTML||'');
    for(const a of card.querySelectorAll('a[href]')){
      const raw=a.getAttribute('href')||'';add(raw);add(a.href||'');
      try{const u=new URL(a.href||raw,location.href);for(const [k,v] of u.searchParams){if(/item|wid|product|url|redirect|target|meli|id|catalog|user/i.test(k))add(v);}}catch{}
    }
    if(!ids.size){
      const nodes=[card,...card.querySelectorAll('[data-id],[data-item-id],[data-product-id],[data-testid],[id]')].slice(0,120);
      for(const el of nodes){if(!el?.getAttributeNames)continue;for(const name of el.getAttributeNames()){if(/id|item|product|tracking|meli|wid|url|catalog|user/i.test(name))add(el.getAttribute(name)||'');}}
    }
    return [...ids];
  }

  function imageOf(card){
    const img=card.querySelector('img');
    return clean(img?.currentSrc||img?.src||img?.getAttribute?.('data-src')||'');
  }
  function priceOf(card){
    const el=card.querySelector('.andes-money-amount__fraction,[class*="money-amount__fraction"],.price-tag-fraction');
    const frac=clean(el?.textContent||'');
    if(!frac)return '';
    const cur=clean(card.querySelector('.andes-money-amount__currency-symbol,[class*="currency-symbol"]')?.textContent||'R$');
    return `${cur} ${frac}`;
  }
  function linkOf(card){
    const a=card.querySelector('a.poly-component__title,a[href]');
    return clean(a?.href||a?.getAttribute?.('href')||'');
  }

  function sponsorOf(card){
    const t=clean(card.textContent||'');
    return /\bpatrocinado\b|\bsponsored\b/i.test(t) || !!card.querySelector('[class*="ad-badge"],[data-testid*="sponsor"]');
  }
  function uniqueExactTitleCandidate(items,targetTitle){
    const nt=norm(targetTitle); if(!nt || nt.length<12 || /seguranca mercado livre|mercado livre$|verifique/i.test(nt)) return -1;
    const matches=[]; items.forEach((it,i)=>{if(norm(it.title)===nt)matches.push(i)});
    return matches.length===1?matches[0]:-1;
  }
  function relatedIdSet(target){
    return new Set([target?.mlb,target?.userProductId,target?.catalogProductId,...(target?.relatedIds||[])].map(canonicalId).filter(Boolean));
  }

  function parsePage(target,pageNo){
    const cards=lastCards.length?lastCards:getCards();
    const wanted=relatedIdSet(target);
    const targetMlb=canonicalId(target?.mlb||'');
    const targetUp=canonicalId(target?.userProductId||'');
    const targetCatalog=canonicalId(target?.catalogProductId||'');
    const targetSeller=norm(target?.sellerName||'');

    const items=cards.map((card,idx)=>{
      const ids=collectIds(card), title=titleOf(card), text=clean(card.textContent||'');
      return {idx,card,title,text,ids,sponsor:sponsorOf(card),image:imageOf(card),price:priceOf(card),link:linkOf(card)};
    });
    let matchIndex=-1,matchType='',foundId='';
    const matchId=(id,type)=>{
      if(!id || matchIndex>=0) return;
      for(let i=0;i<items.length;i++) if(items[i].ids.includes(id)){matchIndex=i;matchType=type;foundId=id;break;}
    };
    matchId(targetMlb,'MLB exato');
    matchId(targetUp,'User Product (MLBU) do anúncio');
    matchId(targetCatalog,'Produto de catálogo associado');
    if(matchIndex<0 && wanted.size){
      outer:for(let i=0;i<items.length;i++) for(const id of items[i].ids) if(wanted.has(id)){matchIndex=i;matchType='ID relacionado ao anúncio';foundId=id;break outer;}
    }
    if(matchIndex<0 && target?.title && targetSeller){
      const nt=norm(target.title),c=[];items.forEach((it,i)=>{if(norm(it.title)===nt&&norm(it.text).includes(targetSeller))c.push(i)});
      if(c.length===1){matchIndex=c[0];matchType='Título + vendedor';}
    }
    if(matchIndex<0 && target?.title){const i=uniqueExactTitleCandidate(items,target.title);if(i>=0){matchIndex=i;matchType='Título exato único (fallback)';}}

    let total=readTotal();
    if(total&&total<items.length)total=0;
    const signature=simpleSignature(cards);
    const sponsoredCount=items.filter(x=>x.sponsor).length;
    const sponsoredAheadOnPage=matchIndex>=0?items.slice(0,matchIndex).filter(x=>x.sponsor).length:0;
    const flatIds=[...new Set(items.flatMap(x=>x.ids))];
    const mlbCount=flatIds.filter(x=>x.startsWith('MLB')&&!x.startsWith('MLBU')).length;
    const mlbuCount=flatIds.filter(x=>x.startsWith('MLBU')).length;
    const nd=nextDiagnostics();
    return {
      itemsCount:items.length,total,signature,matchIndex,matchType,foundId,
      sponsoredCount,sponsoredAheadOnPage,foundTitle:matchIndex>=0?items[matchIndex].title:'',pageNo,
      idsCount:flatIds.length,mlbCount,mlbuCount,idSample:flatIds.slice(0,12),
      sample:items.slice(0,4).map(x=>({title:x.title,ids:x.ids.slice(0,5)})),
      preview:items.slice(0,8).map(x=>({idx:x.idx,title:x.title,image:x.image,price:x.price,sponsor:x.sponsor,link:x.link,ids:x.ids.slice(0,3)})),
      nextExists:nd.exists,nextHrefRaw:nd.hrefRaw,nextHrefResolved:nd.hrefResolved,nextText:nd.text,activePage:nd.activePage,nextHtml:nd.html
    };
  }

  async function sendPageResult(ctx){
    await waitStableCards(ctx.speedMode||'safe');
    const parsed=parsePage(ctx.target||{},ctx.page||1);
    await chrome.runtime.sendMessage({type:'MLRADAR_PAGE_RESULT',jobId:ctx.jobId,parsed,url:location.href}).catch(()=>{});
  }

  async function waitForPageChange(beforeSig,beforeUrl,beforeActive,timeout=16000,poll=100){
    const start=Date.now();
    while(Date.now()-start<timeout){
      await sleep(poll);
      const nowUrl=location.href;
      const nowCards=getCards();
      const sig=nowCards.length?simpleSignature(nowCards):'';
      const ap=activePageNumber();
      if(nowUrl!==beforeUrl) return {changed:true,kind:'url'};
      if(sig && beforeSig && sig!==beforeSig) return {changed:true,kind:'cards'};
      if(ap && beforeActive && ap!==beforeActive) return {changed:true,kind:'page-number'};
    }
    return {changed:false};
  }

  function fireClick(el){
    if(!el) return;
    try{el.focus({preventScroll:true});}catch{}
    try{el.click();}catch{}
  }
  function fireMouseSequence(el){
    if(!el) return;
    for(const type of ['pointerdown','mousedown','pointerup','mouseup','click']){
      try{el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window,button:0,buttons:type.includes('down')?1:0}));}catch{}
    }
  }

  async function advanceAndScan(ctx){
    if(advancing) return;
    advancing=true;
    const cfg=speedCfg(ctx.speedMode||'safe');
    try{
      if(!lastCards.length) await waitStableCards(ctx.speedMode||'safe');
      const beforeCards=getCards(),beforeSig=simpleSignature(beforeCards),beforeUrl=location.href,beforeActive=activePageNumber();

      // A paginação do ML costuma ser montada no final da página. Rolamos instantaneamente, sem animação.
      scrollOwnBottom();
      let next=findNext();
      const end=Date.now()+cfg.paginationWait;
      while(Date.now()<end && !next){await sleep(cfg.poll);next=findNext();}
      if(!next){
        await chrome.runtime.sendMessage({type:'MLRADAR_ADVANCE_FAILED',jobId:ctx.jobId,page:ctx.page,error:'Botão Seguinte não apareceu.',diagnostics:nextDiagnostics()}).catch(()=>{});return;
      }

      try{if(next.tagName==='A')next.setAttribute('target','_self');}catch{}
      if(cfg.scrollSettle) await sleep(cfg.scrollSettle);
      fireClick(next);
      let changed=await waitForPageChange(beforeSig,beforeUrl,beforeActive,cfg.change1,cfg.poll);

      if(!changed.changed){
        fireMouseSequence(next);if(next.parentElement)fireClick(next.parentElement);
        changed=await waitForPageChange(beforeSig,beforeUrl,beforeActive,cfg.change2,cfg.poll);
      }
      if(!changed.changed){
        const numbered=findPageButton(ctx.page);if(numbered){fireClick(numbered);}
        changed=await waitForPageChange(beforeSig,beforeUrl,beforeActive,cfg.change3,cfg.poll);
      }
      if(!changed.changed){
        await chrome.runtime.sendMessage({type:'MLRADAR_ADVANCE_FAILED',jobId:ctx.jobId,page:ctx.page,error:'Cliquei em Seguinte, mas os anúncios não mudaram.',diagnostics:nextDiagnostics()}).catch(()=>{});return;
      }

      if(cfg.afterChange) await sleep(cfg.afterChange);
      lastCards=[];
      await sendPageResult(ctx);
    } finally {advancing=false;}
  }

  chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
    (async()=>{
      if(msg?.type==='MLRADAR_PARSE_NOW'){
        await waitStableCards(msg.speedMode||'safe');sendResponse({ok:true,parsed:parsePage(msg.target||{},msg.page||1)});return;
      }
      if(msg?.type==='MLRADAR_GO_NEXT'){
        sendResponse({ok:true,started:true});
        advanceAndScan({jobId:msg.jobId,target:msg.target||{},page:msg.page||2,speedMode:msg.speedMode||'safe'}).catch(()=>{});
        return;
      }
      if(msg?.type==='MLRADAR_HIGHLIGHT'){
        const i=Number(msg.matchIndex),card=lastCards[i]||getCards()[i];
        if(card){
          card.style.outline='5px solid #00a650';card.style.outlineOffset='4px';card.style.borderRadius='12px';
          let badge=card.querySelector(':scope > .mlradar-v12-badge');
          if(!badge){badge=document.createElement('div');badge.className='mlradar-v12-badge';badge.textContent='SEU ANÚNCIO • ML RADAR';badge.style.cssText='position:absolute;z-index:999999;background:#00a650;color:#fff;padding:7px 10px;border-radius:8px;font:bold 12px Arial;box-shadow:0 3px 12px #0005;left:8px;top:8px';if(getComputedStyle(card).position==='static')card.style.position='relative';card.appendChild(badge);}
        }
        sendResponse({ok:true});return;
      }
    })().catch(e=>sendResponse({ok:false,error:String(e?.message||e)}));
    return true;
  });

  (async()=>{
    if(!/^https:\/\/lista\.mercadolivre\.com\.br\//i.test(location.href)) return;
    await sleep(60);
    try{if(window.top!==window)await chrome.runtime.sendMessage({type:'MLRADAR_FRAME_READY',url:location.href}).catch(()=>{});}catch{}
    try{
      const ctx=await chrome.runtime.sendMessage({type:'MLRADAR_PAGE_READY',url:location.href});
      if(ctx?.scan) await sendPageResult(ctx);
    }catch{}
  })();
})();
