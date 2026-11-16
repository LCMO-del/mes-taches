/* Mes tâches — analyse des phrases dictées (100 % local, fonctionne hors réseau) */

const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const parseIso=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const diffDays=s=>Math.round((parseIso(s)-today())/864e5);
const JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const NUM={un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10,onze:11,douze:12,treize:13,quatorze:14,quinze:15,seize:16,'dix-sept':17,'dix-huit':18,'dix-neuf':19,vingt:20};
// nombres en lettres jusqu'à 99 (belge : septante, nonante ; accepte aussi soixante-dix, quatre-vingt-dix)
const UNITS=['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
const TENS={vingt:20,trente:30,quarante:40,cinquante:50,soixante:60,septante:70,huitante:80,octante:80,'quatre-vingt':80,'quatre-vingts':80,nonante:90};
function wordNum(w){
  w=String(w).toLowerCase().trim().replace(/\s+/g,' ').replace(/ et /g,'-et-').replace(/ /g,'-');
  if(/^\d+$/.test(w)) return +w;
  if(w==='une') return 1;
  let i=UNITS.indexOf(w); if(i>=0) return i;
  if(TENS[w]!=null) return TENS[w];
  const m=w.match(/^(vingt|trente|quarante|cinquante|soixante|septante|huitante|octante|quatre-vingts?|nonante)-(?:et-)?(.+)$/);
  if(m){const u=UNITS.indexOf(m[2]); if(u>0&&u<20&&(u<10||/^(soixante|quatre-vingts?)$/.test(m[1]))) return TENS[m[1]]+u}
  return NaN;
}
const TENSRE='quatre-vingts?|vingt|trente|quarante|cinquante|soixante|septante|huitante|octante|nonante';
const UNITSRE='dix-sept|dix-huit|dix-neuf|onze|douze|treize|quatorze|quinze|seize|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix';
const NUMRE='\\d+|(?:'+TENSRE+')(?:(?:-| et |-et-)(?:'+UNITSRE+'))?|'+UNITSRE;
const addMonths=(d,n)=>{const x=new Date(d.getFullYear(),d.getMonth()+n,1), last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate(); x.setDate(Math.min(d.getDate(),last)); return x};
const SUBJ={fasse:'faire',aille:'aller',voie:'voir',prenne:'prendre',mette:'mettre',écrive:'écrire',ecrive:'écrire',fasses:'faire',ailles:'aller'};
const PRE="(?:pour |d'ici |avant |au plus tard |jusqu'à |pour le |avant le )?";
function nextWeekday(i){const t=today();let n=(i-t.getDay()+7)%7;if(n===0)n=7;return addDays(t,n)}
function dayOfMonth(day,month,year){ // ne déborde jamais (31 novembre -> mois suivant valide)
  for(let k=0;k<13;k++){const d=new Date(year,month+k,day);if(d.getDate()===day)return d}
  return null;
}
function futureDom(day){const t=today();let d=dayOfMonth(day,t.getMonth(),t.getFullYear());
  if(d&&d<t) d=dayOfMonth(day,t.getMonth()+1,t.getFullYear()); return d}
function monthIdx(w){w=w.toLowerCase().replace('fevrier','février').replace('aout','août').replace('decembre','décembre');return MOIS.indexOf(w)}
const MOISRE='janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre';
const JOURSRE='lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';

const STOP_END=new Set(['et','pour','avant','de','du','des','la','le','les','à','au','aux',"c'est",'ce','cette','est','sera','donc','aussi','euh','svp','que','qui','alors','ou','en','sur','par',"d'ici",'jusqu\'à','vers','matin','soir','après-midi','midi','absolument','vraiment','surtout']);
const FILLER=/^(?:(?:et|alors|euh|bon|ok|donc|aussi|puis|ensuite|après|enfin|mais|absolument|vraiment|surtout|d'abord|également|voilà|il faut(?: que je| que j'| absolument)?|faut|je dois|je vais|j'ai besoin de|il me faut|penser à|pense à|ne pas oublier de|ne pas oublier|n'oublie pas de|n'oublie pas|rappel\b ?:?|à faire\b ?:?|tâche\b ?:?)[\s,:]+)+/i;

function parseOne(raw){
  let s=' '+raw.replace(/[’‘`´]/g,"'").trim()+' ', date=null, time=null, prio='normale', hit=false;
  const take=(re,fn)=>{const m=s.match(re);if(m){fn(m);s=s.replace(re,' ');hit=true;return true}return false};
  // heures dictées en lettres ou « et demie / et quart » → « 10h30 »
  s=s.replace(new RegExp("(\\s)("+NUMRE+") heures?(?=[\\s,.!])","gi"),(a,sp,n)=>{const v=wordNum(n);return v>=0&&v<24?sp+v+'h':a})
     .replace(/(\d{1,2}) ?h(?:eures?)? et demie?(?![\w])/gi,'$1h30').replace(/(\d{1,2}) ?h(?:eures?)? et quart(?![\w])/gi,'$1h15')
     .replace(/(\d{1,2}) ?h(?:eures?)? (trente|quinze|quarante-cinq|dix|vingt)(?![\w-])/gi,(a,h,mn)=>h+'h'+pad(wordNum(mn)))
     .replace(/\smidi et demie?(?![\w])/gi,' 12h30');
  // heure
  take(/\s(?:de|entre) (\d{1,2}) ?h(?:eures?)? ?(\d{2})? (?:à|et) (\d{1,2}) ?h(?:eures?)? ?(\d{2})?(?![\d\w])/i,m=>{if(+m[1]<24)time=pad(+m[1])+':'+(m[2]||'00')})||
  take(/\s(?:à|vers|dès|pour) (\d{1,2}) ?h(?:eures?)? ?(\d{2})?(?![\d\w])/i,m=>{if(+m[1]<24)time=pad(+m[1])+':'+(m[2]||'00')})||
  take(/\s(\d{1,2}) ?h ?(\d{2})(?![\d\w])/i,m=>{if(+m[1]<24)time=pad(+m[1])+':'+m[2]})||
  take(/\s(?:à |vers |dès |pour )?([01]?\d|2[0-3]):([0-5]\d)(?![\d\w:])/i,m=>{time=pad(+m[1])+':'+m[2]})||
  take(/\s(?:à |vers )?midi\b/i,()=>time='12:00');
  if(!time){ // heure seule (« demain 9h »), sauf durée (« dans 2h », « pendant 3 heures »)
    const re=/\s(\d{1,2}) ?h(?:eures?)?(?![\d\w])/gi; let m;
    while((m=re.exec(s))){const before=(s.slice(0,m.index).trim().split(' ').pop()||'').toLowerCase();
      if(/^(dans|pendant|durant|en|sous|depuis|les|de|toutes|chaque|environ|max|maximum|minimum)$/.test(before)) continue;
      if(+m[1]<24){time=pad(+m[1])+':00';s=s.slice(0,m.index)+' '+s.slice(m.index+m[0].length);hit=true}
      break}
  }
  // « ce soir à 8h », « demain après-midi à 3h » → 20:00 / 15:00
  if(time&&+time.slice(0,2)>=1&&+time.slice(0,2)<=11&&/(?:^|\s)(?:soir|après-midi|aprem|aprèm)(?=[\s,.!])|\sde l'après-midi|\sdu soir/i.test(s)) time=pad(+time.slice(0,2)+12)+time.slice(2);
  s=s.replace(/\s(?:de l'après-midi|du soir|du matin)(?=[\s,.!])/gi,' ');
  // priorité : la basse d'abord (sinon « pas urgent » serait lu « urgent »)
  take(/[,\s]+(?:c'est |ce n'est |c'est vraiment |ça |)(?:pas (?:très |trop |si |vraiment )?(?:urgent(?:e)?|pressé|pressant|prioritaire)|rien ne presse|pas de presse|quand j'ai le temps|à l'occasion|si possible|sans urgence)(?: du tout)?(?=[,.!\s])/i,()=>prio='basse')||
  take(/[,\s]+(?:c'est |très |super |vraiment |hyper |)+(?:urgent(?:e)?|prioritaire|important(?:e)?|en priorité|au plus vite|asap|tout de suite|immédiatement|dès que possible|en urgence|le plus vite possible|le plus rapidement possible)(?=[,.!\s])/i,()=>{prio='haute';s=s.replace(/\s(?:c'est |très |super )*urgent(?:e)?(?=[,.!\s])/gi,' ')});
  // dates
  const t=today();
  take(new RegExp("\\s"+PRE+"(?:aujourd'hui|ce matin|cet après-midi|cet aprem|ce soir|ce midi)(?=[\\s,.!])","i"),()=>date=t)||
  take(new RegExp("\\s"+PRE+"après-demain(?: matin| après-midi| soir)?(?=[\\s,.!])","i"),()=>date=addDays(t,2))||
  take(new RegExp("\\s"+PRE+"demain(?: matin| après-midi| soir| midi)?(?=[\\s,.!])","i"),()=>date=addDays(t,1))||
  take(new RegExp("\\s"+PRE+"(?:la )?fin (?:de |du mois de |d')?("+MOISRE+")(?=[\\s,.!])","i"),m=>{const mo=monthIdx(m[1]);let d=new Date(t.getFullYear(),mo+1,0);if(d<t)d=new Date(t.getFullYear()+1,mo+1,0);date=d})||
  take(new RegExp("\\s"+PRE+"(?:la )?semaine du (\\d{1,2})(?:er)? ("+MOISRE+")(?=[\\s,.!])","i"),m=>{const mo=monthIdx(m[2]);let d=dayOfMonth(+m[1],mo,t.getFullYear());if(d&&d.getMonth()!==mo)d=null;if(d&&d<t)d=dayOfMonth(+m[1],mo,t.getFullYear()+1);date=d})||
  take(new RegExp("\\s"+PRE+"(?:la )?fin du mois(?=[\\s,.!])","i"),()=>date=new Date(t.getFullYear(),t.getMonth()+1,0))||
  take(new RegExp("\\s"+PRE+"(?:le )?début (?:de la )?semaine prochaine|\\s"+PRE+"(?:la )?semaine prochaine(?=[\\s,.!])","i"),()=>date=nextWeekday(1))||
  take(new RegExp("\\s"+PRE+"(?:la )?fin de (?:la )?semaine|\\s"+PRE+"cette semaine(?=[\\s,.!])","i"),()=>{date=addDays(t,(5-t.getDay()+7)%7||0)})||
  take(new RegExp("\\s"+PRE+"dans (?:les |un délai de )?("+NUMRE+") (jours?|semaines?|mois)(?=[\\s,.!])","i"),m=>{const n=wordNum(m[1]);if(n>0&&n<1000)date=/mois/i.test(m[2])?addMonths(t,n):addDays(t,/sem/i.test(m[2])?n*7:n)})||
  take(new RegExp("\\s"+PRE+"dans (?:une |huit |8 )?(?:quinzaine|quinze jours)(?=[\\s,.!])","i"),()=>date=addDays(t,14))||
  take(new RegExp("\\s"+PRE+"(?:(?:ce |le )?(?:"+JOURSRE+") )?(?:le )?(\\d{1,2})(?:er)? ("+MOISRE+")(?: (\\d{4}))?(?=[\\s,.!])","i"),m=>{
    const mo=monthIdx(m[2]), y=m[3]?+m[3]:t.getFullYear(); let d=dayOfMonth(+m[1],mo,y);
    if(d&&d.getMonth()!==mo) d=null; if(d&&!m[3]&&d<t) d=dayOfMonth(+m[1],mo,y+1); date=d})||
  take(new RegExp("\\s"+PRE+"(?:le )?(\\d{1,2})[\\/.-](\\d{1,2})(?:[\\/.-](\\d{2,4}))?(?=[\\s,.!])","i"),m=>{
    const dd=+m[1],mm=+m[2]-1; let y=m[3]?(+m[3]<100?2000+ +m[3]:+m[3]):t.getFullYear();
    if(mm>=0&&mm<12){let d=new Date(y,mm,dd); if(d.getDate()===dd){ if(!m[3]&&d<t) d.setFullYear(y+1); date=d }}})||
  take(new RegExp("\\s"+PRE+"(?:ce |le |la )?("+JOURSRE+")(?: prochain| matin| après-midi| soir)?(?=[\\s,.!])","i"),m=>date=nextWeekday(JOURS.indexOf(m[1].toLowerCase())))||
  take(/\s(?:pour |avant |d'ici )?le (\d{1,2})(?:er)?(?![\d\w])(?! ?(?:h\b|heures|pièces|pieces|kg|mm|cm|m\b|%|bars?\b|°))/i,m=>date=futureDom(+m[1]));
  // nettoyage du titre
  let title=s.replace(/\s+/g,' ').replace(/\s+([,.;:!?])/g,'$1').trim();
  const t0=title;
  for(let k=0;k<4;k++) title=title.replace(FILLER,'').replace(/^[,.;:!?\-\s]+/,'');
  const removed=t0.slice(0,t0.length-title.length);
  const hadQue=/que (je|j')\s*$/i.test(removed)||/^que (je |j')/i.test(title);
  title=title.replace(/^que j'/i,'').replace(/^que je /i,'');
  if(hadQue){const w0=title.split(' ')[0]||'', low=w0.toLowerCase();
    if(SUBJ[low]) title=SUBJ[low]+title.slice(w0.length);
    else if(/e$/.test(low)&&VERBS.has(low+'r')) title=w0+'r'+title.slice(w0.length);
    else if(/(ll|tt)e$/.test(low)&&VERBS.has(low.slice(0,-2)+'er')) title=w0.slice(0,-2)+'er'+title.slice(w0.length);
    else if(/oie$/.test(low)&&VERBS.has(low.slice(0,-2)+'yer')) title=w0.slice(0,-2)+'yer'+title.slice(w0.length);
    else if(/es$/.test(low)&&VERBS.has(low.slice(0,-1)+'r')) title=w0.slice(0,-1)+'r'+title.slice(w0.length);}
  let words=title.split(' ');
  while(words.length){const w=words[words.length-1].toLowerCase().replace(/[,.;:!?\-]+$/,'');
    if(!w||STOP_END.has(w)) words.pop(); else break}
  title=words.join(' ').replace(/[,;:\-]+$/,'').trim();
  title=title.charAt(0).toUpperCase()+title.slice(1);
  return {title,date:date?iso(date):null,time,prio,hit};
}

const EMPTY_WORDS=new Set(['absolument','vraiment','mais','surtout','aussi','alors','donc','bon','ok','euh','voilà','enfin','également','urgent','urgente','important','importante','et','puis','ensuite','après','d\'abord','oui','non','merci','tâche','rappel','stp','svp','du','tout']);
const VERBS=new Set(('vérifier verifier appeler rappeler commander recommander envoyer renvoyer contrôler controler réparer reparer préparer preparer nettoyer graisser lubrifier remplacer changer démonter demonter remonter monter calibrer étalonner etalonner planifier organiser rédiger rediger passer relancer demander tester inspecter installer régler regler acheter imprimer valider signer programmer réserver reserver finir terminer finaliser lancer mesurer noter chercher récupérer recuperer livrer déposer deposer confirmer prévenir prevenir informer écrire ecrire relire répondre repondre contacter joindre téléphoner telephoner vidanger purger serrer resserrer démarrer demarrer arrêter arreter former recevoir ranger trier classer réviser reviser analyser étudier etudier chiffrer facturer mettre prendre faire aller voir discuter présenter presenter transmettre remplir compléter completer sécuriser securiser isoler couper brancher débrancher debrancher souder percer peindre fixer').split(' '));
const NOSPLIT_PREV=new Set(['pour','de',"d'",'à','a','afin','sans','faut','dois','doit','devons','devez','va','vais','peux','peut','oublier','pense','penser','besoin','que','je','me','se','ne','pas','faire','laisser','aller','venir','pouvoir','devoir','vouloir','savoir','il','on','nous','vous','en','y','le','la','les','l\'','ou','plus','bien','mieux','encore','te','rien','jamais','toujours']);
const DATE_TOK=/^(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|après-demain|aujourd'hui|prochain|matin|soir|ce|cet|à|vers|\d{1,2}h\d{0,2})$/i;
function splitChunk(chunk){
  const words=chunk.split(/\s+/).filter(Boolean), out=[]; let cur=[];
  for(let i=0;i<words.length;i++){
    const w=words[i].toLowerCase().replace(/[,.;:!?]+$/,'');
    const content=cur.filter(x=>!/^(et|,)$/i.test(x));
    const nxt=(words[i+1]||'').toLowerCase(), pv=(cur[cur.length-1]||'').toLowerCase();
    const marker=(w==='je'&&/^(dois|vais)$/.test(nxt))||(w==='il'&&nxt==='faut')||(w==='faut'&&pv!=='il')||(w==='penser'&&nxt==='à');
    if(marker&&content.length>=2){ if(pv==='et') cur.pop(); out.push(cur.join(' ')); cur=[]; cur.push(words[i]); continue; }
    if(VERBS.has(w)&&content.length>=2){
      // « … et mardi relancer Martin » : la date qui précède le verbe appartient à la tâche suivante
      let j=cur.length; while(j>1&&DATE_TOK.test(cur[j-1].replace(/[,.;:!?]+$/,''))) j--;
      if(j<cur.length&&j>1){const sep=cur[j-1].toLowerCase();
        if(sep==='et'||/,$/.test(sep)){out.push(cur.slice(0,sep==='et'?j-1:j).join(' ')); cur=cur.slice(j); cur.push(words[i]); continue}}
      let prev=cur[cur.length-1].toLowerCase(); const prevClean=prev.replace(/[,.;:!?]+$/,'');
      const elided=/^(d|l|j|qu)'$/.test(prevClean);
      if(prevClean==='et'||prev.endsWith(',')){ if(prevClean==='et') cur.pop(); out.push(cur.join(' ')); cur=[]; }
      else if(!NOSPLIT_PREV.has(prevClean)&&!elided){ out.push(cur.join(' ')); cur=[]; }
    }
    cur.push(words[i]);
  }
  if(cur.length) out.push(cur.join(' '));
  return out;
}
function parseAll(text){
  // pas de « lookbehind » (absent de Safari iOS < 16.4) : on protège les abréviations
  text=text.replace(/[’‘`´]/g,"'").replace(/(^|[\s(])(M|Mme|Mr|Dr|St|Ste|n°|N°|réf|ref|Réf|Ref)\.(?=\s)/g,'$1$2\u0001');
  const chunks=text.split(/\s*(?:\n|;|[.!?](?=\s|$)|\bpuis\b|\bensuite\b|\bet aussi\b|\bet après(?![-\w])|\baprès ça\b|\bautre chose\b|\bautre tâche\b|\bdeuxième tâche\b|\btroisième tâche\b)\s*/i)
    .map(x=>x&&x.replace(/\u0001/g,'.').trim()).filter(Boolean);
  const pieces=[]; chunks.forEach(c=>pieces.push(...splitChunk(c)));
  const res=[]; let pending=null;
  for(const p of pieces){
    const r=parseOne(p);
    const meaningful=r.title.replace(/[^a-zà-ÿ0-9]/gi,'').length>=3 && r.title.toLowerCase().split(/[\s,]+/).some(w=>w&&!EMPTY_WORDS.has(w));
    if(!meaningful){
      if(r.hit){ const tgt=res[res.length-1];
        if(tgt){ if(r.prio!=='normale')tgt.prio=r.prio; if(r.date&&!tgt.date)tgt.date=r.date; if(r.time&&!tgt.time)tgt.time=r.time; }
        else pending=r; }
      continue;
    }
    if(pending){ if(r.prio==='normale')r.prio=pending.prio; r.date=r.date||pending.date; r.time=r.time||pending.time; pending=null; }
    delete r.hit; res.push(r);
  }
  return res;
}

const MOIS_ABR=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
function label(s){
  if(!s) return null; const n=diffDays(s);
  if(n<0) return n===-1?'Hier':'En retard ('+(-n)+' j)';
  if(n===0) return "Aujourd'hui"; if(n===1) return 'Demain';
  const d=parseIso(s); if(n<7) return JOURS[d.getDay()].replace(/^./,c=>c.toUpperCase());
  return d.getDate()+' '+MOIS_ABR[d.getMonth()];
}
if(typeof module!=='undefined') module.exports={parseAll,parseOne,iso,today,addDays,parseIso,diffDays,label,JOURS,MOIS,nextWeekday,dayOfMonth};
