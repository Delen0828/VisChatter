// Stable A–Z avatar colors, shared by every browser and every comment snapshot.
const PROFILE_COLORS = Object.freeze([
    '#0047ab', '#9b2c54', '#23745b', '#7950a3', '#ad491f', '#216c85',
    '#9c3535', '#596c20', '#6840b0', '#a53c78', '#246b40', '#87601f',
    '#365ba8', '#873d8c', '#14756d', '#b03f56', '#4d6590', '#88502d',
    '#5a5ba6', '#26718a', '#866125', '#a33865', '#3d7253', '#754ab0',
    '#9a4427', '#506d83'
]);

function normalizeUsername(value) { return typeof value === 'string' ? value.trim().normalize('NFC') : ''; }
function usernameError(username) {
    if (!username) return 'Enter a username.';
    if (username.length > 40) return 'Use 40 characters or fewer.';
    if (/[\p{Cc}\p{Cf}]/u.test(username)) return 'Use a username without control characters.';
    return '';
}
function profileColor(username) {
    const initial = Array.from(normalizeUsername(username).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase())[0] || 'a';
    const index = initial >= 'a' && initial <= 'z' ? initial.charCodeAt(0) - 97 : initial.codePointAt(0) % 26;
    return PROFILE_COLORS[index];
}
function createProfileAvatar(profile) {
    const avatar = document.createElement('span');
    const username = normalizeUsername(profile?.username) || 'Unknown';
    avatar.className = 'profile-avatar';
    avatar.textContent = Array.from(Array.from(username)[0].toUpperCase())[0];
    avatar.style.backgroundColor = profileColor(username);
    avatar.setAttribute('role', 'img');
    avatar.setAttribute('aria-label', username);
    avatar.title = username;
    return avatar;
}

(() => {
    const dialog = document.getElementById('username-dialog');
    if (!dialog) return;
    const input = document.getElementById('username-input');
    const error = document.getElementById('username-error');
    const submit = document.getElementById('username-submit');
    const preview = document.getElementById('username-preview');
    const ownId = window.vc.ownId;
    const leaderId = window.vc.leaderId;
    const isPresenter = ownId === leaderId;
    const serverIdentity = window.vc.identityAuthority === 'server';
    const participants = new Map();
    const decisions = new Map();
    let current = null;
    let pending = null;
    let retryTimer;
    let timeoutTimer;
    let rosterRevision = 0;

    // Reserve the presenter's default while their entry popup is still open.
    if (isPresenter) participants.set(ownId, { id: ownId, username: 'presenter' });
    input.value = isPresenter ? 'presenter' : 'audience';

    const showError = message => {
        error.textContent = message;
        error.hidden = !message;
        input.setAttribute('aria-invalid', String(!!message));
    };
    const updatePreview = () => preview.replaceChildren(createProfileAvatar({ username: input.value }));
    function stopWaiting() {
        clearTimeout(retryTimer);
        clearTimeout(timeoutTimer);
        pending = null;
        submit.disabled = false;
        input.disabled = false;
        submit.textContent = 'Join';
    }
    function complete(profile) {
        current = Object.freeze({ ...profile });
        stopWaiting();
        showError('');
        document.getElementById('current-profile').replaceChildren(createProfileAvatar(current));
        document.getElementById('current-profile').hidden = false;
        dialog.close();
        window.dispatchEvent(new CustomEvent('vischatter-profiles-changed'));
    }
    function roster() { return [...participants.values()]; }
    function send(message, recipient) { return window.vc.sendProfileMessage?.(message, recipient) || false; }
    function decide(request, actor) {
        const decisionKey = `${actor}:${request.requestId}`;
        if (decisions.has(decisionKey)) return decisions.get(decisionKey);
        const username = normalizeUsername(request.username);
        const conflict = [...participants.values()].some(profile => profile.id !== actor && profile.username.toLowerCase() === username.toLowerCase());
        const message = usernameError(username) || (conflict ? 'That username is already in use. Enter a different username.' : '');
        if (!message) {
            participants.set(actor, { id: actor, username });
            rosterRevision++;
            window.dispatchEvent(new CustomEvent('vischatter-profiles-changed'));
        }
        const result = { action: 'result', requestId: request.requestId, participantId: actor, error: message, profile: message ? null : participants.get(actor) };
        decisions.set(decisionKey, result);
        return result;
    }
    function sendPending() {
        if (!pending) return;
        if (serverIdentity) {
            if (pending.inFlight) return;
            if (!window.vc.claimUsername) { retryTimer = setTimeout(sendPending, 150); return; }
            const request = pending;
            request.inFlight = true;
            window.vc.claimUsername({ requestId: request.requestId, username: request.username }).then(result => {
                if (pending === request) receive({ ...result, sender: leaderId, serverConfirmed: true });
            }).catch(error => {
                if (pending !== request) return;
                stopWaiting();
                showError(error.name === 'AbortError' ? 'Could not reach the collaboration server. Try joining again.' : error.message);
                input.focus();
            });
            return;
        }
        send({ action: 'claim', ...pending }, leaderId);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(sendPending, 1500);
    }
    function receive(message) {
        if (serverIdentity && !message.serverConfirmed) return;
        if (isPresenter && !serverIdentity) {
            if (message.action === 'roster-request') {
                send({ action: 'roster', participants: roster(), revision: rosterRevision }, message.sender);
            } else if (message.action === 'claim' && typeof message.requestId === 'string' && message.sender) {
                const result = decide(message, message.sender);
                send({ ...result, participants: roster(), revision: rosterRevision }, message.sender);
                if (!result.error) send({ action: 'roster', participants: roster(), revision: rosterRevision });
            }
            return;
        }
        // Server rosters use the session owner ID; legacy rosters come from that owner.
        if (message.sender !== leaderId || !['result', 'roster'].includes(message.action)) return;
        if (Array.isArray(message.participants) && message.revision >= rosterRevision) {
            participants.clear();
            for (const profile of message.participants) {
                if (typeof profile.id === 'string' && !usernameError(normalizeUsername(profile.username))) participants.set(profile.id, { id: profile.id, username: normalizeUsername(profile.username) });
            }
            rosterRevision = message.revision;
            window.dispatchEvent(new CustomEvent('vischatter-profiles-changed'));
        }
        if (message.action !== 'result' || message.participantId !== ownId || message.requestId !== pending?.requestId) return;
        if (message.error) {
            stopWaiting();
            showError(message.error);
            input.focus();
            input.select();
        } else if (message.profile?.id === ownId && !usernameError(normalizeUsername(message.profile.username))) complete(message.profile);
    }
    window.commentIdentity = {
        get current() { return current; },
        profileFor(id) { return participants.get(id) || null; },
        require() {
            if (current) return true;
            if (!dialog.open) dialog.showModal();
            input.focus();
            return false;
        },
        authorFor(actor, snapshot) {
            // Saved authors survive disconnects and catch-up before the roster arrives.
            if (snapshot?.id === actor && !usernameError(normalizeUsername(snapshot.username))) return { id: actor, username: normalizeUsername(snapshot.username) };
            return participants.get(actor) || { id: actor || 'unknown', username: actor ? (actor === leaderId ? 'presenter' : 'audience') : 'Unknown' };
        }
    };
    window.addEventListener('vischatter-profile-message', event => receive(event.detail));
    const connectionChanged = () => {
        if (serverIdentity) { if (pending) sendPending(); }
        else if (isPresenter) send({ action: 'roster', participants: roster(), revision: rosterRevision });
        else {
            send({ action: 'roster-request' }, leaderId);
            if (pending) sendPending();
        }
    };
    window.addEventListener('visconnect-ready', connectionChanged);
    window.addEventListener('visconnect-connections-changed', connectionChanged);
    dialog.addEventListener('cancel', event => event.preventDefault());
    input.addEventListener('input', () => { showError(''); updatePreview(); });
    document.getElementById('username-form').addEventListener('submit', event => {
        event.preventDefault();
        if (pending) return;
        const username = normalizeUsername(input.value);
        const validation = usernameError(username);
        if (validation) { showError(validation); input.focus(); return; }
        showError('');
        const request = { requestId: crypto.randomUUID(), username };
        if (isPresenter && !serverIdentity) {
            const result = decide(request, ownId);
            if (result.error) { showError(result.error); input.focus(); input.select(); return; }
            complete(result.profile);
            send({ action: 'roster', participants: roster(), revision: rosterRevision });
        } else {
            pending = request;
            submit.disabled = true;
            input.disabled = true;
            submit.textContent = 'Joining…';
            timeoutTimer = setTimeout(() => {
                stopWaiting();
                showError(serverIdentity ? 'Could not reach the collaboration server. Try joining again.' : 'Could not confirm your username with the presenter. Try joining again.');
                input.focus();
            }, 15000);
            sendPending();
        }
    });
    updatePreview();
    dialog.showModal();
    input.focus();
    input.select();
})();
