self.addEventListener('push', event => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = {};
    }
    const title =
        typeof payload.title === 'string' ?
            payload.title
        :   'Patchwork update';
    const body =
        typeof payload.body === 'string' ?
            payload.body
        :   'Open Patchwork to review this update.';
    const actionUrl =
        typeof payload.actionUrl === 'string' &&
        payload.actionUrl.startsWith('/') ?
            payload.actionUrl
        :   '/notifications';
    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            data: { actionUrl },
            tag: 'patchwork-notification',
            renotify: false,
        }),
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const actionUrl =
        event.notification.data &&
        typeof event.notification.data.actionUrl === 'string' ?
            event.notification.data.actionUrl
        :   '/notifications';
    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
                for (const client of clients) {
                    if ('focus' in client) {
                        client.navigate(actionUrl);
                        return client.focus();
                    }
                }
                return self.clients.openWindow(actionUrl);
            }),
    );
});
