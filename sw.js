const CACHE_NAME = 'faww-workspace-v92';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './config.js',
    './kanban.js',
    './map.js',
    './services.js',
    './main.js',
    './manifest.json',
    './로고 이미지 파일.png'
];

self.addEventListener('install', event => {
    self.skipWaiting(); // 즉시 새 버전 설치
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache); // 이전 버전 캐시 삭제
                    }
                })
            );
        }).then(() => self.clients.claim()) // 즉시 새 서비스 워커 제어권 획득
    );
});

self.addEventListener('fetch', event => {
    // 외부 도메인(네이버 지도, 파이어베이스 등)은 서비스 워커가 개입하지 않고 브라우저가 직접 처리하도록 통과(Bypass)
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => response)
            .catch(err => {
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;
                    return new Response('', { status: 404, statusText: 'Not Found' });
                });
            })
    );
});

// 푸시 알림 수신 이벤트 핸들러
self.addEventListener('push', event => {
    let data = { title: '업무 알림', message: '새로운 업무 메시지가 도착했습니다.' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: '업무 알림', message: event.data.text() };
        }
    }
    
    const options = {
        body: data.message || data.body || '',
        icon: '로고 이미지 파일.png',
        badge: '로고 이미지 파일.png',
        tag: data.id || 'default-tag',
        data: data, // 클릭 시 딥링크에 활용하기 위해 전체 데이터 전달
        vibrate: [100, 50, 100],
        actions: [
            { action: 'open', title: '열기' },
            { action: 'close', title: '닫기' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || '업무 알림', options)
    );
});

// 알림 클릭 이벤트 핸들러
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'close') {
        return;
    }
    
    const notiData = event.notification.data;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // 이미 열려 있는 앱 창이 있다면 포커싱하고 딥링크 데이터 전달
            for (const client of clientList) {
                if (client.url.includes('index.html') && 'focus' in client) {
                    client.focus();
                    if (notiData && 'postMessage' in client) {
                        client.postMessage({
                            type: 'NOTIFICATION_CLICK',
                            noti: notiData
                        });
                    }
                    return;
                }
            }
            // 열려 있는 창이 없다면 새로 열기
            if (clients.openWindow) {
                // URL에 targetId 및 link 정보를 붙여서 신규 로드 시 클라이언트가 파싱할 수 있게 함
                if (notiData && notiData.id) {
                    const query = `?notiId=${encodeURIComponent(notiData.id)}&notiLink=${encodeURIComponent(notiData.link || '')}&notiTargetId=${encodeURIComponent(notiData.targetId || '')}`;
                    return clients.openWindow('./index.html' + query);
                }
                return clients.openWindow('./index.html');
            }
        })
    );
});