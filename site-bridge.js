(()=>{
  const SRC_REQ='ML_RADAR_V14_SITE_REQ',SRC_RES='ML_RADAR_V14_SITE_RES',SRC_READY='ML_RADAR_V14_SITE_READY',SRC_PUSH='ML_RADAR_V14_PUSH';
  try{window.postMessage({source:SRC_READY},'*');}catch{}
  window.addEventListener('message',ev=>{
    const d=ev.data;if(!d||d.source!==SRC_REQ||!d.id||!d.payload)return;
    chrome.runtime.sendMessage(d.payload,r=>{
      const err=chrome.runtime.lastError?.message||'';
      try{window.postMessage({source:SRC_RES,id:d.id,response:r,error:err},'*');}catch{}
    });
  });
  chrome.runtime.onMessage.addListener((msg)=>{
    if(msg?.type==='MLRADAR_HOST_NAVIGATE' || msg?.type==='EMBED_NAVIGATE' || msg?.type==='SCAN_PROGRESS' || msg?.type==='SCAN_COMPLETE' || msg?.type==='STATE_UPDATED' || msg?.type==='RUNNER_UPDATED'){
      try{window.postMessage({source:SRC_PUSH,payload:msg},'*');}catch{}
    }
  });
})();