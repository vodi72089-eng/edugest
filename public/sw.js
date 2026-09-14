/* EduGest Service Worker — Web Push notifications
   Receives push messages from the server (via VAPID + web-push) and shows
   them even when the app is closed. Clicking a notification focuses the app. */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: 'EduGest',
      body: (event.data && event.data.text()) || 'Vous avez une nouvelle notification',
    };
  }

  const title = data.title || 'EduGest';
  const options = {
    body: data.body || data.message || 'Vous avez une nouvelle notification',
    icon: data.icon || '/edugest-logo-new.png',
    badge: data.badge || '/edugest-logo-new.png',
    tag: data.tag || 'edugest-notification',
    renotify: true,
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
