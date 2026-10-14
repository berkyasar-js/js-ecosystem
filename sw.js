/* JS Ecosystem · service worker (v0.6). Statik varlıklar cache-first, index.html network-first. Veri yalnızca cihazdadır; uzak istek yoktur. */
const CACHE='jse-v6';
const CORE=['./','./index.html','./manifest.webmanifest','./assets/styles.css','./assets/v6.css','./assets/glass-gradient-update.css','./assets/flow.css','./assets/fonts.css','./assets/app.js','./assets/modules-ops.js','./assets/modules-media.js','./assets/modules-people.js','./assets/modules-hr.js','./assets/modules-ext.js','./assets/modules-flow.js','./assets/modules-ext2.js','./assets/modules-ext3.js','./assets/orbit-studio.svg','./assets/team-portraits.jpg','./assets/fonts/PlusJakartaSans-Regular.ttf','./assets/fonts/PlusJakartaSans-Medium.ttf','./assets/fonts/PlusJakartaSans-SemiBold.ttf','./assets/fonts/PlusJakartaSans-Bold.ttf','./assets/favicon.svg','./assets/jobs-logo-light.svg','./assets/jobs-logo-dark.svg','./assets/icons/app-icon-192.png','./assets/icons/app-icon-512.png','./assets/icons/app-icon-180.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(CORE.map(u=>c.add(u)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==self.location.origin)return;
  const isPage=r.mode==='navigate'||u.pathname.endsWith('/')||u.pathname.endsWith('/index.html');
  if(isPage){e.respondWith(fetch(r).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));return res}).catch(()=>caches.match('./index.html')));return}
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy))}return res})));
});
