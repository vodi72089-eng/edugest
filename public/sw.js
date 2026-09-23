/* EduGest Service Worker — Web Push notifications
   Reçoit les push du serveur (VAPID + web-push) et les affiche même quand
   l'app est fermée.

   Couches identifiées (ne pas mélanger) :
     - B : notification PUSH navigateur (ce fichier, via showNotification)
     - A : notification en base (API /api/notifications — topbar in-app)
     - E : son in-app EduGest (notification-sound.ts, côté page — PAS ici :
           un Service Worker ne peut pas jouer l'AudioContext de l'app)
   Le son d'une notification système Web est régi par l'OS/navigateur :
   EduGest ne prétend pas le remplacer — l'app joue SON son in-app quand
   l'utilisateur est actif (comportement cohérent web + desktop). */

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
  // `silent` (payload serveur) : l'utilisateur a désactivé le son → on
  // supprime vibration ET renotification. NB : les navigateurs jouent
  // (ou non) leur propre son système pour les push — non contrôlable.
  const silent = data.silent === true;

  const options = {
    body: data.body || data.message || 'Vous avez une nouvelle notification',
    icon: data.icon || '/edugest-logo-mark.png',
    badge: data.badge || '/edugest-logo-mark.png',
    tag: data.tag || 'edugest-notification',
    renotify: !silent,
    vibrate: silent ? [] : [100, 50, 100],
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1) Une fenêtre EduGest est déjà ouverte → FOCUS + NAVIGATION vers
      //    l'URL de la notification (client.navigate) — pas un simple focus.
      for (const client of clientList) {
        if ('focus' in client) {
          const nav = (async () => {
            try {
              if ('navigate' in client && url && !url.startsWith('#')) {
                await client.navigate(url);
              }
            } catch (e) {
              // navigate() peut échouer (origine croisée, URL relative hors
              // scope) : la fenêtre reste simplement sur sa vue actuelle.
            }
            try { await client.focus(); } catch (e) {}
          })();
          return nav;
        }
      }
      // 2) Aucune fenêtre → ouvrir la bonne URL directement.
      return self.clients.openWindow(url);
    })
  );
});
