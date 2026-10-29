// 인터넷 없이 Prism 웹을 열었을 때 브라우저 오류 화면 대신 Prism 의 연결 안내를 보인다 (v3.122).
// 페이지 이동(navigate) 요청만 본다: 늘 네트워크 먼저, 실패할 때만 담아 둔 안내 페이지. 다른 파일은 손대지 않는다 (예전 판이 남는 일 없게).
const CACHE = 'prism-offline-v1';
const PAGE = '/offline';
const FILES = [PAGE, '/brand/prism-128.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.mode === 'navigate') { e.respondWith(fetch(r).catch(() => caches.match(PAGE))); return; }
  // 안내 페이지가 쓰는 로고만 담아 둔 것으로
  if (new URL(r.url).pathname === '/brand/prism-128.png') e.respondWith(fetch(r).catch(() => caches.match(r)));
});
