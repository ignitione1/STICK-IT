self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const storedValue = (storeName, key, value) => new Promise((resolve, reject) => {
  const open = indexedDB.open('stickit-push', 2);
  open.onupgradeneeded = () => {
    if (!open.result.objectStoreNames.contains('preferences')) open.result.createObjectStore('preferences');
  };
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const transaction = db.transaction(storeName, value === undefined ? 'readonly' : 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = value === undefined ? store.get(key) : store.put(value, key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  };
});
const soundPreference = (employeeId, value) => storedValue('preferences', employeeId, value);
self.addEventListener('message', event => {
  if (event.data?.type === 'stickit-sound-preference' && typeof event.data.employeeId === 'string' && typeof event.data.enabled === 'boolean') {
    event.waitUntil(soundPreference(event.data.employeeId, event.data.enabled));
  }
});
const clientsForAccount = async employeeId => {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const matches = await Promise.all(windows.map(client => new Promise(resolve => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => resolve(null), 300);
    channel.port1.onmessage = event => { clearTimeout(timeout); resolve(event.data?.employeeId === employeeId ? { client, canPlay: event.data.canPlay === true } : null); };
    client.postMessage({ type: 'stickit-identify' }, [channel.port2]);
  })));
  return matches.filter(Boolean);
};
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data.json(); } catch { return; }
    if (!data || typeof data.id !== 'string' || typeof data.employeeId !== 'string') return;
    const clients = await clientsForAccount(data.employeeId);
    const target = clients.find(item => item.canPlay && item.client.visibilityState === 'visible') || clients.find(item => item.canPlay);
    if (target) target.client.postMessage({ type: 'stickit-push', id: data.id });
    const soundEnabled = await soundPreference(data.employeeId).catch(() => true);
    await self.registration.showNotification('Stick-it', {
      body: data.reply ? 'Вам ответили на записку' : 'Вам оставили записку',
      tag: 'stickit-' + data.id,
      silent: !!target || soundEnabled === false,
      data: { id: data.id },
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = windows[0];
    if (target) { await target.focus(); target.postMessage({ type: 'stickit-open' }); }
    else await self.clients.openWindow('/?view=notifications');
  })());
});
