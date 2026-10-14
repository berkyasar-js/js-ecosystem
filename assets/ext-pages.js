/* JS Ecosystem · dış sayfalar (v0.7): watch.html (JS Review), apply.html (JS Hire), portal.html (Client Portal).
   Oturum yok; token URL'de. Durum: localStorage 'js-ecosystem-v8' varsa oradan okunur, yoksa gömülü tohum kullanılır.
   Yazma: 'js-ecosystem-v8-queue' kuyruğuna eklenir; ana uygulama açılışta içe alır (yorum, karar, başvuru). Tüm veri kurgusaldır. */
(function(){
'use strict';
var KEY=JSE.KEY,QKEY=JSE.QKEY,TODAY=JSE.TODAY;
var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var $=function(s,r){return (r||document).querySelector(s)};
var IC={check:'<path d="m5 12 4 4L19 6"/>',shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/>',play:'<path d="m7 4 12 8-12 8V4Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',plus:'<path d="M12 5v14M5 12h14"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>'};
var ic=function(n){return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(IC[n]||IC.arrow)+'</svg>'};
var badge=function(t,c){return '<span class="badge '+(c||'')+'">'+esc(t)+'</span>'};
var param=function(k){return new URLSearchParams(location.search).get(k)||''};
var validTok=function(t){return /^[A-Za-z0-9_-]{4,40}$/.test(t)};
var uid=JSE.uid;
var daysTo=function(s){return Math.round((new Date(s+'T12:00:00')-new Date(TODAY+'T12:00:00'))/86400000)};
var dfmt=function(s){return s?new Date(s+'T12:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}):'—'};
var safeUrl=function(u){return /^https?:\/\//i.test(String(u||'').trim())};

/* ---------- veri katmanı ---------- */
var SEED={
  clients:{c_anova:'Anova',c_badem:'Badem Pınarı',c_wellana:'Wellana'},
  extLinks:JSE.LINKS,
  reviews:[JSE.RV3,
    {id:'rv1',name:'Anova · Lansman filmi',client:'c_anova',project:'p3',current:'v2',status:'İncelemede',rounds:{used:1,included:2},versions:[{v:'v1',at:'10.10 18:00',duration:'01:04',comments:[{id:'c2',tc:'00:41',who:'Pınar Y.',text:'Ürün yakın planı daha uzun kalsın.',internal:false,resolved:true}]},{v:'v2',at:'13.10 17:30',duration:'01:02',comments:[{id:'c4',tc:'00:45',who:'Pınar Y.',text:'Ses seviyesi müzikte yüksek; konuşma altta kalıyor.',internal:false,resolved:false}]}]},
    {id:'rv2',name:'Badem Pınarı · Kaynak yolculuğu Reels',client:'c_badem',project:'p6',current:'v2',status:'Müşteri onayı',rounds:{used:0,included:2},versions:[{v:'v1',at:'09.10 16:10',duration:'00:15',comments:[{id:'c6',tc:'00:03',who:'Seda O.',text:'Alt yazı fontu marka kılavuzuna göre değişsin.',internal:false,resolved:true}]},{v:'v2',at:'12.10 11:20',duration:'00:15',comments:[{id:'c7',tc:'00:07',who:'Badem Pınarı ekibi',text:'Kaynak görüntüsü açılışta biraz daha uzun kalabilir.',internal:false,resolved:false}]}]}],
  projects:[{id:'p3',name:'Anova lansman filmi',client:'c_anova',status:'Devam ediyor',pct:62,client_visible:true},{id:'p9',name:'Anova Ekim sosyal serisi',client:'c_anova',status:'Devam ediyor',pct:40,client_visible:true}],
  tasks:[{name:'Lansman filmi · ses karışımı',project:'p3',date:'16 Eki',stage:'Üretim',done:false},{name:'Sosyal görseller · 4 adet',project:'p9',date:'20 Eki',stage:'Brief',done:false},{name:'Lansman sunumu tasarımı',project:'p3',date:'22 Eki',stage:'Brief',done:false}],
  approvals:[{name:'Anova · Lansman filmi v2',desc:'Nihai müşteri onayı bekleniyor.',status:'Bekliyor'}],
  assets:[{name:'Anova_logo_paketi.zip',type:'Paket',status:'Onaylı'},{name:'Anova_lansman_teaser.mp4',type:'Video',status:'Onaylı'}],
  invoices:[{id:'JS-26103',amount:140000,due:'2026-10-31',status:'Bekliyor'}],
  positions:[{id:'ps1',title:'Copywriter',team:'Kreatif',type:'Tam zamanlı',opened:'2026-09-20',status:'Açık'},{id:'ps2',title:'Traffic Lead',team:'Operasyon',type:'Tam zamanlı',opened:'2026-10-01',status:'Açık'},{id:'ps3',title:'Sosyal Medya Uzmanı',team:'Müşteri',type:'Tam zamanlı',opened:'2026-10-05',status:'Açık'},{id:'ps4',title:'Satış & Saha',team:'Müşteri',type:'Tam zamanlı',opened:'2026-10-08',status:'Açık'}],
  careerPage:{title:'Jobs Studio’da çalış',intro:'Ankara’da hibrit; işler gerçek, ekip küçük.',published:true},
  candidates:[],theme:'dark'
};
var readState=JSE.readState,readQ=JSE.readQ,pushQ=JSE.pushQ;
function data(){var s=readState();var d=s||SEED;return {fromState:!!s,s:d,clients:s?Object.fromEntries(s.clients.map(function(c){return [c.id,c.name]})):SEED.clients,
  extLinks:d.extLinks||SEED.extLinks,reviews:d.reviews,positions:d.positions||SEED.positions,careerPage:d.careerPage||SEED.careerPage,candidates:d.candidates||[],q:readQ().filter(function(x){return !x.ingested}),theme:d.theme||'dark'}}

/* ---------- ortak kabuk ---------- */
function shell(tag,body){
  var D=data();document.body.classList.toggle('dark',D.theme!=='light');
  document.getElementById('ext-app').innerHTML='<header class="ext-top"><a class="ext-brand" href="index.html" aria-label="Jobs Studio — JS Ecosystem"><img class="logo-on-dark" src="assets/jobs-logo-light.svg" alt="Jobs Studio"><img class="logo-on-light" src="assets/jobs-logo-dark.svg" alt="Jobs Studio"></a><span class="ext-tag">'+esc(tag)+'</span></header><main id="main" class="ext-main" tabindex="-1">'+body+'</main><footer class="ext-foot">JS Ecosystem · Jobs Studio © 2026 · Prototip; tüm kayıtlar kurgusaldır. Bu sayfada oturum yoktur, erişim bağlantıdaki koda bağlıdır.</footer>';
}
function toast(m){var t=$('#toast');t.textContent=m;t.classList.add('visible');clearTimeout(toast.h);toast.h=setTimeout(function(){t.classList.remove('visible')},3500)}
function stateView(tag,kicker,title,msg,kind){
  shell(tag,'<section class="ext-state '+(kind||'')+'"><div class="eyebrow">'+esc(kicker)+'</div><h1>'+esc(title)+'</h1><p>'+esc(msg)+'</p><a class="button primary" href="index.html"><span>JS Ecosystem’e git</span>'+ic('arrow')+'</a></section>');
}
document.addEventListener('click',function(e){if(e.target.closest('.skip')){e.preventDefault();var m=$('#main');if(m)m.focus()}});

/* ===================== watch.html ===================== */
function posterUrl(title,ver){
  var c=document.createElement('canvas');c.width=640;c.height=360;var g=c.getContext('2d');if(!g)return '';
  var gr=g.createLinearGradient(0,0,640,360);gr.addColorStop(0,'#01041e');gr.addColorStop(1,'#1b25e0');g.fillStyle=gr;g.fillRect(0,0,640,360);
  g.fillStyle='rgba(204,255,0,.9)';g.beginPath();g.arc(560,70,34,0,7);g.fill();g.fillStyle='rgba(0,240,255,.35)';g.beginPath();g.arc(70,310,60,0,7);g.fill();
  g.fillStyle='#fff';g.font='600 26px system-ui,sans-serif';g.fillText(String(title).slice(0,38),32,60);g.font='500 16px system-ui,sans-serif';g.fillStyle='rgba(255,255,255,.75)';g.fillText(ver+' · örnek kare (video dosyası yok)',32,92);
  g.fillStyle='#fff';g.beginPath();g.moveTo(290,140);g.lineTo(290,230);g.lineTo(360,185);g.closePath();g.fill();return c.toDataURL('image/jpeg',.8)}
var sec=function(t){var p=String(t||'0:0').split(':').map(Number);return (p[0]||0)*60+(p[1]||0)};
var fmtTc=function(s){s=Math.max(0,Math.round(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
function pageWatch(){
  var tok=param('t')||param('token'),TAG='JS Review · Dış inceleme';
  if(!validTok(tok))return stateView(TAG,'GEÇERSİZ BAĞLANTI','Bağlantı geçersiz veya süresi dolmuş','Adreste geçerli bir token yok. Size gönderilen bağlantıyı eksiksiz açın ya da ajansla iletişime geçin.','bad');
  var D=data(),link=D.extLinks.find(function(l){return l.token===tok&&l.kind==='review'});
  if(!link)return stateView(TAG,'GEÇERSİZ BAĞLANTI','Bağlantı geçersiz veya süresi dolmuş','Bu koda ait bir inceleme bulunamadı. Bağlantı iptal edilmiş ya da yanlış yazılmış olabilir.','bad');
  if(link.revoked)return stateView(TAG,'BAĞLANTI İPTAL EDİLDİ','Bağlantı geçersiz veya süresi dolmuş','Ajans bu inceleme bağlantısını iptal etti. Yeni bir bağlantı için Jobs Studio ekibine yazın.','bad');
  if(link.expires<TODAY)return stateView(TAG,'SÜRESİ DOLDU','Bağlantı geçersiz veya süresi dolmuş','Bağlantı '+dfmt(link.expires)+' tarihinde sona erdi (7 gün geçerli). Yeni bir bağlantı için Jobs Studio ekibine yazın.','warn');
  var r=D.reviews.find(function(x){return x.id===link.ref});
  if(!r)return stateView(TAG,'İNCELEME YOK','Bağlantı geçersiz veya süresi dolmuş','Bu bağlantının işaret ettiği inceleme artık mevcut değil.','bad');
  var U={v:r.current,ph:0,playing:false,timer:0,draft:{who:'',text:'',tc:'',note:''},err:''};
  var cli=D.clients[r.client]||'Müşteri';
  function view(){
    var D2=data(),rr=D2.reviews.find(function(x){return x.id===r.id})||r;
    var ver=rr.versions.find(function(v){return v.v===U.v})||rr.versions[rr.versions.length-1];
    var dur=sec(ver.duration)||60;
    var pend=D2.q.filter(function(x){return x.review===rr.id});
    var extra=pend.filter(function(x){return x.type==='rv-comment'&&x.v===ver.v}).map(function(x){return {id:x.qid,tc:x.tc,who:x.who+' (dış)',text:x.text,internal:false,resolved:false,pending:true}});
    var comments=ver.comments.filter(function(c){return !c.internal}).concat(extra).sort(function(a,b){return sec(a.tc)-sec(b.tc)});
    var dec=pend.filter(function(x){return x.type==='rv-decision'}).pop();
    var status=dec?(dec.decision==='approved'?'Onaylandı':'Revizyon'):rr.status;
    var decided=!!dec||rr.status==='Onaylandı';
    var left=daysTo(link.expires);
    var poster=posterUrl(rr.name,ver.v);
    var body='<div class="eyebrow">JS REVIEW · DIŞ İNCELEME</div><h1>'+esc(rr.name)+'</h1>'
    +'<div class="banner scope-banner">'+ic('shield')+'<span><strong>Yalnızca bu proje:</strong> bu bağlantı yalnızca “'+esc(rr.name)+'” ('+esc(cli)+') incelemesine erişim verir. Diğer işler, dosyalar ve finans verisi görünmez. Son kullanma: '+dfmt(link.expires)+' ('+(left>0?left+' gün kaldı':'bugün')+'). İndirme yetkisi: <strong>'+(link.download?'açık':'kapalı')+'</strong>.</span></div><div class="banner demo-banner" role="note">'+ic('info')+'<span>Demo bağlantı — kimlik doğrulama değildir. Token yalnızca bu tarayıcıdaki demo veriyi açar.</span></div>'
    +'<div class="toolbar ext-bar"><label class="form-field">Sürüm<select id="w-ver" aria-label="Sürüm seç">'+rr.versions.map(function(v){return '<option value="'+esc(v.v)+'"'+(v.v===ver.v?' selected':'')+'>'+esc(v.v)+' · '+esc(v.at)+(v.v===rr.current?' (güncel)':'')+'</option>'}).join('')+'</select></label>'+badge(status,status==='Onaylandı'?'success':status==='Revizyon'?'warn':'neutral')+badge('Revize turu '+(rr.rounds.used+(dec&&dec.decision==='revision'?1:0))+' / '+rr.rounds.included+' dahil','neutral')+'</div>'
    +'<section class="content-grid"><div class="panel"><div class="video-stage"><div class="ext-video"><video id="w-video" controls preload="none" playsinline poster="'+poster+'" aria-label="'+esc(rr.name+' '+ver.v)+' önizleme"><track kind="captions" srclang="tr" label="Türkçe" src="data:text/vtt;charset=utf-8,WEBVTT"></video><span class="vf-tc" id="w-tc">'+fmtTc(U.ph)+' / '+esc(ver.duration)+'</span></div>'
    +'<div class="ext-scrub"><button type="button" class="icon-button" id="w-play" aria-label="'+(U.playing?'Duraklat':'Oynat')+' (simülasyon)">'+ic(U.playing?'pause':'play')+'</button><input type="range" id="w-range" min="0" max="'+dur+'" value="'+U.ph+'" aria-label="Zaman çizgisi" aria-valuetext="'+fmtTc(U.ph)+'"><div class="ext-marks" aria-hidden="true">'+comments.map(function(c){return '<i style="left:'+Math.min(98,Math.round(sec(c.tc)/dur*100))+'%" class="'+(c.resolved?'res':'')+'"></i>'}).join('')+'</div></div>'
    +'<p class="small muted ext-note">Demo: gerçek video dosyası yok; zaman çizgisi yorum konumlarını simüle eder.</p></div>'
    +'<div class="panel-body"><h2>Yorum ekle</h2><form id="w-comment" class="form-grid" novalidate><label class="form-field">Adınız<input name="who" required maxlength="60" autocomplete="name" value="'+esc(U.draft.who)+'"></label><label class="form-field">Zaman kodu<input name="tc" id="w-tcin" pattern="\\d\\d:\\d\\d" required value="'+esc(U.draft.tc||fmtTc(U.ph))+'" inputmode="numeric"></label><label class="form-field full">Yorum<textarea name="text" required maxlength="300" placeholder="Örn. 00:45 — geçişi biraz yavaşlatalım">'+esc(U.draft.text)+'</textarea></label><p class="ext-err" id="w-cerr" role="alert">'+esc(U.err.indexOf('c:')===0?U.err.slice(2):'')+'</p><div class="form-actions"><button class="button primary" type="submit"><span>Yorum ekle</span>'+ic('plus')+'</button></div></form></div></div>'
    +'<div class="panel"><div class="panel-header"><h2>Zaman kodlu yorumlar <span class="muted small">'+comments.length+'</span></h2></div><div class="panel-body" id="w-list">'+(comments.map(function(c){return '<div class="comment ext-comment"><small><button type="button" class="tc-link" data-tc="'+esc(c.tc)+'" aria-label="'+esc(c.tc)+' konumuna git">'+esc(c.tc)+'</button> '+esc(c.who)+' '+(c.resolved?badge('Çözüldü','success'):badge(c.pending?'Gönderildi · işlenecek':'Açık','warn'))+'</small>'+esc(c.text)+'</div>'}).join('')||'<p class="empty">Henüz yorum yok.</p>')+'</div></div></section>'
    +'<section class="panel ext-decision"><div class="panel-header"><h2>Karar</h2>'+badge(status,status==='Onaylandı'?'success':status==='Revizyon'?'warn':'neutral')+'</div><div class="panel-body">'
    +(decided?'<div class="banner">'+ic('check')+'<span>'+(dec?'Kararınız kaydedildi: <strong>'+(dec.decision==='approved'?'Onaylandı':'Revizyon istendi')+'</strong>. Not: “'+esc(dec.note)+'”. Ajans ekibi uygulamada görüp işleyecek.':'Bu sürüm onaylanmış durumda; yeni karar gerekmiyor.')+'</span></div>'
    :'<form id="w-decision" novalidate><label class="form-field full">Karar notu <span class="muted">(onayda isteğe bağlı, revizyonda zorunlu)</span><textarea name="note" id="w-note" maxlength="400" aria-describedby="w-derr" placeholder="Onay ya da revizyon gerekçenizi yazın">'+esc(U.draft.note)+'</textarea></label><p class="ext-err" id="w-derr" role="alert">'+esc(U.err.indexOf('d:')===0?U.err.slice(2):'')+'</p><div class="form-actions"><button type="button" class="button primary" data-decide="approved"><span>Onayla</span>'+ic('check')+'</button><button type="button" class="button" data-decide="revision"><span>Revizyon iste (not zorunlu)</span>'+ic('refresh')+'</button></div></form>')
    +'</div></section>';
    shell(TAG,body);
    wire(rr,ver,dur);
    U.err='';
  }
  function wire(rr,ver,dur){
    var vid=$('#w-video');
    $('#w-ver').addEventListener('change',function(e){U.v=e.target.value;U.ph=0;stop();view();$('#w-ver').focus()});
    function setPh(s,fromRange){U.ph=Math.max(0,Math.min(dur,s));var tc=$('#w-tc');if(tc)tc.textContent=fmtTc(U.ph)+' / '+ver.duration;var rg=$('#w-range');if(rg&&!fromRange){rg.value=U.ph}if(rg)rg.setAttribute('aria-valuetext',fmtTc(U.ph));var ti=$('#w-tcin');if(ti)ti.value=fmtTc(U.ph);U.draft.tc=fmtTc(U.ph);if(vid&&vid.duration)try{vid.currentTime=U.ph}catch(e){}}
    function stop(){U.playing=false;clearInterval(U.timer)}
    $('#w-range').addEventListener('input',function(e){setPh(Number(e.target.value),true)});
    $('#w-play').addEventListener('click',function(){if(U.playing){stop()}else{U.playing=true;U.timer=setInterval(function(){if(U.ph>=dur){stop();var b=$('#w-play');if(b){b.innerHTML=ic('play');b.setAttribute('aria-label','Oynat (simülasyon)')}return}setPh(U.ph+1)},1000)}var b=$('#w-play');b.innerHTML=ic(U.playing?'pause':'play');b.setAttribute('aria-label',(U.playing?'Duraklat':'Oynat')+' (simülasyon)')});
    document.querySelectorAll('.tc-link').forEach(function(b){b.addEventListener('click',function(){setPh(sec(b.dataset.tc))})});
    ['who','text'].forEach(function(n){var el=$('#w-comment [name="'+n+'"]');el.addEventListener('input',function(){U.draft[n]=el.value})});
    $('#w-comment').addEventListener('submit',function(e){e.preventDefault();var f=e.target,who=f.who.value.trim(),tc=f.tc.value.trim(),text=f.text.value.trim();
      var err=who.length<2?'Adınızı yazın.':!/^\d\d:\d\d$/.test(tc)?'Zaman kodu 00:00 biçiminde olmalı.':!text?'Yorum metni zorunlu.':'';
      if(err){$('#w-cerr').textContent=err;return}
      pushQ({type:'rv-comment',review:rr.id,v:ver.v,tc:tc,who:who,text:text,token:tok});U.draft.text='';U.draft.who=who;toast('Yorumunuz kaydedildi.');view();var l=$('#w-list');if(l)l.scrollIntoView({block:'nearest'})});
    var note=$('#w-note');if(note)note.addEventListener('input',function(){U.draft.note=note.value});
    document.querySelectorAll('[data-decide]').forEach(function(b){b.addEventListener('click',function(){var n=$('#w-note').value.trim();if(b.dataset.decide!=='approved'&&n.length<3){$('#w-derr').textContent='Revizyon için not zorunlu: ne değişmeli, kısaca yazın.';$('#w-note').focus();return}
      var who=($('#w-comment [name="who"]')||{}).value||'Dış inceleyici';pushQ({type:'rv-decision',review:rr.id,v:ver.v,decision:b.dataset.decide,note:n,who:who.trim()||'Dış inceleyici',token:tok});stop();toast(b.dataset.decide==='approved'?'Onayınız kaydedildi.':'Revizyon talebiniz kaydedildi.');view()})})
  }
  view();
}

/* ===================== apply.html ===================== */
var JD={Copywriter:['Marka sesini yazıya döken, kampanya fikirlerini metne çeviren bir copywriter arıyoruz.','Kampanya ve sosyal içerik metinleri yazmak','Brief’ten fikre, fikirden metne ekip içi sunum yapmak','Marka tonunu korumak, revizyonları hızlı kapatmak'],'Traffic Lead':['İşlerin akışını, kapasiteyi ve teslim ritmini yöneten bir traffic lead arıyoruz.','Haftalık kapasite planı ve iş dağıtımı','Müşteri talebini göreve çevirmek, SLA takibi','Ekipler arası devirleri yönetmek']};
function jdFor(p){var j=JD[p.title];return j||['Jobs Studio ekibine katılacak '+p.title+' arıyoruz. İşler gerçek, ekip küçük, sorumluluk net.','Ekibin günlük işlerine katkı vermek','Müşteri ve ekip ile şeffaf iletişim','Teslim kalitesini ve süresini korumak']}
var STAGE_MSG={'Başvuru':'Başvurunuz alındı; ekibimiz inceliyor.','Görüşme':'Görüşme aşamasındasınız; sizinle iletişime geçeceğiz.','Case':'Case / portfolyo değerlendirmesi sürüyor.','Teklif':'Teklif aşamasındasınız; İK sizinle iletişime geçecek.'};
function pageCareers(){
  var TAG='JS Hire · Kariyer';var U={view:'list',pos:'',done:null,err:'',status:null,draft:{}};
  if(param('job')){U.view='job';U.pos=param('job')}
  if(location.hash==='#durum')U.view='status';
  function view(){
    var D=data(),cp=D.careerPage,pos=D.positions.filter(function(p){return p.status==='Açık'});
    if(cp.published===false)return shell(TAG,'<section class="ext-state warn"><div class="eyebrow">KARİYER SAYFASI</div><h1>Kariyer sayfası şu an kapalı.</h1><p>Jobs Studio şu an başvuru almıyor. Daha sonra tekrar bakın.</p></section>');
    var nav='<nav class="ext-subnav" aria-label="Kariyer bölümleri"><a href="#" data-go="list" class="'+(U.view==='list'?'on':'')+'" '+(U.view==='list'?'aria-current="page"':'')+'>Açık pozisyonlar</a><a href="#durum" data-go="status" class="'+(U.view==='status'?'on':'')+'" '+(U.view==='status'?'aria-current="page"':'')+'>Başvuru durumu</a></nav>';
    var body='';
    if(U.view==='list'){
      body='<div class="eyebrow">JS HIRE · KARİYER</div><h1>'+esc(cp.title)+'</h1><p class="ext-lead">'+esc(cp.intro)+'</p>'+nav
      +'<section class="ext-jobs" aria-label="Açık pozisyonlar">'+(pos.map(function(p){return '<article class="panel ext-job"><div><h2>'+esc(p.title)+'</h2><p class="muted small">'+esc(p.team)+' · '+esc(p.type)+' · Ankara (hibrit) · ilan: '+dfmt(p.opened)+'</p></div><a class="button primary" href="apply.html?job='+esc(p.id)+'" data-job="'+esc(p.id)+'"><span>Detay ve başvuru</span>'+ic('arrow')+'</a></article>'}).join('')||'<p class="empty">Şu an açık pozisyon yok.</p>')+'</section>';
    }else if(U.view==='job'){
      var p=D.positions.find(function(x){return x.id===U.pos});
      if(!p){body=nav+'<p class="empty">Bu pozisyon bulunamadı ya da kapandı.</p>'}else{var jd=jdFor(p);
        body='<div class="eyebrow">AÇIK POZİSYON · '+esc(p.team).toUpperCase()+'</div><h1>'+esc(p.title)+'</h1>'+nav
        +'<section class="content-grid"><div class="panel"><div class="panel-body"><p>'+esc(jd[0])+'</p><h2>Sorumluluklar</h2><ul class="steps">'+jd.slice(1).map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul><div class="actions">'+badge(p.type,'neutral')+badge('Ankara · hibrit','neutral')+badge('İlan '+dfmt(p.opened),'neutral')+'</div><p><a href="#" data-go="list">← Tüm pozisyonlar</a></p></div></div>'
        +'<div class="panel"><div class="panel-header"><h2>Başvuru formu</h2></div><div class="panel-body">'+(U.done&&U.done.pos===p.id?'<div class="banner">'+ic('check')+'<span><strong>Başvurunuz alındı.</strong> Takip kodunuz: <code class="mono ext-code" id="app-code">'+esc(U.done.code)+'</code> — durum sorgulamak için e-posta adresinizle birlikte saklayın.</span></div><div class="form-actions"><a class="button" href="#durum" data-go="status"><span>Başvuru durumunu sorgula</span>'+ic('arrow')+'</a></div>'
        :'<form id="c-form" class="form-grid" novalidate><label class="form-field">Ad soyad<input name="name" required maxlength="80" autocomplete="name" value="'+esc(U.draft.name||'')+'"></label><label class="form-field">E-posta<input name="email" type="email" required maxlength="120" autocomplete="email" value="'+esc(U.draft.email||'')+'"></label><label class="form-field full">CV dosya adı<input name="cv" maxlength="120" placeholder="ad-soyad-cv.pdf" aria-describedby="c-cvh" value="'+esc(U.draft.cv||'')+'"></label><label class="form-field full">Portfolyo bağlantısı<input name="portfolio" type="url" maxlength="300" placeholder="https://portfolio.example/adiniz" value="'+esc(U.draft.portfolio||'')+'"></label><p class="small muted full" id="c-cvh">CV dosya adı ya da portfolyo linkinden en az biri zorunludur. Demo: dosya yüklenmez, yalnızca adı kaydedilir.</p><label class="form-field full">Saklama / silme talebi notu (isteğe bağlı)<textarea name="note" placeholder="Örn. verilerimin 6 ay sonra silinmesini talep ediyorum" maxlength="400">'+esc(U.draft.note||'')+'</textarea></label>'
        +'<details class="full ext-kvkk"><summary>KVKK aydınlatma metni</summary><p class="small">Jobs Studio (veri sorumlusu), başvurunuzda paylaştığınız kimlik, iletişim ve özgeçmiş verilerini yalnızca işe alım sürecinin yürütülmesi amacıyla işler. Veriler 12 ay saklanır; saklama süresi sonunda silinir ya da anonimleştirilir. KVKK m.11 kapsamındaki haklarınız için ik@jobsstudio.example adresine yazabilirsiniz. (Prototip metnidir.)</p></details>'
        +'<label class="check-line full"><input type="checkbox" name="kvkk" required> <span>KVKK aydınlatma metnini okudum, başvuru verilerimin işe alım süreci için işlenmesine <strong>açık rıza</strong> veriyorum. (zorunlu)</span></label><p class="ext-err full" id="c-err" role="alert">'+esc(U.err)+'</p><div class="form-actions full"><button class="button primary" type="submit"><span>Başvuruyu gönder</span>'+ic('arrow')+'</button></div></form>')
        +'</div></div></section>'}
    }else{
      body='<div class="eyebrow">BAŞVURU DURUMU</div><h1>Başvurunuz ne durumda?</h1>'+nav+'<section class="panel"><div class="panel-body"><form id="s-form" class="form-grid" novalidate><label class="form-field">E-posta<input name="email" type="email" required autocomplete="email"></label><label class="form-field">Takip kodu<input name="code" required maxlength="20" placeholder="APP-XXXXXX" autocapitalize="characters"></label><div class="form-actions full"><button class="button primary" type="submit"><span>Sorgula</span>'+ic('arrow')+'</button></div></form><div id="s-out" role="status" aria-live="polite">'+(U.status?statusHtml(U.status):'')+'</div></div></section>';
    }
    shell(TAG,body);wire(D);
  }
  function statusHtml(s){if(s.none)return '<div class="banner warn-banner">'+ic('info')+'<span>Eşleşen başvuru bulunamadı. E-posta ve takip kodunu kontrol edin.</span></div>';return '<div class="banner">'+ic('check')+'<span><strong>'+esc(s.title)+'</strong> · başvuru tarihi '+dfmt(s.date)+'<br>'+esc(s.msg)+'</span></div>'}
  function wire(D){
    document.querySelectorAll('[data-go]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();U.view=a.dataset.go;U.err='';history.replaceState(null,'',a.dataset.go==='status'?location.pathname+'#durum':location.pathname);view();var m=$('#main');if(m)m.focus()})});
    document.querySelectorAll('[data-job]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();U.view='job';U.pos=a.dataset.job;U.err='';history.replaceState(null,'',location.pathname+'?job='+a.dataset.job);view();var m=$('#main');if(m)m.focus()})});
    var f=$('#c-form');if(f){f.addEventListener('input',function(e){if(e.target.name&&e.target.type!=='checkbox')U.draft[e.target.name]=e.target.value});
      f.addEventListener('submit',function(e){e.preventDefault();var g=function(n){return (f[n].value||'').trim()};var name=g('name'),email=g('email'),cv=g('cv'),pf=g('portfolio');
        var err=name.length<2?'Ad soyad zorunlu.':!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)?'Geçerli bir e-posta yazın.':(!cv&&!pf)?'CV dosya adı ya da portfolyo linki gerekli.':(pf&&!safeUrl(pf))?'Portfolyo linki http:// veya https:// ile başlamalı.':!f.kvkk.checked?'Devam etmek için KVKK aydınlatma metni onayı zorunlu.':'';
        if(err){U.err=err;$('#c-err').textContent=err;if(!f.kvkk.checked&&err.indexOf('KVKK')>-1)f.kvkk.focus();return}
        var code='APP-'+Math.random().toString(36).slice(2,8).toUpperCase();
        pushQ({type:'application',id:uid('cd'),code:code,position:U.pos,name:name,email:email.toLowerCase(),cv:cv,portfolio:pf,note:g('note'),kvkk:{consent:true,at:TODAY,version:'v1'},date:TODAY});
        U.done={pos:U.pos,code:code};U.draft={};U.err='';toast('Başvurunuz alındı.');view();var c=$('#app-code');if(c){var m=$('#main');if(m)m.focus()}})}
    var s=$('#s-form');if(s)s.addEventListener('submit',function(e){e.preventDefault();var email=s.email.value.trim().toLowerCase(),code=s.code.value.trim().toUpperCase();var D2=data();
      var c=D2.candidates.find(function(x){return x.appToken&&x.appToken.toUpperCase()===code&&String(x.email||'').toLowerCase()===email});
      var q=D2.q.find(function(x){return x.type==='application'&&x.code===code&&x.email===email});
      U.status=c?{title:(D2.positions.find(function(p){return p.id===c.position})||{}).title||'Başvuru',date:c.appliedAt||TODAY,msg:STAGE_MSG[c.stage]||('Aşama: '+c.stage)}:q?{title:(D2.positions.find(function(p){return p.id===q.position})||{}).title||'Başvuru',date:q.date,msg:'Başvurunuz alındı; ajansa iletildi ve sırada.'}:{none:true};
      $('#s-out').innerHTML=statusHtml(U.status)})
  }
  window.addEventListener('hashchange',function(){if(location.hash==='#durum')U.view='status';else if(param('job')){U.view='job';U.pos=param('job')}else U.view='list';view()});
  view();
}

/* ===================== portal.html ===================== */
function pagePortal(){
  var tok=param('token'),TAG='JS Client Portal · Sihirli bağlantı';
  if(!validTok(tok))return stateView(TAG,'GEÇERSİZ BAĞLANTI','Bu bağlantı tanınmıyor.','Adreste geçerli bir token yok. E-postadaki bağlantıyı eksiksiz açın.','bad');
  var D=data(),link=D.extLinks.find(function(l){return l.token===tok&&l.kind==='portal'});
  if(!link)return stateView(TAG,'GEÇERSİZ BAĞLANTI','Bu bağlantı tanınmıyor.','Bu koda ait bir portal erişimi yok. Yeni bir giriş bağlantısı isteyin.','bad');
  if(link.revoked)return stateView(TAG,'BAĞLANTI İPTAL EDİLDİ','Erişim kapatıldı.','Bu giriş bağlantısı iptal edildi.','bad');
  if(link.expires<TODAY)return stateView(TAG,'SÜRESİ DOLDU','Giriş bağlantısının süresi doldu.','Yeni bir sihirli bağlantı için ajansla iletişime geçin.','warn');
  var s=D.s,id=link.ref,name=D.clients[id]||'Anova';
  var projects=(s.projects||[]).filter(function(p){return p.client===id&&p.client_visible!==false});
  var tasks=(s.tasks||[]).filter(function(t){return t.client_visible!==false&&projects.some(function(p){return p.id===t.project})&&!t.done&&(D.fromState?t.client_visible:true)});
  var pct=function(p){if(p.pct!=null)return p.pct;if(p.status==='Tamamlandı')return 100;var ts=(s.tasks||[]).filter(function(t){return t.project===p.id});return ts.length?Math.round(ts.filter(function(t){return t.done}).length/ts.length*100):0};
  var apps=(s.approvals||[]).filter(function(a){return a.kind?a.kind==='Müşteri kararı'&&projects.some(function(p){return p.id===a.project}):true});
  var pending=apps.filter(function(a){return a.status==='Bekliyor'});
  var files=(s.assets||[]).filter(function(a){return a.client?a.client===id&&['Onaylı','Arşiv'].indexOf(a.status)>-1:a.status==='Onaylı'});
  var inv=(s.invoices||[]).filter(function(i){return i.client?i.client===id:true});
  var mask=function(e){e=String(e||'');var i=e.indexOf('@');return i>1?e[0]+'•••'+e.slice(i):e};
  var money=function(n){return Math.round(n||0).toLocaleString('tr-TR')+' ₺'};
  var met=function(l,v,n){return '<div class="metric"><div class="metric-top">'+esc(l)+'</div><div class="metric-value">'+esc(v)+'</div><div class="metric-note">'+esc(n)+'</div></div>'};
  var body='<div class="eyebrow">JS CLIENT PORTAL · '+esc(name).toUpperCase()+'</div><h1>Projem ne durumda?</h1>'
  +'<div class="banner scope-banner">'+ic('shield')+'<span><strong>Sihirli bağlantı doğrulandı</strong> ('+esc(mask(link.email))+'). Bu sayfa yalnızca '+esc(name)+' için özet gösterir; geçerlilik: '+dfmt(link.expires)+'. Karar vermek ve dosya indirmek için uygulamada oturum açın.</span></div>'
  +'<div class="form-actions ext-cta"><a class="button primary" id="p-open" href="index.html?as=client#portal"><span>Uygulamada aç</span>'+ic('arrow')+'</a><span class="small muted">Demo: Client Admin · '+esc(name)+' rolüyle giriş yapar (kimlik doğrulama değildir).</span></div>'
  +'<section class="metrics">'+met('Açık projeler',projects.filter(function(p){return p.status!=='Tamamlandı'}).length,'')+met('Açık işler',tasks.length,'size görünür görevler')+met('Onay bekleyen',pending.length,'Müşteri kararı')+met('Teslimler',files.length,'onaylı dosya')+'</section>'
  +'<section class="content-grid"><div class="panel"><div class="panel-header"><h2>Projeler</h2></div><div class="panel-body">'+(projects.map(function(p){var v=pct(p);return '<div class="project-row ext-prow"><div class="project-info"><strong>'+esc(p.name)+'</strong><small>'+esc(name)+'</small></div>'+badge(p.status)+'<div class="project-progress"><small><span>İlerleme</span><span>%'+v+'</span></small><div class="progress" role="img" aria-label="Yüzde '+v+' tamamlandı"><span style="width:'+v+'%"></span></div></div></div>'}).join('')||'<p class="empty">Proje yok.</p>')+'</div></div>'
  +'<div class="panel"><div class="panel-header"><h2>Açık işler</h2></div><div class="panel-body">'+(tasks.map(function(t){return '<div class="session-row"><div>'+esc(t.name)+'<small>'+esc(t.date||'')+' · '+esc(t.stage||'')+'</small></div></div>'}).join('')||'<p class="empty">Açık iş yok.</p>')+'</div></div></section>'
  +'<section class="content-grid"><div class="panel"><div class="panel-header"><h2>Onay bekleyenler</h2></div><div class="panel-body">'+(pending.map(function(a){return '<div class="session-row"><div>'+esc(a.name)+'<small>'+esc(a.desc||'')+'</small></div>'+badge(a.status,'warn')+'</div>'}).join('')||'<p class="empty">Bekleyen karar yok.</p>')+'</div></div>'
  +'<div class="panel"><div class="panel-header"><h2>Onaylı teslimler & faturalar</h2></div><div class="panel-body">'+(files.map(function(a){return '<div class="session-row"><div>'+esc(a.name)+'<small>'+esc(a.type||'')+'</small></div>'+badge('Onaylı','success')+'</div>'}).join(''))+(inv.map(function(i){return '<div class="session-row"><div>'+esc(i.id)+'<small>'+dfmt(i.due)+' vade · '+money(i.amount)+'</small></div>'+badge(i.status)+'</div>'}).join(''))+'</div></div></section>';
  shell(TAG,body);
}

/* ===================== survey.html (v0.8) ===================== */
var SV_DEF={csat:['Teslim edilen işten ne kadar memnunsunuz?','Eklemek istediğiniz bir yorum var mı?'],nps:['Jobs Studio’yu bir meslektaşınıza tavsiye etme olasılığınız nedir?','Puanınızın nedeni nedir?'],pulse:['İş yükümü sürdürülebilir buluyorum.','Ekibimle iletişimden memnunum.','Yöneticimden yeterli geri bildirim alıyorum.','Burada öğrenmeye ve gelişmeye devam ediyorum.','Jobs Studio’yu iyi bir işyeri olarak tavsiye ederim.']};
function pageSurvey(){
  var tok=param('s')||param('t'),TAG='Memnuniyet anketi';
  var bad=function(k,t,m,c){return stateView(TAG,k,t,m,c||'bad')};
  if(!validTok(tok))return bad('GEÇERSİZ BAĞLANTI','Bağlantı geçersiz veya süresi dolmuş','Adreste geçerli bir anket kodu yok. Size gönderilen bağlantıyı eksiksiz açın.');
  var st=readState(),list=(st&&Array.isArray(st.surveyReq)&&st.surveyReq.length)?st.surveyReq:JSE.SURVEYS;
  var req=list.find(function(x){return x.token===tok});
  if(!req)return bad('GEÇERSİZ BAĞLANTI','Bağlantı geçersiz veya süresi dolmuş','Bu koda ait bir anket bulunamadı.');
  var kind=req.kind,done=false;
  try{done=kind!=='pulse'&&(req.status==='Yanıtlandı'||localStorage.getItem('js-survey-done-'+tok)||readQ().some(function(q){return q.type==='survey-response'&&q.token===tok}))}catch(e){}
  if(done)return bad('TEŞEKKÜRLER','Bu anket zaten yanıtlandı','Yanıtınız kaydedildi. Aynı bağlantıyla ikinci kez yanıt verilemez.','warn');
  var qs=((st&&st.surveyTemplates||[]).find(function(t){return t.id===kind})||{}).questions||SV_DEF[kind];
  var name=(st&&st.clients||[]).find(function(c){return c.id===req.brand});
  var scale=function(nm,from,to,lo,hi){var o='';for(var i=from;i<=to;i++)o+='<label class="sv-opt"><input type="radio" name="'+nm+'" value="'+i+'" required><span>'+i+'</span></label>';return '<div class="sv-scale" role="radiogroup" aria-label="'+esc(nm)+'">'+o+'</div><div class="sv-ends"><small>'+esc(lo)+'</small><small>'+esc(hi)+'</small></div>'};
  var body='<div class="eyebrow">'+(kind==='pulse'?'EKİP NABZI · ANONİM':kind==='nps'?'TAVSİYE ANKETİ (NPS)':'MEMNUNİYET ANKETİ (CSAT)')+'</div><h1>'+esc(req.title||'Anket')+'</h1><p class="ext-lead">'+(kind==='pulse'?'5 kısa soru. Adınız, e-postanız ve kimliğiniz kaydedilmez; sonuçlar yalnızca en az 5 yanıt olduğunda toplu gösterilir.':'Yanıtınız Jobs Studio ekibine iletilir ve hesap sağlığı skoruna yansır.')+'</p><div class="banner">'+ic('info')+'<span>Demo bağlantı — kimlik doğrulama değildir.'+(kind==='pulse'?' Anonimlik eşiği: 5 yanıt.':'')+'</span></div><form id="sv-form" class="panel" style="padding:20px">';
  if(kind==='pulse'){qs.slice(0,5).forEach(function(q,i){body+='<fieldset class="sv-q"><legend>'+(i+1)+'. '+esc(q)+'</legend>'+scale('q'+i,1,5,'Hiç katılmıyorum','Tamamen katılıyorum')+'</fieldset>'})}
  else{body+='<fieldset class="sv-q"><legend>'+esc(qs[0])+'</legend>'+(kind==='nps'?scale('score',0,10,'Hiç olası değil','Kesinlikle'):scale('score',1,5,'Çok memnuniyetsizim','Çok memnunum'))+'</fieldset>'}
  if(kind!=='pulse')body+='<label class="form-field full">'+esc(qs[1]||'Yorum')+'<textarea name="comment" maxlength="500"></textarea></label><label class="form-field">Adınız (isteğe bağlı)<input name="who" maxlength="60" placeholder="'+esc(name?name.name+' ekibi':'')+'"></label>';
  else body+='<label class="form-field full">Eklemek istediğin bir şey var mı? (isteğe bağlı, anonim)<textarea name="comment" maxlength="300"></textarea></label>';
  body+='<p id="sv-err" class="ext-err" role="alert"></p><div class="form-actions"><button class="button primary" type="submit"><span>Yanıtı gönder</span>'+ic('check')+'</button></div></form>';
  shell(TAG,body);
  $('#sv-form').addEventListener('submit',function(e){e.preventDefault();var f=e.target,fd=new FormData(f),it={type:'survey-response',token:tok,kind:kind,brand:req.brand||'',comment:String(fd.get('comment')||'').trim().slice(0,500)};
    if(kind==='pulse'){var a=[];for(var i=0;i<5;i++){var v=fd.get('q'+i);if(v==null){$('#sv-err').textContent='Lütfen 5 soruyu da yanıtlayın.';return}a.push(Number(v))}it.answers=a}
    else{var sc=fd.get('score');if(sc==null){$('#sv-err').textContent='Lütfen bir puan seçin.';return}it.score=Number(sc);it.who=String(fd.get('who')||'').trim().slice(0,60)}
    pushQ(it);try{if(kind!=='pulse')localStorage.setItem('js-survey-done-'+tok,'1')}catch(x){}
    $('#main').innerHTML='<section class="ext-state"><div class="eyebrow">TEŞEKKÜRLER</div><h1 id="sv-thanks">Yanıtınız kaydedildi</h1><p>'+(kind==='pulse'?'Anonim yanıtınız toplu sonuca eklenecek.':'Geri bildiriminiz Jobs Studio ekibine iletildi.')+'</p><a class="button primary" href="index.html"><span>JS Ecosystem’e git</span>'+ic('arrow')+'</a></section>'})
}

var P=document.body.dataset.page;
document.addEventListener('DOMContentLoaded',function(){try{if(P==='watch')pageWatch();else if(P==='careers'||P==='apply')pageCareers();else if(P==='portal')pagePortal();else if(P==='survey')pageSurvey()}catch(e){console.error(e);var a=document.getElementById('ext-app');if(a)a.textContent='Sayfa yüklenemedi.'}});
})();
