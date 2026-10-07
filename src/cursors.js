(() => {
    const board = document.getElementById('vis-container');
    const whiteboard = document.getElementById('whiteboard');
    const layer = document.createElement('div');
    layer.id = 'collaborator-cursors';
    layer.setAttribute('data-visconnect-local', '');
    layer.setAttribute('aria-hidden', 'true');
    whiteboard.appendChild(layer);
    const cursors = new Map();
    let pointer = null;
    let timer;
    let visible = false;
    let lastPublish = -Infinity;

    function render(id, cursor) {
        const profile = window.commentIdentity?.profileFor(id);
        if (!profile) { cursor.element.hidden = true; return; }
        const rect = board.getBoundingClientRect();
        const overlay = layer.getBoundingClientRect();
        const x = cursor.x - board.scrollLeft + board.clientLeft;
        const y = cursor.y - board.scrollTop + board.clientTop;
        cursor.element.hidden = x < 0 || y < 0 || x >= board.clientWidth || y >= board.clientHeight;
        cursor.element.style.transform = `translate(${x + rect.left - overlay.left}px, ${y + rect.top - overlay.top}px)`;
        cursor.element.style.color = profileColor(profile.username);
        cursor.element.style.setProperty('--cursor-color', profileColor(profile.username));
        cursor.label.textContent = profile.username;
    }
    function remove(id) {
        cursors.get(id)?.element.remove();
        cursors.delete(id);
    }
    function receive(message) {
        const id = message.sender;
        if (!id || id === window.vc.ownId || !window.vc.connectedIds?.().includes(id)) return;
        if (message.visible === false) { remove(id); return; }
        if (message.visible !== true || !Number.isFinite(message.x) || !Number.isFinite(message.y) ||
            message.x < 0 || message.y < 0) return;
        let cursor = cursors.get(id);
        if (!cursor) {
            const element = document.createElement('div');
            element.className = 'collaborator-cursor';
            element.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 21 11.4 14 14 11.4 21Z"/></svg>';
            const label = document.createElement('span');
            element.appendChild(label);
            layer.appendChild(element);
            cursor = { element, label };
            cursors.set(id, cursor);
        }
        Object.assign(cursor, { x: message.x, y: message.y, updated: Date.now() });
        render(id, cursor);
    }
    function publish() {
        timer = null;
        if (!pointer || !window.commentIdentity?.current || document.hidden) return;
        const rect = board.getBoundingClientRect();
        const x = pointer.x - rect.left - board.clientLeft + board.scrollLeft;
        const y = pointer.y - rect.top - board.clientTop + board.scrollTop;
        if (x < board.scrollLeft || y < board.scrollTop || x >= board.scrollLeft + board.clientWidth || y >= board.scrollTop + board.clientHeight) {
            hide();
            return;
        }
        lastPublish = Date.now();
        visible = window.vc.sendCursorMessage?.({ visible: true, x, y }) || false;
    }
    function schedule() {
        if (!timer) timer = setTimeout(publish, Math.max(0, 1000 / 30 - (Date.now() - lastPublish)));
    }
    function hide() {
        pointer = null;
        clearTimeout(timer);
        timer = null;
        if (visible) window.vc.sendCursorMessage?.({ visible: false });
        visible = false;
    }
    document.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch' || event.target.closest('.toolkit-dock, .comment-popover, dialog, [role="dialog"], #headline')) {
            hide();
            return;
        }
        pointer = { x: event.clientX, y: event.clientY };
        schedule();
    });
    board.addEventListener('pointerleave', hide);
    board.addEventListener('scroll', () => { cursors.forEach((cursor, id) => render(id, cursor)); schedule(); });
    window.addEventListener('resize', () => { cursors.forEach((cursor, id) => render(id, cursor)); schedule(); });
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
    window.addEventListener('vischatter-cursor-message', event => receive(event.detail));
    window.addEventListener('vischatter-profiles-changed', () => {
        cursors.forEach((cursor, id) => render(id, cursor));
        schedule();
    });
    window.addEventListener('visconnect-connections-changed', () => {
        const connected = window.vc.connectedIds?.() || [];
        for (const id of cursors.keys()) if (!connected.includes(id)) remove(id);
        schedule();
    });
    // Stationary pointers renew presence; stale or unexpectedly disconnected cursors disappear.
    setInterval(() => {
        schedule();
        for (const [id, cursor] of cursors) if (Date.now() - cursor.updated > 15000) remove(id);
    }, 5000);
})();
