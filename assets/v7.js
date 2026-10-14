'use strict';
/* JS Ecosystem · v7.js (v0.7) — son yüklenen modül: dil, dış sayfa kuyruğu, PDF dışa aktarma, kanban sürükle-bırak, erişilebilirlik.
   Yükleme sırası: i18n → shared → pdf → app → modüller → v7. */
const SLUG=s=>String(s||'').split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'').slice(0,12)||'inceleme';
const extUrl=u=>{try{return new URL(u,location.href).href}catch{return u}};
const extLinkOf=r=>(state.extLinks||[]).filter(l=>l.kind==='review'&&l.ref===r.id&&!l.revoked&&l.expires>=TODAY).sort((a,b)=>a.created<b.created?-1:1).at(-1);
const addDays=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const extAudit=(text,who='Dış bağlantı')=>{state.audit.unshift({text,at:new Date().toLocaleString('tr-TR'),who,role:'external'});state.audit=state.audit.slice(0,300)};

/* ---------- dil ---------- */
function setLang(l){setLangRaw(l);state.lang=getLang();state.settings.general.lang=getLang()==='en'?'English':'Türkçe';log(`Dil değiştirildi: ${getLang()==='en'?'English':'Türkçe'}`);render();toast(t('lang.set'));document.querySelector('[data-bind="settings.general.lang"]')?.focus({preventScroll:true})}

/* ---------- durum yaması + dış sayfa kuyruğu ---------- */
function ensureV7(){
  if(!Array.isArray(state.extLinks))state.extLinks=JSE.LINKS.map(l=>({...l}));
  if(!state.reviews.some(r=>r.id==='rv3'))state.reviews.push(JSON.parse(JSON.stringify(JSE.RV3)));
  state.reviews.forEach(r=>{const l=extLinkOf(r);r.externalLink=l?'watch.html?t='+l.token:''});
  state.reviews.filter(r=>r.externalLink&&!state.approvals.some(a=>a.review===r.id)).forEach(r=>state.approvals.unshift({id:uid('a'),status:'Bekliyor',kind:'Müşteri kararı',name:`${r.name} ${r.current} · nihai onay`,project:r.project,review:r.id,desc:'Dış inceleme bağlantısı üzerinden müşteri kararı bekleniyor.',feedback:'',amount:0,requested:now(),by:'HO',deadline:'2026-10-21',delegate:'',version:r.current}));
  if(state.lang)setLangRaw(state.lang);else state.lang=getLang();
  state.settings.general.lang=getLang()==='en'?'English':'Türkçe';
}
function applyQueueItem(it){
  if(it.type==='rv-comment'){const r=state.reviews.find(x=>x.id===it.review),v=r?.versions.find(x=>x.v===it.v);if(!v)return false;
    v.comments.push({id:uid('c'),tc:it.tc,who:`${it.who} (dış)`,text:it.text,internal:false,resolved:false});
    addNotification(`${r.name} ${it.v}: dış inceleyici yorumu (${it.tc})`,'review');extAudit(`Dış inceleme yorumu: ${r.name} ${it.v} ${it.tc} · ${it.who}`,it.who);return true}
  if(it.type==='rv-decision'){const r=state.reviews.find(x=>x.id===it.review);if(!r)return false;
    if(it.decision==='approved'){actions['rv-approve']({dataset:{id:r.id}});if(it.note)r.versions.find(v=>v.v===r.current)?.comments.push({id:uid('c'),tc:'00:00',who:`${it.who} (dış)`,text:`Onay notu: ${it.note}`,internal:false,resolved:true})}
    else{actions['rv-revise']({dataset:{id:r.id}});r.versions.find(v=>v.v===r.current)?.comments.push({id:uid('c'),tc:'00:00',who:`${it.who} (dış)`,text:`Revizyon notu: ${it.note}`,internal:false,resolved:false})}
    extAudit(`Dış inceleme kararı: ${r.name} ${r.current} → ${it.decision==='approved'?'Onaylandı':'Revizyon istendi'} · ${it.who}`,it.who);return true}
  if(it.type==='application'){const p=state.positions.find(x=>x.id===it.position);if(!p||state.candidates.some(c=>c.appToken===it.code))return false;
    state.candidates.unshift({id:it.id||uid('cd'),name:it.name,position:p.id,stage:'Başvuru',source:'Kariyer sayfası',cv:it.cv||'',portfolio:it.portfolio||'',email:it.email,note:it.note||'',appToken:it.code,appliedAt:it.date,kvkk:it.kvkk,score:{portfolio:0,interview:0,case:0,fit:0},next:''});
    p.applicants=(p.applicants||0)+1;addNotification(`Yeni başvuru: ${it.name} → ${p.title}`,'hire');extAudit(`Aday başvurusu (KVKK onaylı): ${it.name} → ${p.title}`,it.name);return true}
  if(it.type==='survey-response')return typeof commsIngestSurvey==='function'&&commsIngestSurvey(it);
  return false}
function ingestQueue(live){const q=JSE.readQ();let n=0;q.forEach(it=>{if(it.ingested)return;try{if(applyQueueItem(it))n++}catch(e){console.error('kuyruk',e)}it.ingested=true});if(q.length){JSE.writeQ(q)}if(n||live){save();if(live)render()}return n}
function v7Boot(){try{ensureV7();if(typeof commsBoot==='function')commsBoot();ingestQueue(false);save()}catch(e){console.error('v7Boot',e)}
  window.addEventListener('storage',e=>{if(e.key===JSE.QKEY&&state.session.loggedIn)ingestQueue(true)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.session.loggedIn)ingestQueue(true)});
  const m=$('#modal');m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.addEventListener('close',()=>m.removeAttribute('aria-labelledby'))}
(()=>{const o=openDialog;openDialog=function(){o.apply(this,arguments);$('#modal').setAttribute('aria-labelledby','dialog-title')}})();

/* ---------- dış bağlantılar (uygulama içi) ---------- */
function applyLinksPanel(){const pos=state.positions.filter(p=>p.status==='Açık');const row=(label,u)=>`<div class="session-row"><div>${esc(label)}<small class="mono">${esc(extUrl(u))}</small></div><div class="actions">${btn('Kopyala','copy','sm','copy',`data-id="${esc(extUrl(u))}"`)}${btn('Aç','open-ext','sm','arrow',`data-id="${esc(u)}"`)}</div></div>`;
  return `<div class="panel"><div class="panel-header"><h2>Başvuru bağlantıları</h2></div><div class="panel-body"><p class="small muted">Aday portalı: oturum yok, KVKK onayı zorunlu. Başvurular Aday havuzu › Başvuru kolonuna düşer.</p>${row('Tüm açık pozisyonlar','apply.html')}${pos.map(p=>row(p.title,'apply.html?job='+p.id)).join('')}</div></div>`}
Object.assign(actions,{
'open-ext'(b){window.open(b.dataset.id,'_blank','noopener')},
'rv-link'(b){const r=state.reviews.find(x=>x.id===b.dataset.id);if(!r)return;const token=`${SLUG(client(r.client))}-v${r.current.replace(/^v/,'').padStart(2,'0')}`;let l=state.extLinks.find(x=>x.token===token);
  if(l){l.revoked=false;l.expires=addDays(TODAY,7);l.ref=r.id}else state.extLinks.push({token,kind:'review',ref:r.id,created:TODAY,expires:addDays(TODAY,7),revoked:false,download:false});
  r.externalLink='watch.html?t='+token;emit('review.link.created',`review:${r.id}`);done('Dış inceleyici linki oluşturuldu (7 gün).',`Dış inceleyici linki: ${r.name} (${token})`)},
'rv-link-revoke'(b){const r=state.reviews.find(x=>x.id===b.dataset.id);if(!r)return;state.extLinks.filter(l=>l.kind==='review'&&l.ref===r.id).forEach(l=>l.revoked=true);r.externalLink='';done('Link iptal edildi.',`Dış inceleyici linki iptal: ${r.name}`)}
});

/* ---------- PDF dışa aktarma ---------- */
const fmtTL=n=>Math.round(n||0).toLocaleString(locale())+' TL';
const stamp=()=>({footer:'Üretim: 14.10.2026'});
function savePdf(name,doc,logText){Object.assign(doc,stamp());const r=PDF.save(name,doc);log(logText||`PDF üretildi: ${name} (${r.pages} sayfa)`);toast(`PDF indiriliyor: ${name}`);return r}
function quotePdf(q){const items=q.items.map(([d,n,p])=>[d,String(n),fmtTL(p),fmtTL(n*p)]),total=q.items.reduce((s,[,n,p])=>s+n*p,0);
  return {title:`Teklif ${q.id}`,subtitle:q.name,meta:[['Marka',q.client?client(q.client):'Yeni şirket'],['Sürüm',(q.version||'v1')+' · taslak'],['Vade / geçerlilik',date(q.valid)+' ('+q.valid+')'],['Durum',q.status]],
   blocks:[{t:'h2',text:'Kalemler'},{t:'table',cols:[{h:'Kalem',w:6},{h:'Adet',w:1.2,align:'right'},{h:'Birim',w:2,align:'right'},{h:'Tutar',w:2,align:'right'}],rows:items,foot:['Toplam (KDV hariç)','','',fmtTL(total)]},
   {t:'kv',rows:[['İkiz saat tahmini',q.hours+' saat'],['Ödeme vadesi','Onaydan sonra 30 gün; teklif '+date(q.valid)+' tarihine kadar geçerlidir.']]},{t:'p',text:'Bu belge JS Present demo taslağıdır; bağlayıcı değildir.'}]}}
function reportPdf(d){const c=state.clients.find(x=>x.id===d.client),ps=state.projects.filter(p=>p.client===d.client),inv=state.invoices.filter(i=>i.client===d.client),tk=state.tasks.filter(t=>ps.some(p=>p.id===t.project));
  return {title:d.name,subtitle:`${c?c.name:'Marka'} · aylık rapor · ${d.pages} sayfa (özet)`,meta:[['Marka',c?c.name:'—'],['Güncelleme',d.updated],['Durum',d.status],['Dönem','Ekim 2026']],
   blocks:[{t:'h2',text:'Özet'},{t:'kv',rows:[['Aktif proje',String(ps.filter(p=>p.status!=='Tamamlandı').length)],['Açık görev',String(tk.filter(t=>!t.done).length)],['Tamamlanan görev',String(tk.filter(t=>t.done).length)],['Fatura toplamı',fmtTL(inv.reduce((s,i)=>s+i.amount,0))]]},
   {t:'h2',text:'Projeler'},{t:'table',cols:[{h:'Proje',w:6},{h:'Durum',w:2},{h:'Teslim',w:2}],rows:ps.map(p=>[p.name,p.status,date(p.due)])},{t:'sp'},{t:'p',text:'Bu rapor JS Present demo verisinden üretilmiştir.'}]}}
function weeklyPdf(){const open=state.leads.filter(l=>!['Kazanıldı','Kaybedildi'].includes(l.stage));
  return {title:'JS Insights · Haftalık özet',subtitle:'Hafta 42 · 14 Ekim 2026',meta:[['Dağıtım','Cuma 17:15 · Slack #yonetim + e-posta']],blocks:[{t:'h2',text:'Göstergeler'},{t:'table',cols:[{h:'Gösterge',w:4},{h:'Değer',w:3,align:'right'}],rows:[['Açık pipeline',fmtTL(open.reduce((s,l)=>s+l.value,0))],['Ortalama marj','%'+avgMargin()],['Riskli marka',state.clients.filter(c=>c.status==='Riskli').map(c=>c.name).join(', ')||'—'],['Kurucuya giden karar',String(pendingDecisions())]]},
   {t:'h2',text:'Lead aşamaları'},{t:'table',cols:[{h:'Aşama',w:3},{h:'Adet',w:1,align:'right'},{h:'Değer',w:3,align:'right'}],rows:leadStages.map(s=>{const L=state.leads.filter(l=>l.stage===s);return [s,String(L.length),fmtTL(L.reduce((a,l)=>a+l.value,0))]})}]}}
function invoicePdf(i){const net=i.amount,kdv=Math.round(net*.2);return {title:`Fatura taslağı ${i.id}`,subtitle:`${client(i.client)} · ${project(i.project)?.name||'—'}`,meta:[['Kesim',date(i.issued)],['Vade',date(i.due)],['Durum',i.status],['Belge','Taslak; e-fatura değildir']],
   blocks:[{t:'h2',text:'Kalemler'},{t:'table',cols:[{h:'Açıklama',w:6},{h:'Tutar',w:3,align:'right'}],rows:[[project(i.project)?.name||'Hizmet bedeli',fmtTL(net)],['KDV %20',fmtTL(kdv)]],foot:['Genel toplam',fmtTL(net+kdv)]},{t:'p',text:'Tutarlar KDV hariç demo bedelidir; KDV %20 varsayımıyla gösterilmiştir. Paraşüt senkronu simüle edilir.'}]}}
function docListPdf(){const ds=state.hrDocs.filter(d=>d.confidentiality_level!=='Bordro'&&d.confidentiality_level!=='Özel nitelikli');return {title:'Personel özlük belge listesi',subtitle:'JS People · arşiv metadata (bordro ve özel nitelikli kategoriler hariç)',meta:[['Belge sayısı',String(ds.length)],['Üreten',account().name]],
   blocks:[{t:'table',cols:[{h:'Çalışan',w:3},{h:'Kategori',w:2.5},{h:'Alt kategori',w:3},{h:'Durum',w:2},{h:'Tarih',w:2}],rows:ds.map(d=>[empName(d.employee_id),d.category,d.subcategory,d.status,d.document_date||'—'])}]}}
const pdfSlug=s=>String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
Object.assign(actions,{
'present-pdf'(b){const q=state.quotes.find(x=>x.id===b.dataset.id);if(q)return void savePdf(`teklif-${q.id}.pdf`,quotePdf(q));const d=state.documents.find(x=>x.id===b.dataset.id);if(d&&d.type==='Rapor')return void savePdf(`${pdfSlug(d.name)}.pdf`,reportPdf(d));
  savePdf(`${pdfSlug(d?.name||b.dataset.id)}.pdf`,{title:d?.name||'Belge',subtitle:d?`${d.type} · ${d.pages} sayfa`:'',blocks:[{t:'p',text:'Demo belge özeti; slayt içeriği üretim fazında.'}]})},
'insights-weekly'(){savePdf('js-insights-haftalik.pdf',weeklyPdf(),'Insights haftalık özet PDF üretildi.');toast('Haftalık özet PDF indiriliyor; e-posta planlandı.')},
'invoice-pdf'(b){const i=state.invoices.find(x=>x.id===b.dataset.id);if(i)savePdf(`fatura-taslagi-${i.id}.pdf`,invoicePdf(i))},
'hr-doclist-pdf'(){savePdf('ozluk-belge-listesi.pdf',docListPdf(),'Özlük belge listesi PDF dışa aktarıldı (bordro ve özel nitelikli hariç).')},
'doc-download'(b){const d=state.hrDocs.find(x=>x.id===b.dataset.id);if(!d)return;logAccess(d,'indirdi');
  savePdf(d.original_filename.replace(/\.[a-z0-9]+$/i,'')+'.pdf',{title:d.subcategory,subtitle:`Çalışan: ${empName(d.employee_id)}`,meta:[['Kategori',d.category],['Sürüm',String(d.version_number)],['sha256',d.sha256_checksum]],blocks:[{t:'p',text:'Bu dosya kurgusaldır; belge içeriği yoktur. İndirme imzalı URL (5 dk) ile başladı, erişim kaydı yazıldı.'}]},`Belge indirildi (kontrollü, imzalı URL 5 dk): ${d.subcategory} · ${empName(d.employee_id)}`)}
});
LOCKS['hr-doclist-pdf']='can.read.hr_archive';

/* ---------- kanban: sürükle-bırak + klavye ---------- */
(()=>{
const live=()=>{let l=document.getElementById('kb-live');if(!l){l=document.createElement('div');l.id='kb-live';l.className='sr-only';l.setAttribute('role','status');l.setAttribute('aria-live','assertive');document.body.appendChild(l)}return l};
const say=m=>{live().textContent='';setTimeout(()=>live().textContent=m,30)};
const small=()=>matchMedia('(max-width:760px)').matches;
function moveCard(kb,id,to,how){const action=kb.dataset.kb;const k=LOCKS[action];
  if(kb.dataset.locked==='true'||(k&&!hasPerm(k))){toast(t('kb.locked'));log(`Yetki reddedildi: ${action} (${k}, ${roleLabel[role()]}) · ${how}`);say(t('kb.locked'));return false}
  const card=kb.querySelector(`.kcard[data-kid="${CSS.escape(id)}"]`);if(card?.closest('.kcol')?.dataset.col===to)return false;
  log(`Kanban ${how}: ${id} → ${to}`);actions[action]({dataset:{id,to}});document.querySelector(`.kcard[data-kid="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
  setTimeout(()=>{const c=document.querySelector(`.kcard[data-kid="${CSS.escape(id)}"]`);if(document.activeElement!==c)c?.focus({preventScroll:true});say(`${c?.querySelector('strong,.kcard-title')?.textContent||id} ${tx(to)} ${t('kb.moved')}`)},0);return true}
/* işaretçi */
let drag=null,suppress=false;
document.addEventListener('pointerdown',e=>{const c=e.target.closest?.('.kcard');if(!c||e.button>0||small()||e.pointerType==='touch'||e.target.closest('button,a,input,select,textarea'))return;const kb=c.closest('.kanban');if(!kb)return;drag={c,kb,x:e.clientX,y:e.clientY,on:false,ghost:null,over:null,id:e.pointerId}});
document.addEventListener('pointermove',e=>{if(!drag)return;if(!drag.on){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;drag.on=true;if(drag.kb.dataset.locked==='true'){drag.c.classList.add('denied')}else{const g=drag.c.cloneNode(true);g.classList.add('kghost');g.style.width=drag.c.offsetWidth+'px';g.removeAttribute('tabindex');g.setAttribute('aria-hidden','true');document.body.appendChild(g);drag.ghost=g;drag.c.classList.add('dragging')}}
  e.preventDefault();if(drag.ghost){drag.ghost.style.left=e.clientX+8+'px';drag.ghost.style.top=e.clientY+8+'px'}
  const el=document.elementFromPoint(e.clientX,e.clientY),col=el?.closest('.kcol');if(drag.over!==col){drag.over?.classList.remove('drop-hot');drag.over=col&&col.closest('.kanban')===drag.kb?col:null;drag.over?.classList.add('drop-hot')}},{passive:false});
const endDrag=(e,commit)=>{if(!drag)return;const d=drag;drag=null;d.ghost?.remove();d.c.classList.remove('dragging','denied');d.over?.classList.remove('drop-hot');if(!d.on)return;suppress=true;setTimeout(()=>suppress=false,0);if(commit&&d.over)moveCard(d.kb,d.c.dataset.kid,d.over.dataset.col,'sürükle-bırak')};
document.addEventListener('pointerup',e=>endDrag(e,true));document.addEventListener('pointercancel',e=>endDrag(e,false));
document.addEventListener('click',e=>{if(suppress){e.stopPropagation();e.preventDefault();suppress=false}},true);
/* klavye */
let pick=null;
const cols=kb=>[...kb.querySelectorAll('.kcol')];
const hot=(kb,i)=>{cols(kb).forEach((c,j)=>c.classList.toggle('drop-hot',j===i))};
document.addEventListener('keydown',e=>{
  const c=e.target.closest?.('.kcard');
  if(pick&&e.key==='Escape'){e.stopPropagation();hot(pick.kb,-1);pick.card.removeAttribute('aria-grabbed');pick=null;say(t('kb.cancel'));return}
  if(!c||e.target!==c)return;const kb=c.closest('.kanban');if(!kb)return;
  if(e.key===' '&&!pick){e.preventDefault();if(kb.dataset.locked==='true'){toast(t('kb.locked'));say(t('kb.locked'));return}const cs=cols(kb);const i=cs.indexOf(c.closest('.kcol'));pick={kb,card:c,id:c.dataset.kid,i,from:i};c.setAttribute('aria-grabbed','true');hot(kb,i);say(`${t('kb.picked')} ${tx(cs[i].dataset.col)}. ${t('kb.hint')}`);return}
  if(pick&&pick.card===c){if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const cs=cols(kb);pick.i=Math.max(0,Math.min(cs.length-1,pick.i+(e.key==='ArrowRight'?1:-1)));hot(kb,pick.i);say(tx(cs[pick.i].dataset.col));return}
    if(e.key==='Enter'||e.key===' '){e.preventDefault();const p=pick,to=cols(kb)[p.i].dataset.col;pick=null;hot(kb,-1);c.removeAttribute('aria-grabbed');if(p.i!==p.from)moveCard(kb,p.id,to,'klavye');else say(t('kb.cancel'));return}
    if(e.key.startsWith('Arrow')||e.key==='Tab'){if(e.key==='Tab'){hot(kb,-1);pick=null}else e.preventDefault()}}
});
})();

/* ---------- erişilebilirlik ---------- */
document.addEventListener('keydown',e=>{
  /* dialog odak tuzağı */
  const m=$('#modal');if(e.key==='Tab'&&m.open){const f=[...m.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null||x===document.activeElement);if(f.length){const a=f[0],z=f.at(-1);if(e.shiftKey&&(document.activeElement===a||!m.contains(document.activeElement))){e.preventDefault();z.focus()}else if(!e.shiftKey&&(document.activeElement===z||!m.contains(document.activeElement))){e.preventDefault();a.focus()}}}
  /* sekme okları */
  const tab=e.target.closest?.('[role="tab"]');if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){const list=[...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];let i=list.indexOf(tab);i=e.key==='Home'?0:e.key==='End'?list.length-1:(i+(e.key==='ArrowRight'?1:-1)+list.length)%list.length;e.preventDefault();const id=list[i].id;list[i].click();setTimeout(()=>document.getElementById(id)?.focus(),0)}
});
function wrapPanel(){const sn=document.querySelector('.subnav');if(!sn||document.getElementById('tp-main'))return;const ae=document.activeElement;const par=sn.parentElement,tp=document.createElement('div');tp.id='tp-main';tp.setAttribute('role','tabpanel');tp.className='tabpanel';const act=sn.querySelector('[aria-selected="true"]');if(act)tp.setAttribute('aria-labelledby',act.id);let n=sn.nextSibling;while(n&&!(n.nodeType===1&&n.classList.contains('footer'))){const nx=n.nextSibling;tp.appendChild(n);n=nx}par.insertBefore(tp,n);if(ae&&ae!==document.body&&ae.isConnected&&document.activeElement!==ae)ae.focus({preventScroll:true})}
(()=>{const r0=render;render=function(){r0.apply(this,arguments);try{wrapPanel()}catch(e){console.error(e)}};
  document.addEventListener('DOMContentLoaded',()=>{$('#modal').addEventListener('close',()=>{setTimeout(()=>{if(!state.session.loggedIn)return;const ae=document.activeElement;if(!ae||ae===document.body||ae===$('#modal')){const m=$('#main');if(m)m.focus({preventScroll:true})}},0)})})})();

/* ---------- dil: DOM çevirisi (kabuk + modül başlıkları; sözlükte olmayan metin Türkçe kalır) ---------- */
function translateDom(root){if(getLang()!=='en')return;root=root||document.body;const A=I18N.A;
  const tr=s=>{const k=s.trim();if(!k)return s;const r=A[k]!=null?A[k]:txe(k);return r===k?s:s.replace(k,r)};
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&!n.parentElement.closest('script,style,textarea,[data-notr],#timer-live')&&!(n.parentElement.tagName==='OPTION'&&!n.parentElement.hasAttribute('value'))?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
  const nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(n=>{const r=tr(n.nodeValue);if(r!==n.nodeValue)n.nodeValue=r});
  root.querySelectorAll('[aria-label],[title],[placeholder],[alt]').forEach(e=>['aria-label','title','placeholder','alt'].forEach(a=>{const v=e.getAttribute(a);if(v){const r=tr(v);if(r!==v)e.setAttribute(a,r)}}));
  if(root===document.body){document.title=document.title.split(' — ').map(p=>p.split(' · ').map(q=>A[q]||q).join(' · ')).join(' — ')}}
(()=>{const r1=render;render=function(){r1.apply(this,arguments);translateDom($('#app'))};
  const o1=openDialog;openDialog=function(){o1.apply(this,arguments);translateDom($('#modal'))};
  const c1=commandResults;commandResults=function(){c1.apply(this,arguments);translateDom($('#command-results'))}})();
