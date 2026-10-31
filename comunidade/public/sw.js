const CACHE = 'comunidade-offline-v4';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html'))); self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('comunidade-offline-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname === '/reset-password' || url.pathname === '/callback' || url.pathname.includes('chatgpt')) return;
  const shell = request.mode === 'navigate' && ['/app', '/gestao'].includes(url.pathname);
  const asset = ['script', 'style', 'font', 'image'].includes(request.destination) || url.pathname.startsWith('/bible/') || url.pathname === '/manifest.webmanifest';
  if (!shell && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE), key = shell ? url.pathname : request;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(key, response.clone());
      return response;
    } catch {
      const cached = await cache.match(key);
      if (cached) return cached;
      if (shell) return cache.match('/offline.html');
      return Response.error();
    }
  })());
});
self.addEventListener('push', event => {
  let payload={};
  try { payload=event.data?.json() ?? {}; } catch { payload={body:event.data?.text() ?? ''}; }
  const title=payload.title || 'ICABV';
  const options={body:payload.body || 'Você tem uma nova notificação.',icon:'/logo-icabv.png',badge:'/logo-icabv.png',tag:payload.tag || payload.key || 'icabv-notification',data:{url:payload.url || (payload.tab?`/app?tab=${encodeURIComponent(payload.tab)}${payload.section?`&section=${encodeURIComponent(payload.section)}`:''}`:'/app')}};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target=new URL(event.notification.data?.url || '/app',self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){existing.navigate(target);return existing.focus();}
    return self.clients.openWindow(target);
  }));
});
