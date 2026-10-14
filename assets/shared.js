/* JS Ecosystem · ortak durum okuyucu (v0.7). Hem ana uygulama hem dış sayfalar (watch.html, apply.html, portal.html) kullanır.
   Dış sayfalar ana durumu (localStorage 'js-ecosystem-v7') yalnızca OKUR; yazma 'js-ecosystem-v7-queue' kuyruğuna gider,
   ana uygulama açılışta ve 'storage' olayında kuyruğu içe alır. Demo bağlantı — kimlik doğrulama değildir. */
(function(){
'use strict';
var KEY='js-ecosystem-v7',QKEY='js-ecosystem-v7-queue';
var uid=function(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,5)};
function readState(){try{var s=JSON.parse(localStorage.getItem(KEY));if(s&&s.version===7&&Array.isArray(s.reviews))return s}catch(e){}return null}
function readQ(){try{var q=JSON.parse(localStorage.getItem(QKEY));return Array.isArray(q)?q:[]}catch(e){return []}}
function writeQ(q){try{localStorage.setItem(QKEY,JSON.stringify(q))}catch(e){}}
function pushQ(item){var q=readQ();item.qid=uid('q');item.at=new Date().toISOString();item.ingested=false;q.push(item);writeQ(q);return item}
/* tohum: Wellana filmi v3 (inceleme rv3) + iki demo token */
var RV3={id:'rv3',asset:'',name:'Wellana · Sonbahar kampanya filmi',client:'c_wellana',project:'p1',current:'v3',status:'İncelemede',rounds:{used:0,included:2},externalLink:'',versions:[
 {v:'v1',at:'02.10 15:00',duration:'00:45',comments:[{id:'w1',tc:'00:09',who:'Deniz K.',text:'Açılış sahnesi çok karanlık; ürün görünmüyor.',internal:false,resolved:true}]},
 {v:'v2',at:'07.10 12:40',duration:'00:45',comments:[{id:'w2',tc:'00:22',who:'SO',text:'Ses mix: müzik konuşmayı eziyor.',internal:true,resolved:true},{id:'w3',tc:'00:31',who:'Deniz K.',text:'Slogan kartı 1 sn daha uzun kalsın.',internal:false,resolved:true}]},
 {v:'v3',at:'12.10 18:20',duration:'00:44',comments:[{id:'w4',tc:'00:14',who:'Deniz K.',text:'Renk düzeltmesi artık iyi, onaya yakın.',internal:false,resolved:false},{id:'w5',tc:'00:38',who:'OE',text:'Final kart: yasal metin eklenecek.',internal:true,resolved:false}]}]};
var LINKS=[
 {token:'wellana-v03',kind:'review',ref:'rv3',created:'2026-10-12',expires:'2026-10-21',revoked:false,download:false},
 {token:'anova-v02',kind:'review',ref:'rv1',created:'2026-10-13',expires:'2026-10-20',revoked:false,download:true},
 {token:'eski0001',kind:'review',ref:'rv1',created:'2026-09-30',expires:'2026-10-07',revoked:false,download:false},
 {token:'anova-demo',kind:'portal',ref:'c_anova',created:'2026-10-14',expires:'2026-10-21',revoked:false,email:'marketing@anova.example'}];
window.JSE={KEY:KEY,QKEY:QKEY,TODAY:'2026-10-14',uid:uid,readState:readState,readQ:readQ,writeQ:writeQ,pushQ:pushQ,RV3:RV3,LINKS:LINKS};
})();
