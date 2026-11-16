/* Mes tâches — application (MVP). Tout est local : aucun serveur. */
(function(){
'use strict';
const APP_VERSION='1.0.1';
const KEY='mestaches.v3', DRAFT_KEY='mestaches.draft', DISMISS_KEY='mestaches.dismiss';
const $=id=>document.getElementById(id);
let tasks=[], projects=[], lastBackup=null, savedAt=0;
let filter='todo', projFilter='Tous', drafts=[], editId=null, editPrio='normale', postId=null, postDate=null;
let updRequested=false;
let listening=false, undoFn=null, toastTimer=null, resetArmed=false, deferredInstall=null, waitingSW=null, storageWarned=false;
let dismiss={}; try{dismiss=JSON.parse(localStorage.getItem(DISMISS_KEY)||'{}')||{}}catch(e){}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}

/* ---------- stockage : IndexedDB + miroir localStorage ---------- */
function idb(){return new Promise((res,rej)=>{
  if(!window.indexedDB) return rej(new Error('no idb'));
  const r=indexedDB.open('mestaches',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('kv');
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
})}
function idbPut(data){return idb().then(db=>new Promise((res,rej)=>{
  const t=db.transaction('kv','readwrite'); t.objectStore('kv').put(data,'state');
  t.oncomplete=()=>{db.close();res()}; t.onerror=()=>{db.close();rej(t.error)}; t.onabort=()=>{db.close();rej(t.error)};
}))}
function idbGet(){return idb().then(db=>new Promise((res,rej)=>{
  const q=db.transaction('kv').objectStore('kv').get('state');
  q.onsuccess=()=>{db.close();res(q.result)}; q.onerror=()=>{db.close();rej(q.error)};
}))}
function clean(r){
  if(!r||!Array.isArray(r.tasks)) return null;
  return {tasks:r.tasks.filter(x=>x&&typeof x.title==='string'&&x.title.trim()).map(x=>({
      id:x.id||uid(),title:x.title,date:x.date||null,time:x.time||null,
      prio:['haute','normale','basse'].includes(x.prio)?x.prio:'normale',proj:x.proj||'',done:!!x.done,doneAt:x.doneAt||null})),
    projects:(Array.isArray(r.projects)?r.projects:[]).filter(p=>typeof p==='string'&&p.trim()),
    lastBackup:r.lastBackup||null, savedAt:r.savedAt||0};
}
function apply(r){tasks=r.tasks;projects=r.projects;lastBackup=r.lastBackup;savedAt=r.savedAt}
function save(){
  savedAt=Date.now();
  const data={v:3,tasks,projects,lastBackup,savedAt};
  let lsOk=true; try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){lsOk=false}
  idbPut(data).then(()=>{storageWarned=false}).catch(()=>{
    if(!lsOk&&!storageWarned){storageWarned=true;toast('⚠️ Enregistrement impossible sur cet appareil. Faites une sauvegarde.',null)}
  });
}
function loadSync(){
  try{const r=clean(JSON.parse(localStorage.getItem(KEY)||'null')); if(r) apply(r)}catch(e){}
}
function loadAsync(){
  idbGet().then(raw=>{const r=clean(raw); if(r&&r.savedAt>savedAt){apply(r);render();renderBanners()}}).catch(()=>{});
  if(navigator.storage&&navigator.storage.persist){navigator.storage.persist().catch(()=>{})}
}

/* ---------- projets ---------- */
function addProject(name){
  name=name.trim().replace(/\s+/g,' '); if(!name) return null; name=cap(name);
  const ex=projects.find(p=>p.toLowerCase()===name.toLowerCase()); if(ex) return ex;
  projects.push(name); return name;
}
function guessProject(title){
  const low=' '+title.toLowerCase()+' ';
  const byLen=[...projects].sort((a,b)=>b.length-a.length);
  for(const p of byLen){const re=new RegExp("[\\s,(']"+p.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=[\\s,).])');if(re.test(low))return p}
  const m=title.match(/\b(ligne|presse|machine|four|compresseur|atelier|chaudière|robot|convoyeur|pont|cuve|zone|bâtiment|hall|poste|cellule|chantier|tour|fraiseuse|injecteuse)\s+(n°\s?)?(\d+|[A-Z])\b/i);
  if(m&&(/^\d+$/.test(m[3])||/^[A-Z]$/.test(m[3]))) return {create:cap(m[1].toLowerCase())+' '+m[3]};
  return null;
}

/* ---------- affichage ---------- */
function render(){
  const t=iso(today());
  $('today').textContent=today().toLocaleDateString('fr-BE',{weekday:'long',day:'numeric',month:'long'});
  const inProj=x=>projFilter==='Tous'||(x.proj||'Sans projet')===projFilter;
  const open=tasks.filter(x=>!x.done&&inProj(x));
  $('sLate').textContent=open.filter(x=>x.date&&x.date<t).length;
  $('sToday').textContent=open.filter(x=>x.date===t).length;
  const wk=iso(addDays(today(),-7));
  $('sDone').textContent=tasks.filter(x=>x.done&&inProj(x)&&(x.doneAt||'')>=wk).length;

  const counts={}; tasks.filter(x=>!x.done).forEach(x=>{const p=x.proj||'Sans projet';counts[p]=(counts[p]||0)+1});
  const plist=['Tous',...projects,...(counts['Sans projet']&&projects.length?['Sans projet']:[])];
  if(!plist.includes(projFilter)) projFilter='Tous';
  $('projects').innerHTML=plist.length>1||tasks.length?plist.map(p=>`<button class="pchip ${p===projFilter?'on':''}" data-p="${esc(p)}">${esc(p)}<i>${p==='Tous'?tasks.filter(x=>!x.done).length:(counts[p]||0)}</i></button>`).join('')
    +`<button class="pchip add" id="addProj">＋ Projet</button>`:'';

  const po={haute:0,normale:1,basse:2};
  const key=x=>(x.date||'9999')+(x.time||'99');
  const sort=a=>a.sort((x,y)=>key(x)<key(y)?-1:key(x)>key(y)?1:po[x.prio]-po[y.prio]);
  let groups;
  if(filter==='done') groups=[['Terminées',tasks.filter(x=>x.done&&inProj(x)).sort((a,b)=>(b.doneAt||'').localeCompare(a.doneAt||'')),'']];
  else{
    const late=sort(open.filter(x=>x.date&&x.date<t)), td=sort(open.filter(x=>x.date===t));
    if(filter==='today') groups=[['En retard',late,'late'],["Aujourd'hui",td,'']];
    else{const tm=iso(addDays(today(),1));
      groups=[['En retard',late,'late'],["Aujourd'hui",td,''],['Demain',sort(open.filter(x=>x.date===tm)),''],
        ['Plus tard',sort(open.filter(x=>x.date&&x.date>tm)),''],['Sans date',sort(open.filter(x=>!x.date)),'']];}
  }
  let html=groups.filter(g=>g[1].length).map(([n,arr,c])=>`<div class="group ${c}"><h2>${n}<i>${arr.length}</i>${c==='late'?'<button class="bulk" data-bulk="late">Tout reporter à aujourd’hui</button>':''}</h2>${arr.map(card).join('')}</div>`).join('');
  if(!html){
    if(!tasks.length) html=`<div class="hello"><h2>Bienvenue 👋</h2>
      <p>Touchez le <b>micro</b> en bas, puis dites vos tâches comme vous les diriez à un collègue.</p>
      <div class="say">« Vérifier la pompe de la ligne 3 avant jeudi, urgent, et appeler le fournisseur demain à 10h. »</div>
      <p>L’appli en fait <b>deux tâches</b>, avec la date, l’heure et l’urgence. Vous vérifiez, vous ajoutez. C’est tout.</p>
      <p class="small">Pas de réseau ? Touchez le stylo, puis le micro 🎤 de votre clavier. Pensez à faire une sauvegarde de temps en temps (menu ⋯).</p></div>`;
    else html=`<div class="empty"><b>${filter==='done'?'📋':'🎉'}</b>${filter==='done'?'Aucune tâche terminée pour l’instant.':'Rien à faire ici. Touchez le micro pour ajouter une tâche.'}</div>`;
  }
  $('list').innerHTML=html;
}
function card(x){
  const l=label(x.date), n=x.date?diffDays(x.date):null, dc=n===null?'':n<0?'d-late':n===0?'d-today':'';
  const when=l?('📅 '+l+(x.time?' · '+x.time.replace(':','h'):'')):(x.time?'⏰ '+x.time.replace(':','h'):'');
  const post=x.done?'':`<button class="post" data-post="${esc(x.id)}" aria-label="Reporter la tâche"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>`;
  return `<div class="task p-${x.prio} ${x.done?'done':''}" data-id="${esc(x.id)}">
    <button class="chk" data-chk="${esc(x.id)}" aria-label="${x.done?'Remettre à faire':'Marquer comme faite'}"><span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M5 12l5 5L20 7"/></svg></span></button>
    <div class="body"><div class="t">${esc(x.title)}</div><div class="chips">
      ${x.prio==='haute'?'<span class="chip urg">Urgent</span>':x.prio==='basse'?'<span class="chip low">Pas pressé</span>':''}
      ${when&&!x.done?`<span class="chip ${dc}">${when}</span>`:''}
      ${x.proj?`<span class="chip proj">${esc(x.proj)}</span>`:''}</div></div>${post}</div>`;
}

/* ---------- liste ---------- */
$('list').addEventListener('click',e=>{
  const bulk=e.target.closest('[data-bulk]');
  if(bulk){const t=iso(today()); const ids=tasks.filter(x=>!x.done&&x.date&&x.date<t&&(projFilter==='Tous'||(x.proj||'Sans projet')===projFilter)).map(x=>[x.id,x.date]);
    ids.forEach(([id])=>{tasks.find(x=>x.id===id).date=t}); save(); render();
    toast(ids.length+(ids.length>1?' tâches reportées à aujourd’hui':' tâche reportée à aujourd’hui'),()=>{ids.forEach(([id,d])=>{const x=tasks.find(y=>y.id===id);if(x)x.date=d});save();render()});return}
  const p=e.target.closest('[data-post]'); if(p){openPost(p.dataset.post);return}
  const c=e.target.closest('[data-chk]');
  if(c){const x=tasks.find(t=>t.id===c.dataset.chk); if(!x) return;
    const was=x.done; x.done=!x.done; x.doneAt=x.done?iso(today()):null; save();
    c.closest('.task').classList.toggle('done'); setTimeout(render,350);
    if(!was) toast('Tâche terminée',()=>{x.done=false;x.doneAt=null;save();render()});
    return}
  const k=e.target.closest('.task'); if(k) openEdit(k.dataset.id);
});
$('tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  filter=b.dataset.f;[...$('tabs').children].forEach(x=>x.classList.toggle('on',x===b));render()});
$('projects').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.id==='addProj'){$('pName').value='';show('vProj');setTimeout(()=>$('pName').focus(),150);return}
  projFilter=b.dataset.p;render()});
$('pCancel').onclick=()=>hide('vProj');
$('pSave').onclick=()=>{const p=addProject($('pName').value); if(!p){$('pName').focus();return}
  tasks.forEach(x=>{if(!x.proj){const g=guessProject(x.title); if(g===p) x.proj=p}});
  save();hide('vProj');projFilter=p;render();toast('Projet « '+p+' » créé',null)};

/* ---------- feuilles ---------- */
function show(id){$(id).classList.add('show')}
function hide(id){$(id).classList.remove('show')}
function vv(){const v=window.visualViewport; const h=v?v.height:innerHeight;
  document.documentElement.style.setProperty('--vvh',h+'px');
  document.querySelectorAll('.veil').forEach(el=>el.style.top=(v?v.offsetTop:0)+'px')}
if(window.visualViewport){visualViewport.addEventListener('resize',vv);visualViewport.addEventListener('scroll',vv)} vv();
function keepText(){return $('txt').value.trim()||drafts.length}
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;
  if($('vDict').classList.contains('show')){ if(keepText()){$('dictHint').textContent='Votre texte est gardé. Touchez « Annuler » pour fermer.'} else closeDict() }
  ['vEdit','vProj','vMenu','vPost'].forEach(hide)});
['vEdit','vProj','vMenu','vPost'].forEach(id=>$(id).addEventListener('click',e=>{if(e.target===$(id))hide(id)}));
$('vDict').addEventListener('click',e=>{
  if(e.target!==$('vDict'))return;
  if(keepText()){$('dictHint').textContent='Votre texte est gardé. Touchez « Annuler » pour fermer.';return}
  closeDict()});

/* ---------- dictée (service vocal du téléphone) ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null, startGuard=null, gotStart=false, lastPart='';
function setDraft(v){try{v?localStorage.setItem(DRAFT_KEY,v):localStorage.removeItem(DRAFT_KEY)}catch(e){}}
function warn(msg){$('micWarn').textContent=msg||''}
function addSpoken(txt){txt=(txt||'').trim(); if(!txt) return; const ta=$('txt');ta.value=(ta.value?ta.value.trim()+' ':'')+txt;setDraft(ta.value)}
function openDict(withMic){
  drafts=[];$('partial').textContent='';$('previews').innerHTML='';warn('');
  let old=''; try{old=localStorage.getItem(DRAFT_KEY)||''}catch(e){}
  $('txt').value=old;
  $('rowA').style.display='flex';$('rowB').style.display='none';$('txt').style.display='';$('exBox').style.display='';
  $('liveRow').style.display=SR?'flex':'none';
  $('dictHint').textContent=old?'Votre dernier texte non ajouté a été retrouvé.':(SR?'Parlez naturellement. Plusieurs tâches d’un coup, c’est possible.':'Écrivez, ou touchez le micro de votre clavier pour dicter.');
  show('vDict');
  // hors réseau, la dictée intégrée échoue presque toujours : on propose directement le micro du clavier
  const offlineNoLocal=!navigator.onLine&&!(SR&&'processLocally' in SR.prototype);
  if(withMic&&SR&&!old&&!offlineNoLocal) startMic();
  else{ if(withMic&&SR&&offlineNoLocal) warn('Pas de réseau : touchez le champ de texte puis le micro 🎤 de votre clavier.'); setTimeout(()=>$('txt').focus(),150); }
}
function micFail(code){
  clearTimeout(startGuard); listening=false; setMic(false);
  if(code==='aborted') return;
  const kb=' Touchez le champ de texte puis le micro 🎤 de votre clavier.';
  const msg={
    'not-allowed':'Le micro est refusé pour cette appli. Autorisez-le dans les réglages du navigateur, ou utilisez le micro du clavier.',
    'service-not-allowed':'La dictée intégrée est désactivée sur ce téléphone.'+kb,
    'network':'La dictée intégrée demande du réseau.'+kb,
    'language-not-supported':'Le français hors réseau n’est pas installé pour la dictée intégrée.'+kb,
    'no-speech':'Je n’ai rien entendu. Touchez le micro et réessayez, plus près de la bouche.',
    'audio-capture':'Aucun micro détecté.'+kb,
    'timeout':'La dictée intégrée ne répond pas sur ce téléphone.'+kb
  }[code]||'La dictée intégrée n’est pas disponible.'+kb;
  warn(msg);
  if(code!=='no-speech') setTimeout(()=>$('txt').focus(),100);
}
function startMic(){
  if(!SR||listening) return; warn('');
  try{
    rec=new SR(); rec.lang='fr-FR'; rec.interimResults=true; rec.continuous=false; rec.maxAlternatives=1;
    if(!navigator.onLine&&'processLocally' in rec){try{rec.processLocally=true}catch(e){}}
    gotStart=false; lastPart='';
    rec.onstart=()=>{gotStart=true;clearTimeout(startGuard);listening=true;setMic(true)};
    rec.onresult=ev=>{let fin='',part='';
      for(let i=ev.resultIndex;i<ev.results.length;i++){const r=ev.results[i]; if(r.isFinal) fin+=r[0].transcript; else part+=r[0].transcript}
      if(fin) addSpoken(fin);
      lastPart=part; $('partial').textContent=part};
    rec.onerror=ev=>micFail(ev.error);
    // certains navigateurs (Safari iOS) s'arrêtent sans résultat « final » : on garde le dernier texte entendu
    rec.onend=()=>{clearTimeout(startGuard);listening=false;setMic(false);if(lastPart){addSpoken(lastPart);lastPart=''}$('partial').textContent=''};
    rec.start();
    startGuard=setTimeout(()=>{if(!gotStart){try{rec.abort()}catch(e){}micFail('timeout')}},6000);
  }catch(e){micFail('start')}
}
function stopMic(){try{rec&&rec.stop()}catch(e){}}
function setMic(on){$('bigMic').classList.toggle('on',on);$('liveTxt').textContent=on?'Je vous écoute… touchez pour arrêter':'Touchez le micro pour parler'}
$('btnMic').onclick=()=>openDict(true);
$('btnType').onclick=()=>openDict(false);
$('bigMic').onclick=()=>{ if(listening) stopMic(); else startMic() };
$('txt').addEventListener('input',()=>setDraft($('txt').value));
$('cancelD').onclick=closeDict;
function closeDict(){ if(listening){lastPart='';try{rec&&rec.abort()}catch(e){}} setDraft(''); hide('vDict') }

$('analyse').onclick=()=>{
  // micro encore ouvert : on garde ce qui a été entendu, puis on coupe sans attendre (sinon la fin de phrase arrive après l'analyse)
  if(listening){ addSpoken(lastPart||$('partial').textContent); lastPart=''; $('partial').textContent=''; try{rec&&rec.abort()}catch(e){} }
  const text=$('txt').value.trim(); if(!text){$('txt').focus();return}
  drafts=parseAll(text);
  if(!drafts.length) drafts=[{title:cap(text),date:null,time:null,prio:'normale'}];
  drafts.forEach(d=>{const g=guessProject(d.title); d.proj=g&&g.create?g.create:(g||'')});
  showPreviews();
};
function projOptions(sel){
  const all=[...projects]; if(sel&&!all.includes(sel)) all.push(sel);
  return `<option value="">Sans projet</option>`+all.map(p=>`<option value="${esc(p)}" ${p===sel?'selected':''}>${esc(p)}${projects.includes(p)?'':' (nouveau)'}</option>`).join('');
}
function showPreviews(){
  $('txt').style.display='none';$('partial').textContent='';$('exBox').style.display='none';$('liveRow').style.display='none';warn('');
  $('rowA').style.display='none';$('rowB').style.display='flex';
  $('dictHint').textContent=drafts.length+(drafts.length>1?' tâches proposées':' tâche proposée')+'. Vérifiez, corrigez si besoin, puis ajoutez.';
  $('previews').innerHTML=drafts.map((d,i)=>`<div class="prev p-${d.prio}" data-i="${i}">
    <div class="top"><input value="${esc(d.title)}" data-f="title" aria-label="Tâche ${i+1}"><button class="x" data-rm="${i}" aria-label="Retirer cette tâche">✕</button></div>
    <div class="mini">
      <input type="date" value="${d.date||''}" data-f="date" aria-label="Échéance">
      <input type="time" value="${d.time||''}" data-f="time" aria-label="Heure">
      <select data-f="prio" aria-label="Priorité">${['haute','normale','basse'].map(p=>`<option value="${p}" ${p===d.prio?'selected':''}>${{haute:'Urgent',normale:'Normal',basse:'Pas pressé'}[p]}</option>`).join('')}</select>
      <select data-f="proj" aria-label="Projet">${projOptions(d.proj)}</select>
    </div></div>`).join('');
}
function readPreviews(){[...$('previews').querySelectorAll('.prev')].forEach(p=>{const d=drafts[+p.dataset.i];
  p.querySelectorAll('[data-f]').forEach(el=>{const f=el.dataset.f;d[f]=(f==='date'||f==='time')?(el.value||null):el.value})})}
['input','change'].forEach(ev=>$('previews').addEventListener(ev,e=>{const p=e.target.closest('.prev'); if(!p) return;
  const d=drafts[+p.dataset.i], f=e.target.dataset.f; if(!d||!f) return;
  d[f]=(f==='date'||f==='time')?(e.target.value||null):e.target.value;
  if(f==='prio') p.className='prev p-'+d.prio}));
$('previews').addEventListener('click',e=>{const r=e.target.closest('[data-rm]');if(!r)return;
  readPreviews(); drafts.splice(+r.dataset.rm,1); drafts.length?showPreviews():backToText()});
$('backD').onclick=()=>{readPreviews();backToText()};
function backToText(){drafts=[];$('previews').innerHTML='';$('txt').style.display='';$('exBox').style.display='';
  $('liveRow').style.display=SR?'flex':'none';$('rowA').style.display='flex';$('rowB').style.display='none';
  $('dictHint').textContent='Corrigez le texte ou ajoutez des tâches.'}
$('addAll').onclick=()=>{
  readPreviews();
  const ok=drafts.filter(d=>d.title&&d.title.trim());
  if(!ok.length){$('dictHint').textContent='Donnez au moins un intitulé à la tâche.';return}
  ok.forEach(d=>{const pr=d.proj?addProject(d.proj):'';
    tasks.push({id:uid(),title:d.title.trim(),date:d.date,time:d.time||null,prio:d.prio,proj:pr||'',done:false})});
  save();setDraft('');drafts=[];hide('vDict');filter='todo';[...$('tabs').children].forEach(x=>x.classList.toggle('on',x.dataset.f==='todo'));render();renderBanners();
  toast(ok.length+(ok.length>1?' tâches ajoutées':' tâche ajoutée'),null);
};

/* ---------- édition ---------- */
function openEdit(id){
  const x=tasks.find(t=>t.id===id); if(!x) return; editId=id;
  $('eTitle').value=x.title;$('eDate').value=x.date||'';$('eTime').value=x.time||'';setPrio(x.prio);
  $('eProj').innerHTML=projOptions(x.proj||'')+'<option value="__new">＋ Nouveau projet…</option>';
  $('eProj').value=x.proj||''; $('eNewProj').style.display='none'; $('eNewProj').value='';
  show('vEdit');
}
$('eProj').onchange=()=>{const n=$('eProj').value==='__new';$('eNewProj').style.display=n?'':'none';if(n)$('eNewProj').focus()};
function setPrio(p){editPrio=p;[...$('ePrio').children].forEach(b=>b.classList.toggle('on',b.dataset.p===p))}
$('ePrio').onclick=e=>{const b=e.target.closest('button');if(b)setPrio(b.dataset.p)};
$('eCancel').onclick=()=>hide('vEdit');
$('eSave').onclick=()=>{const x=tasks.find(t=>t.id===editId); if(!x) return;
  x.title=$('eTitle').value.trim()||x.title;x.date=$('eDate').value||null;x.time=$('eTime').value||null;x.prio=editPrio;
  let p=$('eProj').value; if(p==='__new') p=addProject($('eNewProj').value)||''; x.proj=p;
  save();hide('vEdit');render()};
$('eDel').onclick=()=>{const i=tasks.findIndex(t=>t.id===editId); if(i<0) return; const del=tasks[i];
  tasks.splice(i,1);save();hide('vEdit');render();toast('Tâche supprimée',()=>{tasks.splice(i,0,del);save();render()})};

/* ---------- reporter en un geste ---------- */
function openPost(id){
  const x=tasks.find(t=>t.id===id); if(!x) return; postId=id; postDate=null;
  const t=today(), dow=t.getDay();
  const toMonday=((8-dow)%7)||7;
  const opts=[['Aujourd’hui',iso(t)],['Demain',iso(addDays(t,1))],['Lundi',iso(addDays(t,toMonday))],['Dans une semaine',iso(addDays(t,7))]]
    .filter(([,d],i,a)=>d!==x.date&&a.findIndex(o=>o[1]===d)===i);
  $('rTask').textContent=x.title;
  $('postOpts').innerHTML=opts.map(([n,d])=>`<button class="btn big" data-d="${d}">${n}<span style="float:right;color:var(--mute);font-weight:500">${label(d)===n?'':label(d)||''}</span></button>`).join('');
  $('rDate').value=x.date&&x.date>=iso(t)?x.date:'';
  show('vPost');
}
$('postOpts').addEventListener('click',e=>{const b=e.target.closest('[data-d]');if(b)doPost(b.dataset.d)});
$('rOk').onclick=()=>{if($('rDate').value) doPost($('rDate').value); else $('rDate').focus()};
$('rCancel').onclick=()=>hide('vPost');
function doPost(d){
  const x=tasks.find(t=>t.id===postId); if(!x) return; const old=x.date; x.date=d; save(); hide('vPost'); render();
  toast('Reporté : '+(label(d)||d),()=>{x.date=old;save();render()});
}

/* ---------- sauvegarde / restauration / partage ---------- */
function backupJSON(){return JSON.stringify({app:'mes-taches',version:APP_VERSION,exportedAt:new Date().toISOString(),tasks,projects},null,1)}
function stamp(){const t=today();return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')}
async function exportBackup(){
  const name='mes-taches-'+stamp()+'.json';
  const file=new File([backupJSON()],name,{type:'application/json'});
  try{
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Sauvegarde Mes tâches'}); markBackup(); return}
  }catch(e){ if(e&&e.name==='AbortError') return }
  try{
    const url=URL.createObjectURL(file), a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},2000); markBackup();
  }catch(e){toast('Sauvegarde impossible ici',null)}
}
function markBackup(){lastBackup=new Date().toISOString();save();hide('vMenu');renderBanners();toast('Sauvegarde créée ✔',null)}
$('mExport').onclick=exportBackup;
$('mImport').onclick=()=>$('fileIn').click();
$('fileIn').onchange=()=>{
  const f=$('fileIn').files[0]; $('fileIn').value=''; if(!f) return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const r=clean(JSON.parse(rd.result)); if(!r) throw new Error('format');
      const ids=new Set(tasks.map(x=>x.id)); let n=0;
      r.tasks.forEach(x=>{if(!ids.has(x.id)){tasks.push(x);n++}});
      r.projects.forEach(p=>{if(!projects.some(q=>q.toLowerCase()===p.toLowerCase())) projects.push(p)});
      tasks.forEach(x=>{if(x.proj&&!projects.includes(x.proj)) projects.push(x.proj)});
      save();hide('vMenu');render();renderBanners();toast(n?n+(n>1?' tâches restaurées':' tâche restaurée'):'Rien de nouveau : tout était déjà là',null);
    }catch(e){toast('Ce fichier n’est pas une sauvegarde de Mes tâches',null)}
  };
  rd.onerror=()=>toast('Lecture du fichier impossible',null);
  rd.readAsText(f);
};
function listText(){
  const open=tasks.filter(x=>!x.done).sort((a,b)=>((a.date||'9')+(a.time||'')).localeCompare((b.date||'9')+(b.time||'')));
  return 'MES TÂCHES — '+today().toLocaleDateString('fr-BE')+'\n\n'+(open.map(x=>'☐ '+x.title+(x.prio==='haute'?' [URGENT]':'')+(x.date?' — '+parseIso(x.date).toLocaleDateString('fr-BE')+(x.time?' '+x.time:''):'')+(x.proj?' ('+x.proj+')':'')).join('\n')||'Aucune tâche en cours.');
}
$('mCopy').onclick=async()=>{
  const txt=listText();
  try{ if(navigator.share){await navigator.share({title:'Mes tâches',text:txt});hide('vMenu');return} }catch(e){ if(e&&e.name==='AbortError') return }
  try{await navigator.clipboard.writeText(txt);hide('vMenu');toast('Liste copiée ✔',null)}catch(e){toast('Copie impossible ici',null)}
};
$('mReset').onclick=()=>{
  if(!resetArmed){resetArmed=true;$('mReset').textContent='⚠️ Touchez encore : TOUTES les tâches seront effacées';return}
  const bk={tasks:tasks.slice(),projects:projects.slice()};
  tasks=[];projects=[];projFilter='Tous';filter='todo';[...$('tabs').children].forEach(x=>x.classList.toggle('on',x.dataset.f==='todo'));
  save();hide('vMenu');render();renderBanners();toast('Tout est effacé',()=>{tasks=bk.tasks;projects=bk.projects;save();render();renderBanners()})};

/* ---------- menu, installation ---------- */
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function guideHTML(){
  if(standalone()) return '<p class="note">✔ L’application est déjà installée sur cet appareil.</p>';
  const ios='<ol><li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez le bouton <b>Partager</b> (carré avec une flèche).</li><li>Choisissez <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li><li>Ouvrez l’appli depuis son icône, <b>une première fois avec du réseau</b>.</li></ol>';
  const and='<ol><li>Ouvrez cette page dans <b>Chrome</b>.</li><li>Touchez <b>⋮</b>, puis <b>Installer l’application</b> (ou <b>Ajouter à l’écran d’accueil</b>).</li><li>Ouvrez l’appli depuis son icône, <b>une première fois avec du réseau</b>.</li></ol>';
  return isIOS?ios:and;
}
function openMenu(){
  resetArmed=false;$('mReset').textContent='🗑️ Tout effacer';
  const open=tasks.filter(x=>!x.done).length;
  $('mInfo').textContent=open+(open>1?' tâches en cours':' tâche en cours')+' · '+(lastBackup?'dernière sauvegarde : '+new Date(lastBackup).toLocaleDateString('fr-BE'):'aucune sauvegarde pour l’instant');
  $('guide').innerHTML=guideHTML();
  $('mInstall').style.display=deferredInstall?'':'none';
  $('mAbout').textContent='Mes tâches v'+APP_VERSION+' · LC Management Office · info@lcmanagementoffice.be · +32 488 036 851';
  show('vMenu');
}
$('btnMenu').onclick=openMenu;
$('mClose').onclick=()=>hide('vMenu');
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;renderBanners()});
addEventListener('appinstalled',()=>{deferredInstall=null;renderBanners()});
$('mInstall').onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();try{await deferredInstall.userChoice}catch(e){}deferredInstall=null;hide('vMenu');renderBanners()};

/* ---------- bandeaux : mise à jour, sauvegarde, installation ---------- */
function setDismiss(k){dismiss[k]=Date.now();try{localStorage.setItem(DISMISS_KEY,JSON.stringify(dismiss))}catch(e){}renderBanners()}
function dismissed(k,days){return dismiss[k]&&Date.now()-dismiss[k]<days*864e5}
function renderBanners(){
  const b=[];
  if(waitingSW) b.push(['upd','Une nouvelle version est prête.','Mettre à jour']);
  const old=!lastBackup||(Date.now()-new Date(lastBackup).getTime())>7*864e5;
  if(tasks.length>=5&&old&&!dismissed('bk',3)) b.push(['bk',lastBackup?'Pas de sauvegarde depuis plus d’une semaine.':'Pensez à faire une première sauvegarde de vos tâches.','Sauvegarder']);
  if(!standalone()&&tasks.length&&!dismissed('inst',14)&&(deferredInstall||isIOS)) b.push(['inst',deferredInstall?'Installez l’appli sur l’écran d’accueil.':'Pour l’installer : Partager, puis « Sur l’écran d’accueil ».',deferredInstall?'Installer':'Voir comment']);
  $('banners').innerHTML=b.map(([k,t,a])=>`<div class="banner"><span>${t}</span><button data-b="${k}">${a}</button>${k==='upd'?'':`<button class="x2" data-x="${k}" aria-label="Plus tard">✕</button>`}</div>`).join('');
}
$('banners').addEventListener('click',async e=>{
  const x=e.target.closest('[data-x]'); if(x){setDismiss(x.dataset.x);return}
  const b=e.target.closest('[data-b]'); if(!b) return;
  if(b.dataset.b==='upd'&&waitingSW){ updRequested=true; waitingSW.postMessage('SKIP_WAITING'); }
  else if(b.dataset.b==='bk') exportBackup();
  else if(b.dataset.b==='inst'){ if(deferredInstall){deferredInstall.prompt();try{await deferredInstall.userChoice}catch(err){}deferredInstall=null;renderBanners()} else openMenu() }
});

/* ---------- message ---------- */
function toast(msg,undo){
  $('toastTxt').textContent=msg;undoFn=undo;$('toastUndo').style.display=undo?'':'none';$('toast').classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').classList.remove('show');undoFn=null},5500);
}
$('toastUndo').onclick=()=>{if(undoFn)undoFn();undoFn=null;$('toast').classList.remove('show')};

/* ---------- réseau & jour ---------- */
function net(){const on=navigator.onLine;$('net').textContent=on?'En ligne':'Hors ligne · tout est enregistré ici';$('net').classList.toggle('off',!on)}
addEventListener('online',net);addEventListener('offline',net);
let day=iso(today());
function newDay(){if(iso(today())!==day){day=iso(today());render()}}
setInterval(newDay,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden) newDay()});

/* ---------- service worker : hors réseau + mises à jour ---------- */
if('serviceWorker' in navigator){
  addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      const watch=w=>w&&w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){waitingSW=w;renderBanners()}});
      if(reg.waiting&&navigator.serviceWorker.controller){waitingSW=reg.waiting;renderBanners()}
      reg.addEventListener('updatefound',()=>watch(reg.installing));
      document.addEventListener('visibilitychange',()=>{if(!document.hidden) reg.update().catch(()=>{})});
    }).catch(()=>{});
    let reloaded=false; const hadCtl=!!navigator.serviceWorker.controller;
    // recharge après « Mettre à jour » (même lors de la toute première visite), jamais à la première installation
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded||!(hadCtl||updRequested))return;reloaded=true;location.reload()});
  });
}

/* ---------- démarrage ---------- */
loadSync();render();net();renderBanners();loadAsync();
})();
