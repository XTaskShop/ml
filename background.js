const JOB_KEY='mlRadarV121Job';
const STATE_KEY='mlRadarV121State';
const LEGACY_KEYS=['mlRadarV12State','mlRadarV11State','mlRadarV10State','mlRadarV9State','mlRadarV8State','mlRadarV7State'];
const RUNNER_KEY='mlRadarV14EmbedRunner';
const DASH_KEY='mlRadarV121Dashboard';
const MAX_HISTORY=180;
const clean=(s='')=>String(s??'').replace(/\s+/g,' ').trim();
const norm=(s='')=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const extractMlb=(s='')=>{const m=String(s??'').match(/\bMLB-?(\d{6,})\b/i);return m?`MLB${m[1]}`:''};
const extractMlbu=(s='')=>{const m=String(s??'').match(/\bMLBU-?(\d{4,})\b/i);return m?`MLBU${m[1]}`:''};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pget=keys=>new Promise(r=>chrome.storage.local.get(keys,r));
const pset=obj=>new Promise(r=>chrome.storage.local.set(obj,r));
const stripHash=(u='')=>String(u).split('#')[0];
function searchUrl(keyword){const slug=clean(keyword).split(/\s+/).map(encodeURIComponent).join('-');return `https://lista.mercadolivre.com.br/${slug}`;}
function validTitle(s=''){const t=clean(s);if(!t||t.length<6)return false;return !/^(seguran[cç]a|mercado livre|verifique|checking|access denied)/i.test(t)&&!/seguran[cç]a\s*[—|\-]\s*mercado livre/i.test(t);}
function decodeHtml(s=''){return String(s).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}

async function getJob(){const o=await pget([JOB_KEY]);return o[JOB_KEY]||null;}
async function saveJob(job){await pset({[JOB_KEY]:job});broadcast({type:'SCAN_PROGRESS',job});return job;}
async function getState(){const o=await pget([STATE_KEY,...LEGACY_KEYS]);if(o[STATE_KEY])return o[STATE_KEY];for(const k of LEGACY_KEYS){if(o[k]){await pset({[STATE_KEY]:o[k]});return o[k];}}return{target:null,records:{}};}
async function saveState(state){await pset({[STATE_KEY]:state});broadcast({type:'STATE_UPDATED',state});}
function broadcast(msg){try{chrome.runtime.sendMessage(msg).catch(()=>{});}catch{}}

async function getDashboard(){
  const o=await pget([DASH_KEY]);const saved=o[DASH_KEY];
  if(saved?.tabId){try{const t=await chrome.tabs.get(saved.tabId);if(t?.url===chrome.runtime.getURL('dashboard.html'))return{windowId:t.windowId,tabId:t.id};}catch{}}
  const tabs=await chrome.tabs.query({url:chrome.runtime.getURL('dashboard.html')});
  if(tabs[0])return{windowId:tabs[0].windowId,tabId:tabs[0].id};
  return null;
}
async function openDashboard(focus=true){
  const found=await getDashboard();
  if(found){if(focus)try{await chrome.tabs.update(found.tabId,{active:true});await chrome.windows.update(found.windowId,{focused:true});}catch{};return found;}
  const tab=await chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html'),active:focus});
  const out={windowId:tab.windowId,tabId:tab.id};await pset({[DASH_KEY]:out});return out;
}
chrome.action.onClicked.addListener(()=>openDashboard(true).catch(()=>{}));
chrome.runtime.onInstalled.addListener(()=>{});

async function getRunner(){
  const o=await pget([RUNNER_KEY]);const r=o[RUNNER_KEY]||null;
  if(!r?.tabId)return null;
  try{const t=await chrome.tabs.get(r.tabId);return{...r,windowId:t.windowId,hostUrl:t.url||''};}catch{await pset({[RUNNER_KEY]:null});return null;}
}
async function setRunner(r){await pset({[RUNNER_KEY]:r});broadcast({type:'RUNNER_UPDATED',runner:r});return r;}
async function ensureRunner(hostTabId=null){
  let tabId=hostTabId;
  if(!tabId){const d=await getDashboard();tabId=d?.tabId||null;}
  if(!tabId){const d=await openDashboard(true);tabId=d.tabId;}
  const old=await getRunner();
  if(old?.tabId===tabId)return old;
  return setRunner({tabId,frameId:null,url:'',ready:false,updatedAt:Date.now()});
}
async function navigateHost(job,url){
  job.currentUrl=url;job.frameId=null;job.updatedAt=Date.now();await saveJob(job);
  const payload={type:'EMBED_NAVIGATE',url,jobId:job.id,keyword:job.keyword,page:job.page};
  // Dashboard da extensão recebe por runtime; site externo recebe via content-script bridge.
  broadcast(payload);
  try{await chrome.tabs.sendMessage(job.tabId,{type:'MLRADAR_HOST_NAVIGATE',url,jobId:job.id,keyword:job.keyword,page:job.page});}catch{}
  return {ok:true};
}
async function registerFrame(sender,msg){
  const tabId=sender?.tab?.id,frameId=sender?.frameId;
  if(!tabId || !Number.isInteger(frameId) || frameId===0)return null;
  const runner={tabId,windowId:sender.tab.windowId,frameId,url:msg?.url||'',ready:true,updatedAt:Date.now()};
  await setRunner(runner);return runner;
}
async function closeRunner(){
  // Não existe popup na v14. Apenas limpa o vínculo do iframe embutido.
  await pset({[RUNNER_KEY]:null});broadcast({type:'RUNNER_UPDATED',runner:null});return{ok:true};
}
chrome.tabs.onRemoved.addListener(async tabId=>{
  const o=await pget([RUNNER_KEY,DASH_KEY]);
  if(o[RUNNER_KEY]?.tabId===tabId){await pset({[RUNNER_KEY]:null});broadcast({type:'RUNNER_UPDATED',runner:null});}
  if(o[DASH_KEY]?.tabId===tabId)await pset({[DASH_KEY]:null});
});

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  (async()=>{
    if(msg?.type==='GET_CONTEXT'){const[job,state,runner]=await Promise.all([getJob(),getState(),getRunner()]);sendResponse({ok:true,job,state,runner});return;}
    if(msg?.type==='OPEN_DASHBOARD'){sendResponse({ok:true,dashboard:await openDashboard(true)});return;}
    if(msg?.type==='GET_RUNNER'){sendResponse({ok:true,runner:await getRunner()});return;}
    if(msg?.type==='OPEN_RUNNER'){sendResponse({ok:true,runner:await ensureRunner(sender?.tab?.id||null)});return;}
    if(msg?.type==='FOCUS_RUNNER'){sendResponse({ok:true,runner:await getRunner()});return;}
    if(msg?.type==='ARRANGE_WINDOWS'){sendResponse({ok:true,runner:await getRunner()});return;}
    if(msg?.type==='CLOSE_RUNNER'){sendResponse(await closeRunner());return;}
    if(msg?.type==='MLRADAR_FRAME_READY'){sendResponse({ok:true,runner:await registerFrame(sender,msg)});return;}
    if(msg?.type==='RESOLVE_TARGET'){sendResponse(await resolveTarget(msg.value||''));return;}
    if(msg?.type==='SET_TARGET'){const state=await getState();state.target=msg.target||null;await saveState(state);sendResponse({ok:true,state});return;}
    if(msg?.type==='TEST_RUNNER'){sendResponse(await testRunner());return;}
    if(msg?.type==='START_SCAN'){sendResponse(await startScan(msg,sender));return;}
    if(msg?.type==='CANCEL_SCAN'){sendResponse(await cancelScan());return;}
    if(msg?.type==='DELETE_KEYWORD'){const state=await getState();delete state.records?.[msg.key];await saveState(state);sendResponse({ok:true,state});return;}
    if(msg?.type==='CLEAR_HISTORY'){const state=await getState();state.records={};await saveState(state);sendResponse({ok:true,state});return;}
    if(msg?.type==='MLRADAR_PAGE_READY'){
      const tabId=sender?.tab?.id,frameId=sender?.frameId,job=await getJob();
      if(tabId&&frameId)await registerFrame(sender,msg);
      if(job?.status==='running'&&tabId===job.tabId&&frameId!==0){job.frameId=frameId;await saveJob(job);sendResponse({ok:true,scan:true,jobId:job.id,target:job.target,page:job.page,keyword:job.keyword,speedMode:job.speedMode||'safe'});}
      else sendResponse({ok:true,scan:false});return;
    }
    if(msg?.type==='MLRADAR_PAGE_RESULT'){const tabId=sender?.tab?.id;sendResponse({ok:true});await handlePageResult(tabId,msg,sender?.frameId);return;}
    if(msg?.type==='MLRADAR_ADVANCE_FAILED'){const tabId=sender?.tab?.id;sendResponse({ok:true});await handleAdvanceFailed(tabId,msg,sender?.frameId);return;}
  })().catch(e=>sendResponse({ok:false,error:String(e?.message||e)}));
  return true;
});

async function resolveTarget(raw){
  raw=clean(raw);if(!raw)return{ok:false,error:'Informe o link ou MLB do anúncio.'};
  const mlb=extractMlb(raw);if(!mlb)return{ok:false,error:'Não encontrei um MLB válido. Cole o código MLB ou o link do anúncio.'};
  const out={ok:true,mlb,title:'',familyName:'',permalink:'',sellerId:null,sellerName:'',userProductId:'',catalogProductId:'',relatedIds:[mlb],source:'MLB'};
  try{const r=await fetch(`https://api.mercadolibre.com/items/${mlb}`,{cache:'no-store',credentials:'omit'});if(r.ok){const j=await r.json();if(validTitle(j?.title))out.title=clean(j.title);out.familyName=clean(j?.family_name||'');out.permalink=j?.permalink||'';out.sellerId=j?.seller_id??null;out.userProductId=extractMlbu(j?.user_product_id||'');out.catalogProductId=extractMlb(j?.catalog_product_id||'');out.source='API';}}catch{}
  if(!out.userProductId||!out.title){
    const urls=[];if(/^https?:\/\//i.test(raw))urls.push(raw);if(out.permalink)urls.push(out.permalink);urls.push(`https://produto.mercadolivre.com.br/MLB-${mlb.replace(/\D/g,'')}`);
    for(const u of [...new Set(urls)]){try{const r=await fetch(u,{cache:'no-store',credentials:'include',redirect:'follow'});if(!r.ok)continue;const html=await r.text();if(/seguran[cç]a\s*[—|\-]\s*mercado livre|captcha|access denied|robot/i.test(html.slice(0,120000)))continue;if(!out.userProductId){const mm=html.match(/(?:user_product_id|userProductId)[^A-Z0-9]{0,80}["']?(MLBU-?\d{4,})/i)||html.match(/\bMLBU-?(\d{4,})\b/i);if(mm){const v=mm[1]?.toUpperCase().startsWith('MLBU')?mm[1]:`MLBU${mm[1]}`;out.userProductId=extractMlbu(v);}}if(!out.catalogProductId){const mm=html.match(/(?:catalog_product_id|catalogProductId)[^A-Z0-9]{0,80}["']?(MLB-?\d{4,})/i);if(mm)out.catalogProductId=extractMlb(mm[1]);}if(!out.title){const c=[html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1],html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]].filter(Boolean).map(x=>decodeHtml(clean(x.replace(/\s*\|\s*Mercado\s*Livre.*$/i,''))));const good=c.find(validTitle);if(good)out.title=good;}if(out.userProductId&&out.title)break;}catch{}}
  }
  out.relatedIds=[...new Set([out.mlb,out.userProductId,out.catalogProductId].filter(Boolean))];return out;
}

async function testRunner(){
  const r=await getRunner();if(!r?.tabId||!r?.frameId)return{ok:false,error:'O Mercado Livre embutido ainda está carregando. Aguarde alguns segundos.'};
  const state=await getState();
  try{const x=await sendFrame(r.tabId,r.frameId,{type:'MLRADAR_PARSE_NOW',target:state.target||{},page:1,test:true,speedMode:'fast'},10000);if(!x?.ok)return{ok:false,error:x?.error||'O leitor não respondeu.'};return{ok:true,parsed:x.parsed,runner:await getRunner()};}
  catch(e){return{ok:false,error:'O Mercado Livre embutido não respondeu: '+String(e?.message||e)};}
}

async function startScan(msg,sender){
  let state=await getState();const resolved=msg.target?.mlb?{...msg.target,ok:true}:await resolveTarget(msg.target||'');if(!resolved?.ok)return resolved;
  const words=[...new Set((msg.keywords||[]).map(clean).filter(Boolean))].slice(0,80);if(!words.length)return{ok:false,error:'Informe pelo menos uma palavra-chave.'};
  state.target={mlb:resolved.mlb,title:validTitle(resolved.title)?resolved.title:'',familyName:resolved.familyName||'',permalink:resolved.permalink||'',sellerId:resolved.sellerId??null,sellerName:resolved.sellerName||'',userProductId:resolved.userProductId||'',catalogProductId:resolved.catalogProductId||'',relatedIds:[...new Set([resolved.mlb,resolved.userProductId,resolved.catalogProductId,...(resolved.relatedIds||[])].filter(Boolean))]};await saveState(state);
  const runner=await ensureRunner(sender?.tab?.id||null);
  const speedMode=['safe','fast','turbo'].includes(msg.speedMode)?msg.speedMode:'fast';
  const job={id:`job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,tabId:runner.tabId,frameId:runner.frameId||null,windowId:runner.windowId,target:state.target,keywords:words,keywordIndex:0,keyword:words[0],page:1,checked:0,sponsoredBefore:0,reportedTotal:0,lastSignature:'',repeatCount:0,status:'running',phase:'navigating',speedMode,startedAt:Date.now(),keywordStartedAt:Date.now(),updatedAt:Date.now(),progressText:`Abrindo “${words[0]}” • modo ${speedMode.toUpperCase()}...`,currentUrl:searchUrl(words[0]),results:[],diagnostics:{lastIds:0,lastMLB:0,lastMLBU:0}};
  await saveJob(job);await navigateInitial(job,job.currentUrl);return{ok:true,job,runner:await getRunner()};
}
async function navigateInitial(job,url){
  job.phase='navigating';job.currentUrl=url;job.frameId=null;job.updatedAt=Date.now();await saveJob(job);
  await navigateHost(job,url);
}

async function handlePageResult(tabId,msg,frameId){
  let job=await getJob();if(!job||job.status!=='running'||job.id!==msg.jobId||job.tabId!==tabId)return;
  if(frameId&&frameId!==0)job.frameId=frameId;
  const parsed=msg.parsed||{};job.phase='processing';job.updatedAt=Date.now();const pageNo=Number(parsed.pageNo)||job.page;job.page=pageNo;
  if(!parsed.itemsCount)return failKeyword(job,`A página ${pageNo} abriu, mas nenhum card foi lido.`);
  if(!job.reportedTotal&&parsed.total&&parsed.total>=parsed.itemsCount)job.reportedTotal=parsed.total;
  job.diagnostics={lastIds:parsed.idsCount||0,lastMLB:parsed.mlbCount||0,lastMLBU:parsed.mlbuCount||0,nextExists:!!parsed.nextExists,nextHrefRaw:parsed.nextHrefRaw??null,activePage:parsed.activePage||0};
  job.preview=(parsed.preview||[]).map(x=>({...x,globalPosition:job.checked+(Number(x.idx)||0)+1}));
  if(pageNo>1&&parsed.signature&&parsed.signature===job.lastSignature){job.repeatCount=(job.repeatCount||0)+1;if(job.repeatCount>=2)return failKeyword(job,'Os mesmos anúncios continuaram na tela após duas tentativas de avançar.');job.progressText=`Página ${pageNo}: aguardando os cards novos; tentando Seguinte novamente...`;await saveJob(job);return requestNext(job,pageNo+1,true);}
  job.repeatCount=0;job.lastSignature=parsed.signature||job.lastSignature;
  if(parsed.matchIndex>=0){
    const position=job.checked+parsed.matchIndex+1;const result={ok:true,found:true,keyword:job.keyword,position,ahead:position-1,sponsoredAhead:job.sponsoredBefore+(parsed.sponsoredAheadOnPage||0),page:pageNo,checked:position,reportedTotal:job.reportedTotal||parsed.total||0,matchType:parsed.matchType||'identificação exata',foundTitle:parsed.foundTitle||'',foundId:parsed.foundId||'',ts:Date.now(),durationMs:Date.now()-job.keywordStartedAt,diagnostics:job.diagnostics};
    if(!job.target.title&&parsed.foundTitle){job.target.title=parsed.foundTitle;const state=await getState();state.target={...(state.target||{}),title:parsed.foundTitle};await saveState(state);}
    try{await sendFrame(tabId,job.frameId,{type:'MLRADAR_HIGHLIGHT',matchIndex:parsed.matchIndex});}catch{}
    job.progressText=`ENCONTRADO #${position} • ${position-1} anúncios na frente`;await saveJob(job);await sleep(job.speedMode==='safe'?420:job.speedMode==='turbo'?80:120);return finishKeyword(job,result);
  }
  job.checked+=parsed.itemsCount;job.sponsoredBefore+=parsed.sponsoredCount||0;job.progressText=`Página ${pageNo}: ${job.checked.toLocaleString('pt-BR')} verificados • ${parsed.idsCount||0} IDs lidos`;await saveJob(job);
  if(!parsed.nextExists)return finishKeyword(job,{ok:true,found:false,keyword:job.keyword,position:null,ahead:null,sponsoredAhead:null,page:pageNo,checked:job.checked,reportedTotal:job.reportedTotal||job.checked,matchType:'',foundTitle:'',ts:Date.now(),durationMs:Date.now()-job.keywordStartedAt,diagnostics:job.diagnostics});
  return requestNext(job,pageNo+1,false);
}
async function requestNext(job,nextPage,retry){
  job.page=nextPage;job.phase='advancing';job.updatedAt=Date.now();job.progressText=`${retry?'Repetindo avanço':'Clicando no Seguinte real'} → página ${nextPage}`;await saveJob(job);
  try{if(!job.frameId)return failKeyword(job,'O quadro do Mercado Livre ainda não terminou de carregar.');const r=await sendFrame(job.tabId,job.frameId,{type:'MLRADAR_GO_NEXT',jobId:job.id,target:job.target,page:nextPage,speedMode:job.speedMode||'safe'},5000);if(!r?.ok)return failKeyword(job,r?.error||'Não consegui acionar o botão Seguinte.');}
  catch(e){const text=String(e?.message||e);if(/message port closed|receiving end does not exist|frame/i.test(text)){await sleep(job.speedMode==='safe'?900:350);return;}return failKeyword(job,'Falha ao acionar o botão Seguinte: '+text);}
}
async function handleAdvanceFailed(tabId,msg,frameId){const job=await getJob();if(!job||job.status!=='running'||job.id!==msg.jobId||job.tabId!==tabId)return;job.diagnostics={...(job.diagnostics||{}),advance:msg.diagnostics||{}};return failKeyword(job,`${msg.error||'Não consegui avançar.'} O runner usa o botão real “Seguinte”.`);}
async function failKeyword(job,error){return finishKeyword(job,{ok:false,found:false,keyword:job.keyword,position:null,ahead:null,sponsoredAhead:null,page:job.page,checked:job.checked,reportedTotal:job.reportedTotal||0,error,ts:Date.now(),durationMs:Date.now()-job.keywordStartedAt,diagnostics:job.diagnostics});}
async function finishKeyword(job,result){
  let state=await getState();const key=norm(job.keyword),old=state.records?.[key]||{keyword:job.keyword,history:[]};state.records=state.records||{};state.records[key]={keyword:job.keyword,last:result,history:[...(old.history||[]),result].slice(-MAX_HISTORY)};await saveState(state);
  job.results=[...(job.results||[]),result];job.keywordIndex+=1;
  if(job.keywordIndex>=job.keywords.length){job.status='complete';job.phase='idle';job.completedAt=Date.now();job.updatedAt=Date.now();job.progressText=`Concluído • ${job.results.length} palavra(s) analisada(s)`;await saveJob(job);broadcast({type:'SCAN_COMPLETE',job,state});return;}
  job.keyword=job.keywords[job.keywordIndex];job.page=1;job.checked=0;job.sponsoredBefore=0;job.reportedTotal=0;job.lastSignature='';job.repeatCount=0;job.keywordStartedAt=Date.now();job.currentUrl=searchUrl(job.keyword);job.phase='navigating';job.updatedAt=Date.now();job.progressText=`Próxima palavra: “${job.keyword}”`;await saveJob(job);await sleep(job.speedMode==='safe'?420:job.speedMode==='turbo'?80:120);await navigateInitial(job,job.currentUrl);
}
async function cancelScan(){const job=await getJob();if(job){job.status='cancelled';job.phase='idle';job.error='Análise cancelada.';job.updatedAt=Date.now();await saveJob(job);}return{ok:true};}
function sendFrame(tabId,frameId,payload,timeoutMs=5000){return new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>{if(done)return;done=true;reject(new Error('Tempo esgotado aguardando o leitor do Mercado Livre embutido.'));},timeoutMs);const opts=frameId?{frameId}:undefined;chrome.tabs.sendMessage(tabId,payload,opts,r=>{if(done)return;done=true;clearTimeout(timer);if(chrome.runtime.lastError)reject(new Error(chrome.runtime.lastError.message));else resolve(r);});});}
