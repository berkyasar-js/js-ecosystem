'use strict';
/* JS Ecosystem · modules-comms.js (v0.8) — iletişim katmanı: (1) uygulama içi Mesajlar (kanal / DM / kayıt bağlamlı konuşma, iç not ↔ müşteriye açık, @bahsetme, okundu, mesajdan görev, simüle Slack köprüsü),
   (2) Push bildirimi (izin, cihazlar, matris tabanlı istemci dağıtıcı, hassas veri kuralı, sessiz saat override), (3) Memnuniyet anketleri (CSAT / NPS / Nabız, survey.html, sağlık skoruna etki),
   (4) WhatsApp Business kanalı (simüle: opt-in, şablon, 24 saat penceresi, Akıllı Gelen Kutusu). Tüm kayıtlar kurgusaldır; gerçek Slack / Push sunucusu / Meta API çağrısı yoktur. */
iconPaths.chat='<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/>';
iconPaths.left=iconPaths.left||'<path d="M20 12H5m6-6-6 6 6 6"/>';
const cmPlus=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const cmDay=s=>{const [y,m,d]=s.split('-');return `${d}.${m}`};

/* ---------- modül kaydı ---------- */
if(!moduleCatalog.some(m=>m.id==='messages')){const i=moduleCatalog.findIndex(m=>m.id==='mywork');moduleCatalog.splice(i+1,0,{id:'messages',name:'Mesajlar',group:'main',icon:'chat',desc:'Ekip kanalları, DM’ler ve kayda bağlı konuşmalar; @bahsetme, iç not / müşteriye açık, mesajdan görev.'})}
Object.keys(roleModules).forEach(r=>{const a=roleModules[r];if(!a.includes('messages')){const i=a.indexOf('mywork');a.splice(i<0?a.length:i+1,0,'messages')}});

/* ---------- tohum ---------- */
const CM_TS=(d,hm)=>new Date(`2026-10-${d}T${hm}:00`).getTime();
const CM=(id,ch,author,d,hm,text,o={})=>({id,ch,author,text,ts:CM_TS(d,hm),label:(d==='14'?'':d+'.10 ')+hm,vis:o.vis||'internal',mentions:o.m||[],readBy:o.r||[author],slack:!!o.slack,task:null});
const WA_PH=p=>String(p||'').replace(/\D/g,'');
seedParts.push(()=>({
channels:[{id:'ch_genel',name:'#genel',type:'team',brand:null,slack:false},{id:'ch_wellana',name:'#wellana',type:'brand',brand:'c_wellana',slack:true},{id:'ch_edit',name:'#edit-events',type:'team',brand:null,org:'edit',slack:false},
 {id:'dm:manager|owner',name:'DM',type:'dm',members:['manager','owner'],brand:null},{id:'dm:creative|owner',name:'DM',type:'dm',members:['creative','owner'],brand:null},
 {id:'ctx:project:p1',name:'Wellana · Sonbahar kampanyası',type:'ctx',kind:'project',ref:'p1',brand:'c_wellana',slack:false},{id:'ctx:review:rv1',name:'Anova · Lansman filmi v2',type:'ctx',kind:'review',ref:'rv1',brand:'c_anova',slack:false}],
messages:[
CM('m01','ch_genel','manager','14','09:05','Günaydın! 15:00’te Clayton sunum provası var. @Batuhan hazır mısın?',{m:['BY']}),
CM('m02','ch_genel','owner','14','09:12','Hazırım. Seda ana görseli öğleye kadar kapatırsa prova sorunsuz geçer.',{r:['owner','manager']}),
CM('m03','ch_genel','creative','14','09:30','Ana görsel v03 iç onayda; tipografi 2. alternatif seçildi. @Öykü iç onaya bakabilir misin?',{m:['OE']}),
CM('m04','ch_genel','finance','14','10:02','Anova ek bütçe talebi (19.500 TL) onay bekliyor; öğleden önce karar lazım.'),
CM('m05','ch_genel','hr','14','10:20','Cuma günkü ofis içi eğitim için salon rezerve edildi.'),
CM('m06','ch_wellana','manager','14','11:00','Merhaba Deniz Hanım, Sonbahar filmi v3 inceleme linki sizinle paylaşıldı.',{vis:'client',slack:true}),
CM('m07','ch_wellana','client','14','11:18','Teşekkürler, bugün içinde bakıp dönüş yapacağız.',{vis:'client',r:['client','manager']}),
CM('m08','ch_wellana','manager','14','11:25','İç not: Wellana risk altında; teslimden sonra CSAT isteyelim.',{slack:true}),
CM('m09','ch_wellana','creative','14','11:40','Renk düzeltmesi son halini aldı; onaya hazır.',{vis:'client',slack:true,r:['creative','client']}),
CM('m10','ch_wellana','client','14','12:05','Slogan kartı bir saniye daha uzun kalabilir mi?',{vis:'client'}),
CM('m11','ch_edit','manager','14','09:45','Numesys etkinlik: sahne ve LED kiralama onayı bekliyor.'),
CM('m12','ch_edit','owner','14','09:50','Saha ekibi Cuma günü keşfe çıkıyor.',{r:['owner','manager']}),
CM('m13','ch_edit','creative','14','10:15','Mekân görselleri tamam, klasöre yüklendi.'),
CM('m14','dm:manager|owner','manager','14','10:30','Batuhan, Wellana toplantısı için 10 dk konuşabilir miyiz?'),
CM('m15','dm:manager|owner','owner','14','10:34','Evet, 11:30’a gel.',{r:['owner','manager']}),
CM('m16','dm:creative|owner','creative','14','10:41','Clayton sunumunda animasyon geçişleri eklensin mi?'),
CM('m17','ctx:project:p1','manager','13','16:20','Kapsam: 12 post + ana görsel. Ek içerik gelirse kapsam değişikliği açılacak.',{r:['manager','creative','owner']}),
CM('m18','ctx:project:p1','manager','14','08:50','Merhaba! Kampanya takvimini bu hafta paylaşıyoruz.',{vis:'client',r:['manager','creative']}),
CM('m19','ctx:review:rv1','client_reviewer','13','18:10','00:45’te müzik yüksek; konuşma altta kalıyor.',{vis:'client',r:['client_reviewer','creative']}),
CM('m20','ctx:review:rv1','creative','14','09:00','Ses mix v3’te düzeltilecek, yarın yüklüyoruz.',{vis:'client',r:['creative']})],
pushDevices:[{id:'pd_this',name:'Bu cihaz',current:true,registered:false,status:'İzin bekleniyor',last:'şimdi'},{id:'pd_iphone',name:'iPhone 15 · Safari (PWA)',current:false,registered:true,status:'Etkin',last:'13.10 22:10'},{id:'pd_pixel',name:'Pixel 8 · Chrome',current:false,registered:true,status:'Etkin',last:'09.10 08:30'}],
pushLog:[],
surveyTemplates:[{id:'csat',name:'CSAT · Teslim memnuniyeti',questions:['Teslim edilen işten ne kadar memnunsunuz? (1–5)','Eklemek istediğiniz bir yorum var mı?']},{id:'nps',name:'NPS · Çeyreklik tavsiye',questions:['Jobs Studio’yu bir meslektaşınıza tavsiye etme olasılığınız nedir? (0–10)','Puanınızın nedeni nedir?']},{id:'pulse',name:'Nabız · Ekip',questions:['İş yükümü sürdürülebilir buluyorum.','Ekibimle iletişimden memnunum.','Yöneticimden yeterli geri bildirim alıyorum.','Burada öğrenmeye ve gelişmeye devam ediyorum.','Jobs Studio’yu iyi bir işyeri olarak tavsiye ederim.']}],
surveyReq:[
{id:'sq1',token:'csat-anova-01',kind:'csat',brand:'c_anova',project:'p3',title:'Anova · Lansman filmi teslimi',sentAt:'2026-10-13',status:'Bekliyor',reminderAt:'2026-10-16'},
{id:'sq2',token:'csat-wellana-01',kind:'csat',brand:'c_wellana',project:'p1',title:'Wellana · Sonbahar filmi v3 teslimi',sentAt:'2026-10-14',status:'Bekliyor',reminderAt:'2026-10-17'},
{id:'sq3',token:'nps-anova-q4',kind:'nps',brand:'c_anova',project:'',title:'Anova · 2026 Q4 tavsiye anketi',sentAt:'2026-10-12',status:'Bekliyor',reminderAt:'2026-10-15'},
{id:'sq4',token:'csat-anova-00',kind:'csat',brand:'c_anova',project:'p5',title:'Anova · Ağustos teslimi',sentAt:'2026-08-28',status:'Yanıtlandı',answeredAt:'2026-08-30'},
{id:'sq5',token:'csat-anova-02',kind:'csat',brand:'c_anova',project:'p3',title:'Anova · Eylül teslimi',sentAt:'2026-09-25',status:'Yanıtlandı',answeredAt:'2026-09-27'},
{id:'sq6',token:'csat-wellana-00',kind:'csat',brand:'c_wellana',project:'p1',title:'Wellana · Eylül teslimi',sentAt:'2026-09-10',status:'Yanıtlandı',answeredAt:'2026-09-12'},
{id:'sq7',token:'csat-badem-01',kind:'csat',brand:'c_badem',project:'p6',title:'Badem Pınarı · Ekim teslimi',sentAt:'2026-09-30',status:'Yanıtlandı',answeredAt:'2026-10-02'},
{id:'sq8',token:'nps-anova-q3',kind:'nps',brand:'c_anova',project:'',title:'Anova · 2026 Q3 tavsiye anketi',sentAt:'2026-09-28',status:'Yanıtlandı',answeredAt:'2026-09-30'},
{id:'sq9',token:'nps-wellana-q3',kind:'nps',brand:'c_wellana',project:'',title:'Wellana · 2026 Q3 tavsiye anketi',sentAt:'2026-09-28',status:'Yanıtlandı',answeredAt:'2026-09-30'},
{id:'sq10',token:'nabiz-2026q4',kind:'pulse',brand:'',project:'',title:'Ekip nabız anketi · 2026 Q4',sentAt:'2026-10-05',status:'Açık'}],
surveyResp:[
{id:'sr1',n:1,kind:'csat',brand:'c_anova',project:'p5',date:'2026-08-30',score:4,comment:'Hızlı dönüş, tasarım güçlü.',who:'Pınar Y.'},
{id:'sr2',n:2,kind:'csat',brand:'c_anova',project:'p3',date:'2026-09-27',score:5,comment:'Lansman filmi beklentimizin üstünde.',who:'Pınar Y.'},
{id:'sr3',n:3,kind:'csat',brand:'c_wellana',project:'p1',date:'2026-09-12',score:3,comment:'Revizyon turları uzadı.',who:'Deniz'},
{id:'sr4',n:4,kind:'csat',brand:'c_badem',project:'p6',date:'2026-10-02',score:5,comment:'Reels çok iyi oldu.',who:'Pazarlama Ekibi'},
{id:'sr5',n:5,kind:'nps',brand:'c_anova',project:'',date:'2026-09-30',score:9,comment:'Tavsiye ederiz.',who:'Pınar Y.'},
{id:'sr6',n:6,kind:'nps',brand:'c_wellana',project:'',date:'2026-09-30',score:6,comment:'Süreç yönetimi geliştirilebilir.',who:'Deniz'},
{id:'sr7',n:7,kind:'pulse',brand:'',date:'2026-10-09',answers:[3,4,4,5,4],comment:''},
{id:'sr8',n:8,kind:'pulse',brand:'',date:'2026-10-10',answers:[2,4,3,4,4],comment:''}],
waTemplates:[{id:'wt1',name:'onay_bekliyor',label:'Onay bekliyor',category:'Utility',body:'Merhaba {{1}}, {{2}} için onayınız bekleniyor. Portal: {{3}}',status:'Onaylı'},{id:'wt2',name:'teslim_hazir',label:'Teslim hazır',category:'Utility',body:'Merhaba {{1}}, {{2}} teslimi hazır. İnceleme bağlantısı: {{3}}',status:'Onaylı'},{id:'wt3',name:'fatura_hatirlatma',label:'Fatura hatırlatma',category:'Utility',body:'Merhaba {{1}}, {{2}} numaralı faturanın vadesi {{3}}.',status:'Beklemede'}],
wa:{business:'Jobs Studio Ajans',verified:'Doğrulandı · 02.09.2026',businessId:'•••• 3391',phone:'+90 312 555 01 90',quality:'Yeşil',webhookSig:'X-Hub-Signature-256 · HMAC-SHA256 · ••••a91f',webhookAt:'14.10 09:02',webhookOk:true}
}));
const WA_SEED=[
{id:'wa1',from:'Pınar Y.',phone:'+90 312 000 00 01',subject:'WhatsApp · Lansman için 2 story daha',received:'14.10 08:41',waAt:'2026-10-14T08:41',client:'c_anova',body:'Merhaba, lansman için 2 story görseli daha rica edebilir miyiz? Yarın sabaha lazım.',drafts:[{unit:'social',type:'Story görseli',qty:2,title:'Anova lansman · story seti',owner:'DO',days:1}]},
{id:'wa2',from:'Deniz',phone:'+90 212 000 00 02',subject:'WhatsApp · Slogan kartı süresi',received:'14.10 09:15',waAt:'2026-10-14T09:15',client:'c_wellana',body:'Film v3 için slogan kartı bir saniye uzun kalsın. Reels uyarlamasına da aynı değişiklik.',drafts:[{unit:'revize',type:'Revize turu',qty:1,title:'Wellana film v3 · slogan kartı revizesi',owner:'HO',days:2}]},
{id:'wa3',from:'Pazarlama Ekibi',phone:'+90 312 000 00 04',subject:'WhatsApp · Ekim takvimi 3. post',received:'12.10 17:20',waAt:'2026-10-12T17:20',client:'c_badem',body:'Ekim takvimindeki 3. postun metni değişecek, yeni metni e-postayla göndereceğiz.',drafts:[{unit:'task',type:'Metin güncelleme',qty:1,title:'Badem Pınarı · 3. post metin güncellemesi',owner:'SO',days:2}]},
{id:'wa4',from:'Mert',phone:'+90 312 000 00 06',subject:'WhatsApp · Toplantı saati',received:'13.10 16:05',waAt:'2026-10-13T16:05',client:'c_esen',body:'Cuma toplantısını Perşembe 15:00’e çekebilir miyiz?',drafts:[{unit:'task',type:'Toplantı planı',qty:1,title:'Esen · toplantıyı Perşembe 15:00’e taşı',owner:'OE',days:1}]}];
const WA_OPT={k1:['2026-09-14','Portal formu'],k2:['2026-09-02','E-posta daveti'],k4:['2026-08-21','Sözleşme eki'],k6:['2026-09-30','Toplantı notu']};
const svClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/* seed sonrası yama: matris satırları, kişi opt-in, WhatsApp postaları, sağlık skoru anket etkisi (idempotent) */
function commsPatch(s){
  const mx=s.settings.notifications.matrix;
  mx.client_comment=mx.client_comment||{app:true,email:true,slack:true,push:true};
  mx.leave_approved=mx.leave_approved||{app:true,email:false,slack:false,push:true};
  mx.message=mx.message||{app:true,email:false,slack:false,push:false};
  mx.mention=mx.mention||{app:true,email:false,slack:true,push:true};
  (s.contacts||[]).forEach(k=>{if(k.whatsapp_optin===undefined){const o=WA_OPT[k.id];k.whatsapp_optin=o?{date:o[0],source:o[1]}:null}});
  if(!s.mails.some(m=>m.channel==='WhatsApp'))s.mails.push(...WA_SEED.map(w=>({id:w.id,from:w.from,email:w.phone,phone:w.phone,subject:w.subject,received:w.received,waAt:w.waAt,status:'Yeni',client:w.client,matched:'phone',threadId:'wa:'+WA_PH(w.phone),body:w.body,attachments:[],drafts:w.drafts,channel:'WhatsApp',replies:[]})));
  if(!s.mails.some(m=>m.channel==='Portal'))s.mails.push({id:'pt1',from:'Pınar Y.',email:'marketing@anova.example',subject:'Portal · Bayi toplantısı için ek slaytlar',received:'13.10 15:20',status:'Yeni',client:'c_anova',matched:'auto',threadId:'portal:rq1',body:'Bayi toplantısı için 4 ek slayt rica ediyoruz (portal talebi rq1).',attachments:[],drafts:[{unit:'presentation',type:'Sunum slaytı',qty:1,title:'Anova · bayi toplantısı ek slaytları',owner:'SK',days:4}],channel:'Portal'});
  s.clients.forEach(c=>{const cs=(s.surveyResp||[]).filter(r=>r.brand===c.id&&r.kind==='csat').slice(-3),np=(s.surveyResp||[]).filter(r=>r.brand===c.id&&r.kind==='nps').at(-1);if(c.healthBase==null&&(cs.length||np)){let adj=0;if(cs.length)adj+=Math.round((cs.reduce((a,r)=>a+r.score,0)/cs.length-3.5)*5);if(np)adj+=np.score>=9?3:np.score<=6?-3:0;adj=svClamp(adj,-10,10);c.healthBase=c.health-adj}});
  return s}
{const s0=seed;seed=function(){return commsPatch(s0())}}
function commsEnsure(){['channels','messages','pushDevices','pushLog','surveyReq','surveyResp','waTemplates','surveyTemplates'].forEach(k=>{if(!Array.isArray(state[k]))state[k]=[]});if(!state.wa)state.wa={}}
function commsBoot(){commsEnsure();commsPatch(state);
  if(!document.getElementById('cm-panel')){document.body.insertAdjacentHTML('beforeend','<div id="cm-scrim" class="cm-scrim" hidden></div><aside id="cm-panel" class="cm-panel" role="dialog" aria-label="Mesajlar" hidden><header class="cm-panel-head"><h2>Mesajlar</h2><a class="text-button" href="#messages" data-action="cm-close">Tam ekran</a><button class="icon-button" data-action="cm-close" aria-label="Mesaj panelini kapat"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="cm-mount" data-mode="panel"></div></aside>')}
  if(navigator.serviceWorker)navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='notif-open'&&e.data.hash)location.hash=e.data.hash})}

/* =====================================================================
   1) MESAJLAR
   ===================================================================== */
const cmAcc=id=>accounts.find(a=>a.id===id);
const cmFirst=n=>String(n||'').split(' ')[0];
const cmLow=s=>String(s||'').toLocaleLowerCase('tr');
const cmCh=id=>state.channels.find(c=>c.id===id);
const cmCanSee=(c,a=account())=>a.role==='client'?((c.type==='brand'||c.type==='ctx')&&!!c.brand&&(a.brands||[]).includes(c.brand)):(c.type==='dm'?(c.members||[]).includes(a.id):true);
const cmVisible=(m,a=account())=>a.role!=='client'||m.vis==='client';
const cmChans=(a=account())=>state.channels.filter(c=>cmCanSee(c,a));
const cmList=(id,a=account())=>state.messages.filter(m=>m.ch===id&&cmVisible(m,a)).sort((x,y)=>x.ts-y.ts);
const cmUnreadIn=(id,a=account())=>cmList(id,a).filter(m=>m.author!==a.id&&!(m.readBy||[]).includes(a.id)).length;
function commsUnread(a=account()){return Array.isArray(state.channels)?cmChans(a).reduce((s,c)=>s+cmUnreadIn(c.id,a),0):0}
const cmName=(c,a=account())=>c.type==='dm'?(cmAcc((c.members||[]).find(x=>x!==a.id))?.name||'DM'):c.name;
const cmKind={project:'Proje',task:'Görev',review:'Review',portalreq:'Portal talebi'};
function cmMarkRead(id,a=account()){let n=0;cmList(id,a).forEach(m=>{if(m.author!==a.id&&!(m.readBy||[]).includes(a.id)){(m.readBy=m.readBy||[]).push(a.id);n++}});if(n)save();return n}
function cmDm(otherId){const a=account(),id='dm:'+[a.id,otherId].sort().join('|');let c=cmCh(id);if(!c){c={id,name:'DM',type:'dm',members:[a.id,otherId].sort(),brand:null};state.channels.push(c);save()}return c}
function cmEnsureCtx(kind,id){const cid=`ctx:${kind}:${id}`;let c=cmCh(cid);if(c)return c;let name=id,brandId=null;
  if(kind==='project'){const p=project(id);name=p?.name||id;brandId=p?.client}
  else if(kind==='task'){const t=state.tasks.find(x=>x.id===id);name=t?.name||id;brandId=project(t?.project)?.client}
  else if(kind==='review'){const r=state.reviews.find(x=>x.id===id);name=r?`${r.name} ${r.current}`:id;brandId=r?.client}
  else if(kind==='portalreq'){const r=(state.requests||[]).find(x=>x.id===id);name=r?.title||id;brandId=r?.client}
  c={id:cid,name,type:'ctx',kind,ref:id,brand:brandId||null,slack:false};state.channels.push(c);save();return c}
const cmMentionHtml=txt=>{let h=esc(txt);state.team.forEach(t=>{const f=cmFirst(t.name);if(!f)return;h=h.replace(new RegExp('@'+f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}])','giu'),x=>`<span class="cm-mention">${x}</span>`)});return h};
const cmParseMentions=txt=>state.team.filter(t=>cmLow(txt).includes('@'+cmLow(cmFirst(t.name)))).map(t=>t.id);
function cmAvatar(m){const a=cmAcc(m.author);return a?avatar(a.person,'',a.name):`<span class="avatar">•</span>`}
function cmMsgHtml(m,c){const a=cmAcc(m.author),me=account(),mine=m.author===me.id,isC=me.role==='client';
  const rd=(m.readBy||[]).filter(x=>x!==m.author);const names=rd.map(x=>cmAcc(x)?.name).filter(Boolean).join(', ');
  const visBadge=!isC&&c.type!=='dm'&&c.brand?(m.vis==='client'?badge('Müşteriye açık','lime'):badge('İç not','neutral')):'';
  const canTask=!isC&&can('tasks')&&!m.task;
  return `<article class="cm-msg ${mine?'mine':''} ${m.vis==='client'&&!isC&&c.brand?'client-vis':''}" data-id="${m.id}">${cmAvatar(m)}<div class="cm-bub"><header><strong>${esc(a?.name||'Sistem')}</strong><time>${esc(m.label)}</time>${visBadge}${m.slack?`<span class="badge cyan cm-slack-b">Slack’e yansıtıldı</span>`:''}</header><p>${cmMentionHtml(m.text)}</p><footer>${mine?`<span class="cm-read" title="${esc(names)}">${rd.length?`Okundu · ${rd.length}`:'Gönderildi'}</span>`:''}${m.task?`<button class="text-button" data-action="task-open" data-id="${m.task}">Görev oluşturuldu</button>`:''}${canTask?`<button class="text-button" data-action="cm-task" data-id="${m.id}">Mesajdan görev oluştur</button>`:''}</footer></div></article>`}
function cmComposer(c){const a=account(),isC=a.role==='client',canVis=!isC&&c.type!=='dm'&&!!c.brand,vis=ui.cmVis||'internal';
  return `<div class="cm-composer" data-ch="${c.id}">${canVis?`<div class="cm-vis" role="group" aria-label="Görünürlük"><button class="${vis!=='client'?'on':''}" data-action="cm-vis" data-id="internal" aria-pressed="${vis!=='client'}">İç not</button><button class="${vis==='client'?'on':''}" data-action="cm-vis" data-id="client" aria-pressed="${vis==='client'}">Müşteriye açık</button></div>`:isC?`<div class="cm-vis single">${badge('Müşteriye açık','lime')}</div>`:''}<div class="cm-ac" role="listbox" aria-label="Bahsetme önerileri" hidden></div><div class="cm-row"><textarea class="cm-input" rows="2" maxlength="1000" placeholder="Mesaj yaz… @ ile bahset" aria-label="Mesaj">${esc(ui.cmDraft||'')}</textarea><button class="button primary" data-action="cm-send" aria-label="Mesajı gönder">${ic('arrow')}<span>Gönder</span></button></div></div>`}
function cmThread(c,o={}){const a=account(),isC=a.role==='client',msgs=cmList(c.id),unreadIds=new Set(msgs.filter(m=>m.author!==a.id&&!(m.readBy||[]).includes(a.id)).map(m=>m.id));
  const slackOk=!isC&&(c.type==='team'||c.type==='brand'||c.type==='ctx');
  const sub=c.type==='ctx'?`${cmKind[c.kind]||'Kayıt'} konuşması${c.brand?' · '+esc(client(c.brand)):''}`:c.type==='brand'?`Marka kanalı · ${esc(client(c.brand))}${isC?'':' · müşteriyle paylaşılabilir'}`:c.type==='dm'?'Doğrudan mesaj':'Ekip kanalı · yalnızca ekip';
  return `<section class="cm-thread" data-ch="${c.id}" aria-label="${esc(cmName(c))}"><header class="cm-head">${o.back?`<button class="icon-button sm cm-back" data-action="cm-back" aria-label="Kanal listesine dön">${ic('left')}</button>`:''}<div class="cm-title"><h3>${esc(cmName(c))}</h3><small>${sub}</small></div>${slackOk?`<div class="cm-slack"><span>Slack köprüsü</span><button class="switch" role="switch" aria-checked="${!!c.slack}" aria-label="Slack köprüsü" data-action="cm-slack" data-id="${c.id}"></button></div>`:''}${unreadIds.size?`<button class="button sm" data-action="cm-read" data-id="${c.id}">${ic('check')}<span>Okundu say</span></button>`:''}</header>${c.slack&&slackOk?`<p class="cm-note small muted">Simüle: bu kanaldaki yeni mesajlar Slack’e yansıtılır (gerçek Slack çağrısı yok).</p>`:''}<div class="cm-msgs" role="log" aria-live="polite" tabindex="0" aria-label="Mesajlar">${msgs.map(m=>cmMsgHtml(m,c)).join('')||'<p class="empty">Henüz mesaj yok. İlk mesajı sen yaz.</p>'}</div>${cmComposer(c)}</section>`}
function cmListPane(){const a=account(),isC=a.role==='client',q=cmLow(ui.cmQ||'').trim();
  const chans=cmChans(a),row=c=>{const u=cmUnreadIn(c.id,a);return `<button class="cm-ch ${ui.cmCh===c.id?'on':''}" data-action="cm-open" data-id="${c.id}" ${ui.cmCh===c.id?'aria-current="true"':''}><span class="cm-ch-name">${c.type==='dm'&&cmAcc((c.members||[]).find(x=>x!==a.id))?avatar(cmAcc((c.members||[]).find(x=>x!==a.id)).person,'',cmName(c)):''}<span>${esc(cmName(c))}</span></span>${u?`<span class="count" aria-label="${u} okunmamış">${u}</span>`:''}</button>`};
  let body;
  if(q){const res=[];chans.forEach(c=>cmList(c.id,a).forEach(m=>{if(cmLow(m.text).includes(q))res.push([c,m])}));
    body=`<div class="cm-group"><div class="cm-glabel">Arama sonuçları · ${res.length}</div>${res.map(([c,m])=>`<button class="cm-res" data-action="cm-open" data-id="${c.id}"><strong>${esc(cmName(c,a))}</strong><span>${cmMentionHtml(m.text.slice(0,90))}</span><small>${esc(cmAcc(m.author)?.name||'')} · ${esc(m.label)}</small></button>`).join('')||'<p class="empty small">Eşleşen mesaj yok.</p>'}</div>`}
  else{const team=chans.filter(c=>c.type==='team'||c.type==='brand'),dms=chans.filter(c=>c.type==='dm'),ctx=chans.filter(c=>c.type==='ctx');
    const others=isC?[]:accounts.filter(x=>x.id!==a.id&&x.role!=='client'&&!dms.some(d=>(d.members||[]).includes(x.id)));
    body=`<div class="cm-group"><div class="cm-glabel">${isC?'Marka kanalları':'Ekip kanalları'}</div>${team.map(row).join('')||'<p class="empty small">Kanal yok.</p>'}</div>${isC?'':`<div class="cm-group"><div class="cm-glabel">Doğrudan mesajlar</div>${dms.map(row).join('')}${others.length?`<label class="cm-newdm">Yeni DM<select data-action-change="cm-dm" aria-label="Yeni DM başlat"><option value="">Kişi seç…</option>${others.map(o=>`<option value="${o.id}">${esc(o.name)} · ${esc(roleLabel[o.role])}</option>`).join('')}</select></label>`:''}</div>`}${ctx.length?`<div class="cm-group"><div class="cm-glabel">Kayıt konuşmaları</div>${ctx.map(row).join('')}</div>`:''}`}
  return `<div class="cm-list"><label class="cm-search-w"><span class="sr-only">Mesajlarda ara</span>${ic('search')}<input class="cm-search" type="search" placeholder="Mesajlarda ara" value="${esc(ui.cmQ||'')}" aria-label="Mesajlarda ara"></label>${body}</div>`}
function cmShell(mode,mount){const a=account();
  if(mode==='embed'){const c=cmCh(mount?.dataset.ch);return c&&cmCanSee(c,a)?cmThread(c,{embed:true}):'<p class="empty">Bu konuşmaya erişimin yok.</p>'}
  const chans=cmChans(a);let c=cmCh(ui.cmCh);if(!c||!cmCanSee(c,a)){c=chans.find(x=>cmUnreadIn(x.id,a))||chans[0];ui.cmCh=c?.id}
  const view=(mode==='panel'?ui.cmViewP:ui.cmViewS)||'list';
  return `<div class="cm-wrap" data-view="${view}" data-mode="${mode}">${cmListPane()}<div class="cm-pane">${c?cmThread(c,{back:true}):'<p class="empty">Erişilebilir kanal yok.</p>'}</div></div>`}
function cmScroll(){document.querySelectorAll('.cm-msgs').forEach(el=>{el.scrollTop=el.scrollHeight})}
let cmReadTimer=null;
function cmAutoRead(){clearTimeout(cmReadTimer);cmReadTimer=setTimeout(()=>{const a=account();const ids=new Set();document.querySelectorAll('.cm-mount').forEach(m=>{if(m.dataset.mode==='embed'){ids.add(m.dataset.ch)}else if(m.closest('#cm-panel')?ui.cmPanel:true){const w=m.querySelector('.cm-wrap');if(w&&(w.dataset.view==='thread'||(w.dataset.mode==='screen'&&window.innerWidth>900)))ids.add(ui.cmCh)}});let n=0;ids.forEach(id=>{const c=cmCh(id);if(c&&cmCanSee(c,a))n+=cmMarkRead(id,a)});if(n){commsBadges();cmPaint(true)}},500)}
function cmPaint(skipAuto){document.querySelectorAll('.cm-mount').forEach(m=>{if(m.id==='cm-panel-m'||m.closest('#cm-panel')&&!ui.cmPanel)return;const f=document.activeElement;let keep=null;if(f&&m.contains(f)&&/^(cm-input|cm-search)$/.test(f.className.split(' ')[0])){keep={cls:f.className.split(' ')[0],s:f.selectionStart,e:f.selectionEnd}}const sc=[...m.querySelectorAll('.cm-msgs')].map(x=>x.scrollTop);m.innerHTML=cmShell(m.dataset.mode,m);if(keep){const n=m.querySelector('.'+keep.cls);if(n){n.focus({preventScroll:true});try{n.setSelectionRange(keep.s,keep.e)}catch{}}}});cmScroll();if(!skipAuto)cmAutoRead()}
function commsBadges(){const n=commsUnread();const b=document.querySelector('.cm-btn');if(b){b.querySelector('.count-dot')?.remove();if(n)b.insertAdjacentHTML('beforeend',`<span class="count-dot">${n}</span>`);b.setAttribute('aria-label',`Mesajlar (${n} okunmamış)`)}const nav=document.querySelector('.nav-item[href="#messages"]');if(nav){nav.querySelector('.count')?.remove();if(n)nav.insertAdjacentHTML('beforeend',`<span class="count">${n}</span>`)}}
function commsAfterRender(){
  const panel=document.getElementById('cm-panel'),scrim=document.getElementById('cm-scrim');
  if(!state.session.loggedIn){if(panel){panel.hidden=true;scrim.hidden=true;ui.cmPanel=false}return}
  if(can('messages')&&!document.querySelector('.cm-btn')){const nw=document.querySelector('.top-actions .notif-wrap');const n=commsUnread();if(nw)nw.insertAdjacentHTML('beforebegin',`<button class="icon-button bell cm-btn" data-action="cm-toggle" aria-label="Mesajlar (${n} okunmamış)" aria-expanded="${!!ui.cmPanel}" aria-haspopup="dialog">${ic('chat')}${n?`<span class="count-dot">${n}</span>`:''}</button>`)}
  if(panel){panel.hidden=!ui.cmPanel;scrim.hidden=!ui.cmPanel||window.innerWidth>720}
  document.querySelectorAll('.cm-mount').forEach(m=>{if(m.closest('#cm-panel')&&!ui.cmPanel)return;if(!m.innerHTML.trim())m.innerHTML=cmShell(m.dataset.mode,m)});
  if(ui.cmPanel)cmPaint(true);cmScroll();cmAutoRead()}
{const r1=render;render=function(){r1.apply(this,arguments);try{commsAfterRender()}catch(e){console.error('comms',e)}}}

function cmSend(chId,text){const a=account(),c=cmCh(chId);if(!c||!cmCanSee(c,a)||!text.trim())return;const isC=a.role==='client';
  const vis=isC?'client':(c.brand&&c.type!=='dm'?(ui.cmVis||'internal'):'internal');
  const ments=cmParseMentions(text);
  const m={id:uid('m'),ch:chId,author:a.id,text:text.trim().slice(0,1000),ts:Math.max(Date.now(),...state.messages.map(x=>x.ts))+1,label:new Date().toTimeString().slice(0,5),vis,mentions:ments,readBy:[a.id],slack:!!c.slack&&c.type!=='dm',task:null};
  state.messages.push(m);cmMarkRead(chId,a);
  if(m.slack)log(`Slack köprüsü (simüle): ${cmName(c)} mesajı yansıtıldı`);
  ments.forEach(pid=>commsNotify('mention',{text:`${cmFirst(a.name)} seni ${cmName(c)} konuşmasında andı: ${m.text.slice(0,60)}`,route:'messages',tag:'msg:'+chId+':'+pid}));
  if(isC)commsNotify('client_comment',{text:`Müşteri mesajı (${cmName(c)}): ${m.text.slice(0,60)}`,route:'messages',tag:'msg:'+chId});
  ui.cmDraft='';log(`Mesaj gönderildi: ${cmName(c)} (${vis==='client'?'müşteriye açık':'iç'})`);commsBadges();
  if(document.querySelector('.cm-mount')){cmPaint(true);document.querySelector(`.cm-thread[data-ch="${chId}"] .cm-input`)?.focus({preventScroll:true});}else render()}
function cmAc(ta){const box=ta.closest('.cm-composer')?.querySelector('.cm-ac');if(!box)return;const pre=ta.value.slice(0,ta.selectionStart),mm=pre.match(/(?:^|\s)@([\p{L}.]*)$/u);
  if(!mm){box.hidden=true;box.innerHTML='';return}const q=cmLow(mm[1]);const hits=state.team.filter(t=>cmLow(t.name).split(' ').some(p=>p.startsWith(q))||cmLow(t.name).startsWith(q)).slice(0,6);
  if(!hits.length){box.hidden=true;box.innerHTML='';return}box.hidden=false;box.innerHTML=hits.map(t=>`<button class="cm-ac-i" role="option" data-action="cm-mention" data-id="${t.id}" data-name="${esc(cmFirst(t.name))}">${avatar(t.id,'',t.name)}<span>${esc(t.name)}<small>${esc(t.role)}</small></span></button>`).join('')}
document.addEventListener('input',e=>{const t=e.target;if(t.classList?.contains('cm-input')){ui.cmDraft=t.value;cmAc(t)}else if(t.classList?.contains('cm-search')){ui.cmQ=t.value;if(t.value){ui.cmViewP='list';ui.cmViewS='list'}cmPaint(true)}else if(t.id==='wa-text'){(ui.waDraft=ui.waDraft||{})[t.dataset.id]=t.value}});
document.addEventListener('keydown',e=>{const t=e.target;if(t.classList?.contains('cm-input')&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){const ac=t.closest('.cm-composer').querySelector('.cm-ac');if(ac&&!ac.hidden){const f=ac.querySelector('.cm-ac-i');if(f){e.preventDefault();f.click();return}}e.preventDefault();cmSend(t.closest('.cm-composer').dataset.ch,t.value)}
  if(e.key==='Escape'&&ui.cmPanel&&!document.querySelector('dialog[open]')){const ac=document.querySelector('.cm-ac:not([hidden])');if(ac){ac.hidden=true;return}actions['cm-close']()}});
document.addEventListener('change',e=>{const t=e.target;if(t.dataset?.actionChange==='cm-dm'&&t.value){const c=cmDm(t.value);ui.cmCh=c.id;ui.cmViewP='thread';ui.cmViewS='thread';ui.cmQ='';cmPaint()}});
Object.assign(actions,{
'cm-toggle'(){if(route==='messages'){location.hash='messages';return}ui.cmPanel=!ui.cmPanel;if(ui.cmPanel)ui.cmViewP='list';commsAfterRender();if(ui.cmPanel)document.querySelector('#cm-panel .cm-search')?.focus();else document.querySelector('.cm-btn')?.focus();document.querySelector('.cm-btn')?.setAttribute('aria-expanded',String(!!ui.cmPanel))},
'cm-close'(){ui.cmPanel=false;commsAfterRender();document.querySelector('.cm-btn')?.setAttribute('aria-expanded','false');document.querySelector('.cm-btn')?.focus()},
'cm-open'(b){const c=cmCh(b.dataset.id);if(!c)return;ui.cmCh=c.id;if(b.closest('.cm-wrap')?.dataset.mode==='panel')ui.cmViewP='thread';else ui.cmViewS='thread';ui.cmQ='';cmMarkRead(c.id);commsBadges();cmPaint(true);document.querySelector('.cm-thread[data-ch="'+c.id+'"] .cm-input')?.focus({preventScroll:true})},
'cm-back'(b){if(b.closest('.cm-wrap')?.dataset.mode==='panel')ui.cmViewP='list';else ui.cmViewS='list';cmPaint(true)},
'cm-read'(b){cmMarkRead(b.dataset.id);commsBadges();cmPaint(true)},
'cm-vis'(b){ui.cmVis=b.dataset.id;cmPaint(true)},
'cm-send'(b){const f=b.closest('.cm-composer');cmSend(f.dataset.ch,f.querySelector('.cm-input').value)},
'cm-mention'(b){const ta=b.closest('.cm-composer').querySelector('.cm-input');const pre=ta.value.slice(0,ta.selectionStart).replace(/@[\p{L}.]*$/u,'@'+b.dataset.name+' ');const post=ta.value.slice(ta.selectionStart);ta.value=pre+post;ui.cmDraft=ta.value;ta.focus();ta.setSelectionRange(pre.length,pre.length);const box=b.closest('.cm-ac');box.hidden=true;box.innerHTML=''},
'cm-slack'(b){const c=cmCh(b.dataset.id);if(!c)return;c.slack=!c.slack;log(`Slack köprüsü ${c.slack?'açıldı':'kapatıldı'} (simüle): ${cmName(c)}`);save();cmPaint(true);toast(c.slack?'Slack köprüsü açık (simüle): yeni mesajlar yansıtılır.':'Slack köprüsü kapalı.')},
'cm-task'(b){const m=state.messages.find(x=>x.id===b.dataset.id);if(!m)return;const c=cmCh(m.ch);let pid=null;if(c?.kind==='project')pid=c.ref;else if(c?.kind==='task')pid=state.tasks.find(t=>t.id===c.ref)?.project;else if(c?.brand)pid=state.projects.find(p=>p.client===c.brand&&p.status!=='Tamamlandı')?.id;ui.cmTaskFrom=m.id;if(ui.cmPanel){ui.cmPanel=false;commsAfterRender()}newTask(pid||state.projects[0]?.id,{name:m.text.replace(/@/g,'').slice(0,110)})},
'cm-ctx'(b){const c=cmEnsureCtx(b.dataset.kind,b.dataset.ref);ui.cmCh=c.id;ui.cmViewP='thread';ui.cmViewS='thread';ui.cmQ='';if($('#modal').open)closeDialog();if(route==='messages'){render();return}ui.cmPanel=true;commsAfterRender();cmPaint(true)},
'cm-readall'(){cmChans().forEach(c=>cmMarkRead(c.id));commsBadges();cmPaint(true);toast('Tüm mesajlar okundu sayıldı.')}
});
{const tf=forms['task-form'];if(tf)forms['task-form']=function(get,data,f,e){const n0=state.tasks.length;tf(get,data,f,e);if(state.tasks.length>n0){const tk=state.tasks[0];const mid=ui.cmTaskFrom;ui.cmTaskFrom=null;
  if(mid){const m=state.messages.find(x=>x.id===mid);if(m){m.task=tk.id;tk.fromMessage=mid;log(`Mesajdan görev oluşturuldu: ${tk.name}`);save()}}
  commsNotify('task_assigned',{text:`Görev atandı: ${tk.name} → ${person(tk.owner)}`,route:'tasks/liste',tag:'task:'+tk.id});render()}}}
function ctxTab(kind,items,key,labelFn,note){
  if(!items.length)return `<p class="empty">Konuşma açılacak kayıt yok.</p>`;
  const id=items.some(x=>x.id===ui[key])?ui[key]:items[0].id;const c=cmEnsureCtx(kind,id);
  return `<div class="toolbar"><label class="form-field" style="min-width:260px">${cmKind[kind]}<select data-ui-sel="${key}">${items.map(x=>option(x.id,labelFn(x),id)).join('')}</select></label><button class="button sm" data-action="cm-ctx" data-kind="${kind}" data-ref="${id}">${ic('chat')}<span>Panelde aç</span></button></div><p class="small muted">${note} Aynı konuşma Mesajlar ekranında “Kayıt konuşmaları” altında da görünür.</p><div class="cm-mount cm-embed" data-mode="embed" data-ch="${c.id}">${cmThread(c,{embed:true})}</div>`}
extend('projects',[['konusma','Konuşma']],{konusma:()=>ctxTab('project',state.projects.filter(p=>inScope(p.client)),'cmProj',p=>p.name,'Proje konuşması: iç not ve müşteriye açık mesajlar ayrıdır.')});
extend('tasks',[['konusma','Konuşma']],{konusma:()=>ctxTab('task',state.tasks.filter(t=>inScope(project(t.project)?.client)&&(!isClient()||t.client_visible)),'cmTask',t=>t.name,'Görev konuşması.')});
extend('review',[['konusma','Konuşma']],{konusma:()=>ctxTab('review',state.reviews.filter(r=>inScope(r.client)),'cmRev',r=>`${r.name} ${r.current}`,'Review sürüm konuşması.')});
extend('portal',[['konusma','Talep konuşması']],{konusma:()=>ctxTab('portalreq',(state.requests||[]).filter(r=>pScope(r.client)),'cmReq',r=>r.title,'Portal talebi konuşması: müşteri yalnızca “Müşteriye açık” mesajları görür.')});
views.messages=()=>head('ANA MENÜ · MESAJLAR','Konuşma, kaydın yanında.','Ekip kanalları, DM’ler ve proje / görev / review / portal talebine bağlı konuşmalar. İç not müşteriye görünmez; Slack köprüsü simüledir.',btn('Tümünü okundu say','cm-readall','','check'))+`<div class="cm-mount cm-screen" data-mode="screen">${cmShell('screen')}</div>`;
{const td=taskDetail;taskDetail=function(id){td(id);const t=state.tasks.find(x=>x.id===id);if(t&&can('messages')&&$('#modal').open){const body=$('#modal .dialog-body');if(body&&!body.querySelector('[data-action="cm-ctx"]'))body.insertAdjacentHTML('beforeend',`<div class="actions cm-dlg"><button class="button sm" data-action="cm-ctx" data-kind="task" data-ref="${t.id}">${ic('chat')}<span>Konuşma</span></button></div>`)}}}

/* =====================================================================
   2) PUSH BİLDİRİMİ
   ===================================================================== */
const PUSH_EV={task_assigned:'Görev atandı',approval_pending:'Onay bekliyor',client_comment:'Müşteri yorumu',board_decision:'Kurul kararı',leave_approved:'Yeni bir İK talebi',integration_error:'Entegrasyon hatası',mention:'Bahsetme'};
const PUSH_SENS=new Set(['leave_approved']);
const pushPerm=()=>typeof Notification==='undefined'?'unsupported':Notification.permission;
const hmMin=s=>{const [h,m]=String(s||'0:0').split(':').map(Number);return (h||0)*60+(m||0)};
function pushQuiet(ev){if(ev==='integration_error')return false;const n=state.settings.notifications,pr=state.profiles?.[account().person];let from=n.quietFrom,to=n.quietTo;
  if(pr?.notif?.quietOverride){from=pr.notif.quietFrom||from;to=pr.notif.quietTo||to}else if(pr?.notif&&pr.notif.quiet===false)return false;
  if(!from||!to)return false;const d=new Date(),cur=d.getHours()*60+d.getMinutes(),f=hmMin(from),t=hmMin(to);return f<=t?(cur>=f&&cur<t):(cur>=f||cur<t)}
function showPush(title,body,tag,route){const hash='#'+(route||'overview');const opts={body,icon:'assets/icons/app-icon-192.png',badge:'assets/icons/app-icon-192.png',tag,data:{hash}};
  const direct=()=>{const n=new Notification(title,opts);n.onclick=()=>{try{window.focus()}catch{}location.hash=hash;try{n.close()}catch{}}};
  if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration){navigator.serviceWorker.getRegistration().then(reg=>reg&&reg.showNotification?reg.showNotification(title,opts):direct()).catch(()=>{try{direct()}catch{}});return}
  direct()}
function commsNotify(ev,o){commsEnsure();const sens=PUSH_SENS.has(ev)||!!o.sensitive;
  const title=sens?'Yeni bir İK talebi':(o.title||PUSH_EV[ev]||'JS Ecosystem'),text=sens?'Yeni bir İK talebi':o.text,body=sens?'Ayrıntı için uygulamayı aç.':(o.body||o.text);
  const tag=o.tag||(ev+':'+(o.route||'')),ex=state.notifications.find(n=>n.tag===tag&&!n.read);
  if(ex){ex.count=(ex.count||1)+1;ex.text=`${ex.base||text} · ${ex.count} bildirim`;ex.time=now().slice(-5);state.notifications=[ex,...state.notifications.filter(n=>n!==ex)]}
  else{state.notifications.unshift({id:'n'+Date.now()+Math.random().toString(36).slice(2,4),text,base:text,tag,count:1,ev,time:now().slice(-5),route:o.route||'overview',read:false});state.notifications=state.notifications.slice(0,20)}
  const row=state.settings.notifications.matrix?.[ev];let res;
  if(!row||!row.push)res='push kapalı (matris)';else if(pushPerm()!=='granted')res='izin yok ('+pushPerm()+')';else if(pushQuiet(ev))res='sessiz saat';
  else{res='gönderildi';try{showPush(title,body,tag,o.route)}catch(e){res='hata: '+(e&&e.message||e)}}
  state.pushLog.unshift({at:now(),ev,title,tag,res,sens});state.pushLog=state.pushLog.slice(0,12);save();return res}
function commsClassify(text,route){const t=String(text),r=String(route||'');
  if(/bordro|İK belge|Belge yenileme|Masraf onayı|izni|izin|belge yükledi|aktarıldı/i.test(t)||/^people/.test(r))return ['leave_approved',true];
  if(/onay bekliyor|Onay bekliyor/.test(t))return ['approval_pending'];
  if(/dış inceleyici yorumu|müşteri.*yorum|Portal talebi|Müşteri mesajı/i.test(t))return ['client_comment'];
  if(/Kurul/.test(t))return ['board_decision'];
  if(/hata|bağlantı.*kes|token süresi|Saha olayı/i.test(t))return ['integration_error'];
  if(/atand|yardım istedi/i.test(t))return ['task_assigned'];
  return null}
function commsIntercept(text,route){if(!state||!Array.isArray(state.pushLog))return false;const c=commsClassify(text,route);if(!c)return false;commsNotify(c[0],{text,route,sensitive:!!c[1]});return true}
function commsPermResult(p){const d=state.pushDevices.find(x=>x.current);if(d){d.registered=p==='granted';d.status=p==='granted'?'Etkin':p==='denied'?'İzin engellendi':'İzin bekleniyor';d.last='şimdi'}log(`Push izni: ${p}`);render();toast(p==='granted'?'Push izni verildi.':p==='denied'?'Push izni engellendi; tarayıcı site ayarlarından açabilirsin.':'Push izni verilmedi.')}
function pushCard(){const perm=pushPerm(),st={granted:['İzin verildi','success'],denied:['Engellendi','danger'],default:['İzin istenmedi','warn'],unsupported:['Desteklenmiyor','neutral']}[perm]||[perm,'neutral'];
  const hint=perm==='unsupported'?'Bu tarayıcı Notification API sunmuyor. iOS / iPadOS’ta uygulamayı ana ekrana ekleyip (PWA) oradan tekrar dene.':perm==='denied'?'Tarayıcı bu site için bildirimleri engelledi. Adres çubuğundaki site ayarlarından izni açıp sayfayı yenile.':perm==='default'?'Henüz izin istenmedi. “İzin iste” tarayıcı iznini açar.':'İzin açık. Matriste “Push” seçili olaylar bu cihaza gelir.';
  return `<section class="panel settings-section cm-push" id="push-card"><h2>Push bildirimi ${badge(st[0],st[1])}</h2><p>Web Push kurulumu (simüle): tarayıcı izni, cihaz kaydı ve istemci tarafı dağıtıcı. Olay oluştuğunda matris satırına bakılır; uygulama içi bildirim her zaman düşer, push yalnızca “Push” açık + izin verilmiş + sessiz saat dışındaysa gönderilir.</p>
  <div class="toggle-row"><div>Tarayıcı izni<small>Notification.permission = <code class="mono">${perm}</code> · ${esc(hint)}</small></div><div class="actions">${btn('İzin iste','push-ask','sm primary','bell')}</div></div>
  <div class="toggle-row"><div>VAPID public key<small>Yer tutucu — sunucu yok; gerçek anahtar çifti bu prototipte üretilmez.</small></div><code class="mono cm-vapid">BNx7•••••••••••••••••••••••••••••••(yer-tutucu)</code></div>
  <div class="toggle-row"><div>Hassas veri kuralı<small>Bordro / İK bildirimleri push’ta yalnızca “Yeni bir İK talebi” metnini taşır; ad, tutar ve belge adı yazılmaz.</small></div>${badge('Etkin','success')}</div>
  <h3 style="margin-top:16px">Cihazlar</h3><div class="table-wrap"><table><thead><tr><th>CİHAZ</th><th>DURUM</th><th>SON</th><th></th></tr></thead><tbody>${state.pushDevices.map(d=>`<tr><td>${esc(d.name)}${d.current?` ${badge('bu cihaz','neutral')}`:''}</td><td>${badge(d.status,d.registered?'success':'warn')}</td><td class="mono">${esc(d.last)}</td><td>${btn('Kaldır','push-del','sm danger','close',`data-id="${d.id}"`)}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">Kayıtlı cihaz yok.</td></tr>'}</tbody></table></div>
  <div class="cm-test"><label class="form-field">Test olayı<select id="push-test-ev">${Object.entries(PUSH_EV).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label>${btn('Test bildirimi gönder','push-test','primary','bell')}</div>
  <h3 style="margin-top:16px">Son gönderimler</h3>${state.pushLog.length?`<ul class="cm-plog">${state.pushLog.slice(0,6).map(l=>`<li><span class="mono">${esc(l.at)}</span> <strong>${esc(l.title)}</strong> <span class="muted">${esc(l.ev)}</span> ${badge(l.res,l.res==='gönderildi'?'success':'neutral')}${l.sens?badge('hassas','warn'):''}</li>`).join('')}</ul>`:'<p class="muted small">Henüz gönderim yok.</p>'}</section>`}
{const sn=settingsNotif;settingsNotif=function(){return sn()+pushCard()}}
{const pv=views.profile;views.profile=function(){const h=pv();const g=state.settings.notifications,p=profile(),P=`profiles.${p.id}`,n=p.notif||{};
  const q=`<div class="toggle-row cm-quiet"><div>Sessiz saatler (kişisel)<small>Açıkken kuruluş saatleri (${esc(g.quietFrom)}–${esc(g.quietTo)}) yerine bunlar geçerli; push gelmez, uygulama içi bildirim düşer.</small></div>${sw(`${P}.notif.quietOverride`,n.quietOverride,'Kişisel sessiz saatler','data-rerender')}</div>${n.quietOverride?`<div class="form-grid"><label class="form-field">Başlangıç<input type="time" data-bind="${P}.notif.quietFrom" value="${esc(n.quietFrom||g.quietFrom)}"></label><label class="form-field">Bitiş<input type="time" data-bind="${P}.notif.quietTo" value="${esc(n.quietTo||g.quietTo)}"></label></div>`:''}`;
  return h.replace('</section><section class="panel"><h2>Güvenlik</h2>',q+'</section><section class="panel"><h2>Güvenlik</h2>')}}
Object.assign(actions,{
'push-ask'(){if(typeof Notification==='undefined'){toast('Bu tarayıcı Notification API desteklemiyor. iOS’ta uygulamayı ana ekrana ekleyip tekrar dene.');log('Push izni istenemedi: API yok');return}
  try{Promise.resolve(Notification.requestPermission()).then(commsPermResult).catch(()=>commsPermResult(Notification.permission))}catch(e){commsPermResult(Notification.permission)}},
'push-test'(){const ev=document.getElementById('push-test-ev')?.value||'task_assigned';let res;try{res=commsNotify(ev,{text:`Test bildirimi: ${PUSH_EV[ev]||ev}`,route:'settings/bildirimler'})}catch(e){res='hata: '+e.message}log(`Test bildirimi: ${ev} → ${res}`);render();toast(res==='gönderildi'?'Test bildirimi gönderildi.':`Uygulama içi bildirim oluştu; push gitmedi (${res}).`)},
'push-del'(b){state.pushDevices=state.pushDevices.filter(d=>d.id!==b.dataset.id);done('Cihaz kaldırıldı.','Push cihazı kaldırıldı')}
});

/* =====================================================================
   3) MEMNUNİYET ANKETLERİ
   ===================================================================== */
const SV_KIND={csat:'CSAT',nps:'NPS',pulse:'Nabız'};
const svResp=(bid,kind)=>state.surveyResp.filter(r=>(!bid||r.brand===bid)&&(!kind||r.kind===kind)).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.n||0)-(b.n||0));
const svAvg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const svNps=rs=>{if(!rs.length)return null;const p=rs.filter(r=>r.score>=9).length,d=rs.filter(r=>r.score<=6).length;return Math.round((p-d)/rs.length*100)};
function surveyAdj(bid){const cs=svResp(bid,'csat').slice(-3),np=svResp(bid,'nps').at(-1);let adj=0;if(cs.length)adj+=Math.round((svAvg(cs.map(r=>r.score))-3.5)*5);if(np)adj+=np.score>=9?3:np.score<=6?-3:0;return svClamp(adj,-10,10)}
function surveyFactor(bid){const a=surveyAdj(bid);return (a>0?'+':'')+a}
function svRecalc(bid){const c=state.clients.find(x=>x.id===bid);if(!c)return;if(c.healthBase==null)c.healthBase=c.health;c.health=svClamp(c.healthBase+surveyAdj(bid),0,100)}
function svAdd(r){r.n=Math.max(0,...state.surveyResp.map(x=>x.n||0))+1;state.surveyResp.push(r);const rq=state.surveyReq.find(q=>q.token===r.token);if(rq&&r.kind!=='pulse'){rq.status='Yanıtlandı';rq.answeredAt=r.date}if(r.brand)svRecalc(r.brand)}
function commsIngestSurvey(it){commsEnsure();const rq=state.surveyReq.find(q=>q.token===it.token);if(!rq)return false;if(rq.kind!=='pulse'&&rq.status==='Yanıtlandı')return false;
  const r={id:uid('sr'),kind:rq.kind,brand:rq.brand||'',project:rq.project||'',date:TODAY,comment:it.comment||''};if(rq.kind!=='pulse')r.token=rq.token;
  if(rq.kind==='pulse'){if(!Array.isArray(it.answers)||it.answers.length!==5)return false;r.answers=it.answers.map(x=>svClamp(Number(x)||1,1,5))}
  else{const sc=Number(it.score);if(!(sc>=(rq.kind==='nps'?0:1)&&sc<=(rq.kind==='nps'?10:5)))return false;r.score=sc;r.who=it.who||''}
  svAdd(r);
  if(rq.kind==='pulse'){state.audit.unshift({text:'Anonim nabız yanıtı alındı (kimlik kaydedilmez)',at:new Date().toLocaleString('tr-TR'),who:'Anonim',role:'external'})}
  else{state.audit.unshift({text:`Anket yanıtı (${SV_KIND[rq.kind]}): ${client(rq.brand)} · ${r.score}`,at:new Date().toLocaleString('tr-TR'),who:r.who||'Dış bağlantı',role:'external'});
    commsNotify('client_comment',{text:`${SV_KIND[rq.kind]} yanıtı geldi: ${client(rq.brand)} · ${r.score}${rq.kind==='csat'?'/5':'/10'}`,route:'crm/memnuniyet',tag:'survey:'+rq.brand})}
  return true}
function svRequest(bid,kind,projectId,viaRule){const nm=client(bid),tok=`${kind}-${bid.replace('c_','')}-${Math.random().toString(36).slice(2,6)}`;
  const q={id:uid('sq'),token:tok,kind,brand:bid,project:projectId||'',title:`${nm} · ${kind==='nps'?SV_Q4:'Teslim memnuniyeti'}`,sentAt:TODAY,status:'Bekliyor',reminderAt:cmPlus(TODAY,3)};
  state.surveyReq.unshift(q);const n={id:uid('pn'),client:bid,text:`Memnuniyet anketiniz hazır: ${q.title}`,at:now(),survey:tok};(state.portalNotifs=state.portalNotifs||[]).unshift(n);
  waMirror(n,'teslim_hazir');log(`Anket isteği (${SV_KIND[kind]}${viaRule?' · otomasyon':''}): ${nm} · 3 gün sonra hatırlatma ${cmDay(q.reminderAt)}`);return q}
const SV_Q4='2026 Q4 tavsiye anketi';
const svSpark=(vals,min,max,label)=>{if(vals.length<1)return '<span class="muted small">Veri yok</span>';const w=160,h=44,x=i=>vals.length===1?w/2:6+i*((w-12)/(vals.length-1)),y=v=>h-6-((v-min)/(max-min||1))*(h-12);return `<svg class="cm-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}: ${vals.join(', ')}"><polyline fill="none" stroke="var(--cyan)" stroke-width="2" points="${vals.map((v,i)=>x(i)+','+y(v)).join(' ')}"/>${vals.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--lime)"><title>${v}</title></circle>`).join('')}</svg>`};
const svRate=bid=>{const q=state.surveyReq.filter(r=>r.kind!=='pulse'&&(!bid||r.brand===bid));return q.length?Math.round(q.filter(r=>r.status==='Yanıtlandı').length/q.length*100):null};
const svLink=tok=>`survey.html?s=${tok}`;
function svAccount360(bid){const cs=svResp(bid,'csat'),np=svResp(bid,'nps'),c=brand(bid);
  return `<section class="panel sv-card" style="margin-top:20px"><div class="panel-header"><h2>Memnuniyet</h2><a class="text-button" href="#crm/memnuniyet">Ayrıntı ${ic('arrow')}</a></div><div class="panel-body sv-sum"><div><small>Son CSAT</small><strong>${cs.length?cs.at(-1).score+' / 5':'—'}</strong></div><div><small>Son NPS yanıtı</small><strong>${np.length?np.at(-1).score+' / 10':'—'}</strong></div><div><small>Anket etkisi (sağlık)</small><strong>${surveyFactor(bid)}</strong></div><div class="sv-spark">${svSpark(cs.map(r=>r.score),1,5,'CSAT trendi')}</div></div></section>`}
{const a360=crmA360;crmA360=function(){const h=a360();return h+svAccount360(ui.a360||'c_anova')}}
extend('crm',[['memnuniyet','Memnuniyet']],{memnuniyet:()=>{const id=ui.a360||'c_anova',c=brand(id);if(!c)return '<p class="empty">Marka yok.</p>';const cs=svResp(id,'csat'),np=svResp(id,'nps'),reqs=state.surveyReq.filter(q=>q.brand===id),rate=svRate(id);
  return `<div class="toolbar"><label class="form-field" style="min-width:240px">Marka<select data-ui-sel="a360">${state.clients.filter(x=>!x.internal).map(x=>option(x.id,x.name,id)).join('')}</select></label><div class="actions">${btn('CSAT anketi gönder','sv-send','sm primary','spark',`data-id="${id}" data-kind="csat"`)}${btn('Çeyreklik NPS gönder','sv-send','sm','spark',`data-id="${id}" data-kind="nps"`)}</div></div>
  <section class="metrics">${metric('Son CSAT',cs.length?cs.at(-1).score+' <small>/ 5</small>':'—',cs.length?cs.at(-1).date:'yanıt yok','spark')}${metric('CSAT ortalama',cs.length?svAvg(cs.map(r=>r.score)).toFixed(1):'—',`${cs.length} yanıt`,'activity')}${metric('NPS',np.length?svNps(np):'—',`${np.length} yanıt`,'crm')}${metric('Yanıt oranı',rate==null?'—':'%'+rate,`${reqs.filter(q=>q.status==='Yanıtlandı').length}/${reqs.length} istek`,'inbox')}</section>
  <section class="content-grid"><div class="panel"><div class="panel-header"><h2>Trend · ${esc(c.name)}</h2>${badge('Sağlık '+c.health,c.health<60?'danger':c.health<75?'warn':'success')}</div><div class="panel-body"><div class="sv-spark big">${svSpark(cs.map(r=>r.score),1,5,'CSAT trendi')}</div><p class="small muted">CSAT geçmişi (1–5). Sağlık skoruna etki: son 3 CSAT ortalaması ve son NPS yanıtı → <strong>${surveyFactor(id)}</strong> puan (taban ${c.healthBase??c.health}).</p></div></div>
  <div class="panel"><div class="panel-header"><h2>Bekleyen istekler</h2></div><div class="panel-body">${reqs.filter(q=>q.status==='Bekliyor').map(q=>`<div class="session-row"><div>${esc(q.title)}<small>${SV_KIND[q.kind]} · gönderim ${cmDay(q.sentAt)} · hatırlatma ${cmDay(q.reminderAt)} · <a href="${svLink(q.token)}">${svLink(q.token)}</a></small></div><div class="actions">${btn('Hatırlat','sv-remind','sm','bell',`data-id="${q.id}"`)}</div></div>`).join('')||'<p class="muted small">Bekleyen istek yok.</p>'}</div></div></section>
  ${tbl(['TARİH','TÜR','SKOR','YORUM','YANITLAYAN'],[...cs,...np].sort((a,b)=>a.date<b.date?1:-1).map(r=>`<tr><td>${date(r.date)}</td><td>${SV_KIND[r.kind]}</td><td>${badge(r.score+(r.kind==='csat'?'/5':'/10'),r.kind==='csat'?(r.score>=4?'success':r.score>=3?'warn':'danger'):(r.score>=9?'success':r.score>=7?'warn':'danger'))}</td><td>${esc(r.comment||'—')}</td><td>${esc(r.who||'—')}</td></tr>`).join(''),'Anket geçmişi')}`}});
extend('portal',[['anketler','Anketler']],{anketler:()=>{const brands=portalBrands(),reqs=state.surveyReq.filter(q=>q.kind!=='pulse'&&brands.includes(q.brand)),mine=state.surveyResp.filter(r=>r.kind!=='pulse'&&brands.includes(r.brand));
  return `<section class="panel"><div class="panel-header"><h2>Bekleyen anketler</h2>${badge(reqs.filter(q=>q.status==='Bekliyor').length+' bekliyor','warn')}</div><div class="panel-body"><p class="small muted">Teslimden sonra CSAT (1–5 + yorum), çeyrekte bir NPS (0–10). Yanıtlar hesap sağlığına yansır. Dış sayfa: <code class="mono">survey.html?s=&lt;kod&gt;</code></p>${reqs.filter(q=>q.status==='Bekliyor').map(q=>`<div class="session-row"><div>${esc(q.title)}<small>${SV_KIND[q.kind]} · ${cmDay(q.sentAt)} · <a class="sv-link" href="${svLink(q.token)}">Anket sayfasında aç</a></small></div><div class="actions">${btn('Yanıtla','sv-answer','sm primary','check',`data-id="${q.id}"`)}</div></div>`).join('')||'<p class="empty">Bekleyen anket yok.</p>'}</div></section>${panel('Yanıtladığınız anketler',mine.map(r=>`<div class="session-row"><div>${esc(client(r.brand))} · ${SV_KIND[r.kind]}<small>${date(r.date)} · ${esc(r.comment||'—')}</small></div>${badge(r.score+(r.kind==='csat'?'/5':'/10'),'success')}</div>`).join('')||'<p class="muted small">Henüz yanıt yok.</p>')}`}});
function svScale(kind){const [a,b]=kind==='nps'?[0,10]:[1,5];let o='';for(let i=a;i<=b;i++)o+=`<label class="sv-opt"><input type="radio" name="score" value="${i}" required><span>${i}</span></label>`;return `<div class="sv-scale" role="radiogroup" aria-label="Puan">${o}</div>`}
const svPulseQs=()=>(state.surveyTemplates.find(t=>t.id==='pulse')?.questions||[]).slice(0,5);
extend('people',[['nabiz','Nabız anketi']],{nabiz:()=>{if(!peopleAllowed().includes('nabiz'))return lockPanel('Nabız sonuçları İK yetkisi ister','Anonim nabız sonuçlarını yalnızca İK ve Owner görür.','can.read.hr_archive');
  const rs=svResp('','pulse'),n=rs.length,qs=svPulseQs(),url=svLink('nabiz-2026q4');
  const link=`<div class="panel"><div class="panel-header"><h2>Anket bağlantısı</h2>${badge('Anonim','ai')}</div><div class="panel-body"><p class="small">Çalışanlara paylaş: <code class="mono">${url}</code></p><div class="actions"><button class="button sm" data-action="copy" data-id="${url}">${ic('files')}<span>Kopyala</span></button><a class="button sm" href="${url}"><span>Aç</span></a>${btn('Demo: anonim yanıt ekle','sv-pulse','sm primary','plus')}</div><p class="small muted">Kimlik, e-posta ve cihaz bilgisi kaydedilmez; tek tek yanıt gösterilmez. Sonuçlar en az 5 yanıtla açılır.</p></div></div>`;
  if(n<5)return `<section class="content-grid">${link}<div class="panel sv-gate"><div class="panel-header"><h2>Sonuçlar</h2>${badge('Gizli','warn')}</div><div class="panel-body"><p class="sv-threshold"><strong>Anonimlik eşiği: 5 yanıt</strong></p><p class="muted">${n} / 5 yanıt toplandı. Eşiğe ulaşılana kadar ortalama ve yorumlar gösterilmez (küçük grupta kimlik çıkarımını önlemek için).</p><div class="progress" role="img" aria-label="${n} / 5 yanıt"><span style="width:${n*20}%"></span></div></div></div></section>`;
  const avg=i=>svAvg(rs.map(r=>r.answers[i]));
  return `<section class="content-grid">${link}<div class="panel"><div class="panel-header"><h2>Sonuçlar · ${n} yanıt</h2>${badge('Eşik aşıldı','success')}</div><div class="panel-body">${qs.map((q,i)=>`<div class="sv-bar"><span>${esc(q)}</span><div class="progress" role="img" aria-label="${esc(q)} ortalama ${avg(i).toFixed(1)}"><span style="width:${avg(i)*20}%"></span></div><b>${avg(i).toFixed(1)}</b></div>`).join('')}<p class="small muted">Katılım ${n} / ${state.employees.length||'—'} çalışan · ölçek 1–5.</p>${rs.some(r=>r.comment)?`<h3>Yorumlar (anonim)</h3>${rs.filter(r=>r.comment).map(r=>`<p class="small">“${esc(r.comment)}”</p>`).join('')}`:''}</div></div></section>`}});
if(typeof PEOPLE_GROUPS!=='undefined'){const g=PEOPLE_GROUPS.find(x=>x[0]==='RAPOR · AKTARIM');if(g&&!g[1].includes('nabiz')){const i=g[1].indexOf('raporlar');g[1].splice(i+1,0,'nabiz')}}
{const o=extParts.insights.musteri;extParts.insights.musteri=function(){const csat=state.surveyResp.filter(r=>r.kind==='csat'&&inScope(r.brand)),np=state.surveyResp.filter(r=>r.kind==='nps'&&inScope(r.brand)),rate=svRate('');
  const per=state.clients.filter(c=>!c.internal&&inScope(c.id)&&state.surveyResp.some(r=>r.brand===c.id));
  return o()+`<section class="metrics">${metric('CSAT ortalama',csat.length?svAvg(csat.map(r=>r.score)).toFixed(1)+' <small>/ 5</small>':'—',`${csat.length} yanıt`,'spark')}${metric('NPS',np.length?svNps(np):'—',`${np.length} yanıt`,'crm')}${metric('Anket yanıt oranı',rate==null?'—':'%'+rate,'CSAT + NPS istekleri','inbox')}</section>${panel('Memnuniyet · marka kırılımı',T(['MÜŞTERİ','SON CSAT','CSAT ORT.','NPS','SAĞLIK ETKİSİ'],per.map(c=>{const cs=svResp(c.id,'csat'),np=svResp(c.id,'nps');return `<tr><td>${esc(c.name)}</td><td>${cs.length?cs.at(-1).score+'/5':'—'}</td><td>${cs.length?svAvg(cs.map(r=>r.score)).toFixed(1):'—'}</td><td>${np.length?svNps(np):'—'}</td><td>${surveyFactor(c.id)}</td></tr>`}),'Memnuniyet raporu'))}`}}
{const ss=settingsStructure;settingsStructure=function(){return ss()+`<section class="panel settings-section" id="sv-tpl"><h2>Anket şablonları</h2><p>CSAT, NPS ve Nabız soruları. Her satır bir soru; Nabız ilk 5 satırı kullanır. İlk soru puan sorusudur.</p><form id="survey-tpl-form" class="form-grid">${state.surveyTemplates.map(t=>`<label class="form-field full">${esc(t.name)}<textarea name="q_${t.id}" rows="${t.id==='pulse'?6:3}" maxlength="900">${esc(t.questions.join('\n'))}</textarea></label>`).join('')}<div class="form-actions full"><button class="button primary" type="submit">Şablonları kaydet ${ic('check')}</button></div></form></section>`}}
AUTO_TRIGGERS.push('delivery.completed');AUTO_ACTIONS.push('survey.request()');
AUTO_TPL.push(['Teslim sonrası CSAT','delivery.completed','client_visible = true','survey.request() → portal.notify() + reminder(3d)']);
Object.assign(forms,{
'survey-tpl-form'(get){state.surveyTemplates.forEach(t=>{const q=get('q_'+t.id).split('\n').map(x=>x.trim()).filter(Boolean);if(q.length)t.questions=t.id==='pulse'?q.slice(0,5):q});if(state.surveyTemplates.find(t=>t.id==='pulse').questions.length<5)state.surveyTemplates.find(t=>t.id==='pulse').questions=svPulseQs().concat(SV_PULSE_DEF).slice(0,5);done('Anket şablonları kaydedildi.','Anket şablonları güncellendi (CSAT, NPS, Nabız)')},
'survey-form'(get,data,f){const rq=state.surveyReq.find(q=>q.id===f.dataset.id);if(!rq||rq.status==='Yanıtlandı')return;const sc=Number(get('score'));if(Number.isNaN(sc))return;const a=account();
  svAdd({id:uid('sr'),token:rq.token,kind:rq.kind,brand:rq.brand,project:rq.project,date:TODAY,score:sc,comment:get('comment'),who:a.name});
  state.audit.unshift({text:`Anket yanıtı (${SV_KIND[rq.kind]}, portal): ${client(rq.brand)} · ${sc}`,at:new Date().toLocaleString('tr-TR'),who:a.name,role:role()});closeDialog();render();toast('Yanıtınız kaydedildi. Teşekkürler!')},
'pulse-form'(get,data,f){const ans=[0,1,2,3,4].map(i=>Number(get('q'+i)));if(ans.some(x=>!(x>=1&&x<=5)))return;state.surveyResp.push({id:uid('sr'),n:Math.max(0,...state.surveyResp.map(x=>x.n||0))+1,kind:'pulse',brand:'',date:TODAY,answers:ans,comment:get('comment')});
  state.audit.unshift({text:'Anonim nabız yanıtı alındı (kimlik kaydedilmez)',at:new Date().toLocaleString('tr-TR'),who:'Anonim',role:'external'});closeDialog();render();toast('Anonim yanıt eklendi.')}});
const SV_PULSE_DEF=['İş yükümü sürdürülebilir buluyorum.','Ekibimle iletişimden memnunum.','Yöneticimden yeterli geri bildirim alıyorum.','Burada öğrenmeye ve gelişmeye devam ediyorum.','Jobs Studio’yu iyi bir işyeri olarak tavsiye ederim.'];
Object.assign(actions,{
'sv-send'(b){const q=svRequest(b.dataset.id,b.dataset.kind,'',false);done(`Anket isteği gönderildi (portal bildirimi + 3 gün sonra hatırlatma). Bağlantı: ${svLink(q.token)}`,null)},
'sv-remind'(b){const q=state.surveyReq.find(x=>x.id===b.dataset.id);if(!q)return;q.reminderAt=cmPlus(TODAY,3);(state.portalNotifs=state.portalNotifs||[]).unshift({id:uid('pn'),client:q.brand,text:`Hatırlatma: ${q.title} anketi sizi bekliyor.`,at:now(),survey:q.token});done('Hatırlatma portal bildirimi olarak gönderildi.',`Anket hatırlatması: ${q.title}`)},
'sv-answer'(b){const q=state.surveyReq.find(x=>x.id===b.dataset.id);if(!q)return;openDialog(esc(q.title),`<form class="dialog-body" id="survey-form" data-id="${q.id}"><p class="small muted">${q.kind==='nps'?'Jobs Studio’yu bir meslektaşınıza tavsiye etme olasılığınız? (0 = hiç, 10 = kesinlikle)':'Teslim edilen işten ne kadar memnunsunuz? (1 = çok memnuniyetsiz, 5 = çok memnun)'}</p>${svScale(q.kind)}<label class="form-field full">Yorum (isteğe bağlı)<textarea name="comment" maxlength="500"></textarea></label><div class="form-actions"><button class="button primary" type="submit">Yanıtı gönder ${ic('check')}</button></div></form>`)},
'sv-pulse'(){openDialog('Anonim nabız yanıtı (demo)',`<form class="dialog-body" id="pulse-form"><p class="small muted">Kimliğin kaydedilmez. 1 = hiç katılmıyorum, 5 = tamamen katılıyorum.</p>${svPulseQs().map((q,i)=>`<label class="form-field full">${i+1}. ${esc(q)}<select name="q${i}">${[3,1,2,4,5].map(v=>`<option>${v}</option>`).join('')}</select></label>`).join('')}<label class="form-field full">Yorum (isteğe bağlı)<textarea name="comment" maxlength="300"></textarea></label><div class="form-actions"><button class="button primary" type="submit">Anonim gönder ${ic('check')}</button></div></form>`)}
});
{const ra=actions['rv-approve'];actions['rv-approve']=function(b){const r=state.reviews.find(x=>x.id===b.dataset.id),first=r&&r.status!=='Onaylandı',n0=(state.portalNotifs||[])[0];ra(b);
  if(first){const nn=(state.portalNotifs||[])[0];if(nn&&nn!==n0&&!nn.wa){waMirror(nn,'teslim_hazir')}
    if(state.automationRules.some(x=>x.name==='Teslim sonrası CSAT'&&x.status==='Yayında')&&!state.surveyReq.some(q=>q.kind==='csat'&&q.brand===r.client&&q.status==='Bekliyor'&&q.sentAt===TODAY&&q.project===r.project)){svRequest(r.client,'csat',r.project,true);save();render()}else{save()}}}}
{const rv=actions['review-version'];actions['review-version']=function(b){const n0=(state.portalNotifs||[])[0];rv(b);const nn=(state.portalNotifs||[])[0];if(nn&&nn!==n0){waMirror(nn,'teslim_hazir');save()}}}

/* =====================================================================
   4) WHATSAPP KANALI (simüle)
   ===================================================================== */
function waDemoNow(){const d=new Date();return new Date(`${TODAY}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`)}
function waWin(m){const ms=24*3600e3-(waDemoNow()-new Date(m.waAt));return {open:ms>0,ms}}
const waContact=m=>state.contacts.find(k=>WA_PH(k.phone)===WA_PH(m.phone));
const waTplOk=name=>state.waTemplates.find(t=>t.name===name&&t.status==='Onaylı');
function waMirror(n,tplName){const k=state.contacts.find(x=>x.client===n.client&&x.whatsapp_optin&&x.kvkk);const t=waTplOk(tplName);if(!k||!t)return false;n.wa={tpl:tplName,to:k.id,at:now()};log(`WhatsApp bildirimi (simüle): ${client(n.client)} · şablon ${tplName} · opt-in ${k.whatsapp_optin.date}`);return true}
function waOptCell(k){const o=k.whatsapp_optin;return `${o?badge('Opt-in '+date(o.date),'success'):badge('Yok','neutral')} ${btn(o?'Geri çek':'Kaydet','wa-optin','sm','mail',`data-id="${k.id}"`)}`}
function waComposer(m){const w=waWin(m),k=waContact(m),opt=k?.whatsapp_optin,tpls=state.waTemplates.filter(t=>t.status==='Onaylı'),sel=ui.waTpl?.[m.id]||tpls[0]?.name,hrs=Math.floor(Math.max(0,w.ms)/3600e3),mins=Math.floor(Math.max(0,w.ms)%3600e3/60e3);
  return `<section class="wa-compose" aria-label="WhatsApp yanıt taslağı"><div class="wa-win ${w.open?'open':'closed'}"><strong>24 saat penceresi: ${w.open?'açık':'kapalı'}</strong><small>${w.open?`Kalan ${hrs} sa ${mins} dk · serbest metin yanıt gönderilebilir`:'Müşterinin son mesajından 24 saat geçti · yalnızca onaylı şablon gönderilebilir'}</small>${w.open?'':badge('Şablon gerekli','warn')}${k?badge(opt?'opt-in var':'opt-in yok',opt?'success':'danger'):badge('CRM kişisi yok','warn')}</div>
  ${w.open?`<label class="form-field full">Yanıt taslağı<textarea id="wa-text" data-id="${m.id}" maxlength="600" rows="3" placeholder="AI taslağı üret veya kendin yaz">${esc(ui.waDraft?.[m.id]||'')}</textarea></label>`:`<label class="form-field full">Onaylı şablon<select id="wa-tpl" data-action-change="wa-tpl" data-id="${m.id}">${tpls.map(t=>option(t.name,t.label,sel)).join('')}</select></label><p class="small muted wa-prev">${esc(state.waTemplates.find(t=>t.name===sel)?.body||'')}</p>${opt?'':'<p class="small" style="color:var(--danger,#ff6a8a)">Kişi WhatsApp opt-in vermediği için işletme tarafından başlatılan şablon gönderilemez.</p>'}`}
  <div class="actions">${w.open?btn('AI yanıt taslağı','wa-draft','sm','spark',`data-id="${m.id}"`):''}${btn('Gönderimi onayla…','wa-send','sm primary','check',`data-id="${m.id}"`)}</div><p class="small muted">İnsan onaylı, simüle gönderim: gerçek Meta Cloud API çağrısı yapılmaz; gönderim audit’e yazılır.</p>
  ${(m.replies||[]).map(r=>`<div class="wa-reply"><small>${esc(r.at)} · ${esc(r.by)} ${r.tpl?badge('şablon: '+r.tpl,'neutral'):''}</small><p>${esc(r.text)}</p></div>`).join('')}</section>`}
document.addEventListener('change',e=>{const t=e.target;if(t.dataset?.actionChange==='wa-tpl'){(ui.waTpl=ui.waTpl||{})[t.dataset.id]=t.value;render()}});
function waConnect(){const w=state.wa||{},T0=state.waTemplates,ok=T0.filter(t=>t.status==='Onaylı').length;
  return `<section class="panel wa-card" id="wa-card"><div class="panel-header"><h2>WhatsApp Business ${badge('Simüle','ai')}</h2>${badge('Meta: '+(w.verified||'—'),'success')}</div><div class="panel-body"><div class="wa-facts"><div><small>Meta Business doğrulama</small><strong>${esc(w.verified||'—')}</strong><small>Business ID ${esc(w.businessId||'')}</small></div><div><small>Telefon</small><strong class="mono">${esc(w.phone||'—')}</strong><small>Kalite: ${esc(w.quality||'—')}</small></div><div><small>Şablon onay durumu</small><strong>${ok} onaylı · ${T0.length-ok} beklemede</strong></div><div><small>Webhook imzası</small><strong class="mono">${esc(w.webhookSig||'—')}</strong><small>Son doğrulama ${esc(w.webhookAt||'—')} ${w.webhookOk?'✓':'✗'}</small></div></div><p class="small"><strong>24 saat pencere kuralı:</strong> müşteri yazdıktan sonra 24 saat boyunca serbest metin yanıt verilebilir; pencere kapandığında yalnızca Meta onaylı şablon mesajı ve yalnızca opt-in veren kişilere gönderilebilir.</p><div class="actions">${btn('Webhook testi (simüle)','wa-webhook','sm','refresh')}<a class="button sm" href="#inbox" data-action="mail-ch" data-id="WhatsApp"><span>Gelen Kutusu › WhatsApp</span>${ic('arrow')}</a></div></div></section>
  ${panel('Gönderim şablonları',T(['ŞABLON','KATEGORİ','İÇERİK','DURUM',''],T0.map(t=>`<tr><td><strong>${esc(t.label)}</strong><small class="mono" style="display:block">${esc(t.name)}</small></td><td>${esc(t.category)}</td><td class="small">${esc(t.body)}</td><td>${badge(t.status,t.status==='Onaylı'?'success':'warn')}</td><td>${t.status==='Beklemede'?btn('Durumu yenile','wa-tpl-refresh','sm','refresh',`data-id="${t.id}"`):''}</td></tr>`),'WhatsApp şablonları'))}
  ${panel('Opt-in kayıt defteri',`<p class="small muted">KVKK: WhatsApp ile işletme kaynaklı iletişim için kişinin açık rızası (opt-in) tarih ve kaynakla kaydedilir; rıza geri çekilebilir. KVKK onayı olmayan kişiler için opt-in kaydedilemez.</p>`+T(['KİŞİ','MARKA','TELEFON','KVKK','WHATSAPP OPT-İN',''],state.contacts.map(k=>`<tr><td>${esc(k.name)}</td><td>${esc(client(k.client))}</td><td class="mono">${esc(k.phone)}</td><td>${k.kvkk?badge('Onaylı','success'):badge('Yok','warn')}</td><td>${k.whatsapp_optin?`${badge('Opt-in','success')} <small>${date(k.whatsapp_optin.date)} · ${esc(k.whatsapp_optin.source)}</small>`:badge('Yok','neutral')}</td><td>${btn(k.whatsapp_optin?'Geri çek':'Opt-in kaydet','wa-optin','sm','mail',`data-id="${k.id}"`)}</td></tr>`),'WhatsApp opt-in kayıtları'))}`}
{const ci=connectIntegrations;connectIntegrations=function(){return ci()+(sub==='entegrasyonlar'||!sub?waConnect():'')}}
Object.assign(actions,{
'wa-optin'(b){const k=state.contacts.find(x=>x.id===b.dataset.id);if(!k)return;if(k.whatsapp_optin){log(`WhatsApp opt-in geri çekildi: ${k.name} (${client(k.client)})`);k.whatsapp_optin=null;done('Opt-in geri çekildi.',null);return}
  if(!k.kvkk){toast('KVKK onayı olmadan WhatsApp opt-in kaydedilemez.');log(`WhatsApp opt-in reddedildi (KVKK onayı yok): ${k.name}`);return}
  k.whatsapp_optin={date:TODAY,source:'Elle kayıt (CRM)'};done('Opt-in kaydedildi (tarih + kaynak).',`WhatsApp opt-in kaydedildi: ${k.name} (${client(k.client)}) · kaynak Elle kayıt`)},
'wa-tpl-refresh'(b){const t=state.waTemplates.find(x=>x.id===b.dataset.id);if(!t)return;t.status='Onaylı';done('Şablon durumu: Onaylı (simüle Meta yanıtı).',`WhatsApp şablonu onaylandı (simüle): ${t.name}`)},
'wa-webhook'(){state.wa.webhookAt=now();state.wa.webhookOk=true;done('Webhook imzası doğrulandı (simüle).','WhatsApp webhook testi: imza doğrulandı (simüle)')},
'wa-draft'(b){const m=state.mails.find(x=>x.id===b.dataset.id);if(!m)return;(ui.waDraft=ui.waDraft||{})[m.id]=`Merhaba ${cmFirst(m.from)}, mesajınız için teşekkürler. Talebinizi aldık; ekibimiz bugün içinde dönüş yapacak. — Jobs Studio`;state.runs.unshift({id:'r'+Date.now(),agent:'Inbox AI',trigger:`whatsapp:${m.id}.reply`,model:state.settings.ai.model,tokens:1900,cost:0.03,status:'Başarılı',at:now()});log(`WhatsApp yanıt taslağı üretildi (AI): ${m.from}`);render()},
'wa-send'(b){const m=state.mails.find(x=>x.id===b.dataset.id);if(!m)return;const w=waWin(m),k=waContact(m);let text='',tpl='';
  if(w.open){text=(document.getElementById('wa-text')?.value||ui.waDraft?.[m.id]||'').trim();if(!text){toast('Önce yanıt metni yaz veya AI taslağı üret.');return}}
  else{tpl=ui.waTpl?.[m.id]||state.waTemplates.find(t=>t.status==='Onaylı')?.name;const t=waTplOk(tpl);if(!t){toast('Şablon gerekli: onaylı bir şablon seç.');return}if(!k?.whatsapp_optin){toast('Opt-in yok: pencere kapalıyken şablon gönderilemez.');log(`WhatsApp gönderimi engellendi (opt-in yok, pencere kapalı): ${m.from}`);return}text=t.body.replace('{{1}}',cmFirst(m.from)).replace('{{2}}',m.subject.replace('WhatsApp · ','')).replace('{{3}}','portal.html')}
  (ui.waDraft=ui.waDraft||{})[m.id]=text;
  openDialog('WhatsApp gönderimini onayla',`<div class="dialog-body"><p class="small muted">Gönderim insan onaylıdır ve simüle edilir; Meta API çağrısı yapılmaz.</p><p><strong>Alıcı:</strong> ${esc(m.from)} · <span class="mono">${esc(m.phone)}</span></p><p><strong>Tür:</strong> ${w.open?'Serbest metin (24 saat penceresi içinde)':'Şablon: '+esc(tpl)}</p><blockquote class="wa-quote">${esc(text)}</blockquote><div class="form-actions">${btn('Onayla ve gönder (simüle)','wa-confirm','primary','check',`data-id="${m.id}" data-tpl="${esc(tpl)}"`)}</div></div>`)},
'wa-confirm'(b){const m=state.mails.find(x=>x.id===b.dataset.id);if(!m)return;const text=ui.waDraft?.[m.id]||'';m.replies=m.replies||[];m.replies.push({text,tpl:b.dataset.tpl||'',at:now(),by:account().name});if(ui.waDraft)delete ui.waDraft[m.id];closeDialog();done('WhatsApp yanıtı gönderildi (simüle).',`WhatsApp yanıtı onaylandı ve gönderildi (simüle): ${m.from} · ${b.dataset.tpl?'şablon '+b.dataset.tpl:'serbest metin'}`)}
});
