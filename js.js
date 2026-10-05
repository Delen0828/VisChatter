const apiResponseDict = {};
const vlSpecDict = {};
const chartComments = {};
const chartCommentGenerations = {};
const previewedComments = {};

// Model selection, editing controls, and microphones stay local to this browser.
const modelSelect = document.getElementById('model-select');
try {
    const savedModel = localStorage.getItem('vischatter.model');
    if ([...modelSelect.options].some(option => option.value === savedModel)) modelSelect.value = savedModel;
} catch {}
modelSelect.addEventListener('change', () => {
    try { localStorage.setItem('vischatter.model', modelSelect.value); } catch {}
});

function callApi(spec, visID) { vlSpecDict[visID] = spec; }
function createBoardId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function boardEvent(type, detail) { document.body.dispatchEvent(new CustomEvent(type, { detail })); }
function notifyBoard(text) {
    const notice = document.getElementById('board-notice');
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(notifyBoard.timer);
    notifyBoard.timer = setTimeout(() => { notice.hidden = true; }, 6000);
}
function updateBoardState() {
    const count = document.querySelectorAll('.draggable-chart').length;
    document.getElementById('empty-board').hidden = count > 0;
    document.getElementById('chart-count').textContent = `${count} chart${count === 1 ? '' : 's'}`;
}
function openAddDialog() {
    closeChartMenu();
    document.getElementById('add-error').hidden = true;
    document.getElementById('add-dialog').showModal();
    document.getElementById('input').focus();
}
document.getElementById('addButton').addEventListener('click', openAddDialog);
document.getElementById('empty-add-button').addEventListener('click', openAddDialog);
document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog).close());
});
document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
});

// Comments are stored by submission timestamp, independent of API completion order.
function sortedChartComments(visID) {
    return [...(chartComments[visID] || [])].sort((a, b) => b.time - a.time || b.id.localeCompare(a.id));
}
function latestChartAnnotation(visID) {
    return sortedChartComments(visID).find(comment => comment.annotatedSpec);
}
function defaultChartSpec(visID) {
    return latestChartAnnotation(visID)?.annotatedSpec || originalVisualizations[visID];
}
function showDefaultAnnotation(visID) {
    delete previewedComments[visID];
    const spec = defaultChartSpec(visID);
    if (spec) reRenderVegaLite(spec, visID);
}
function previewComment(visID, comment) {
    previewedComments[visID] = comment.id;
    reRenderVegaLite(comment.annotatedSpec || defaultChartSpec(visID), visID);
}
function closeCommentList(chart) {
    const popover = chart.querySelector('.comment-popover');
    if (!popover || popover.hidden) return;
    popover.hidden = true;
    chart.querySelector('.comment-bubble').setAttribute('aria-expanded', 'false');
    showDefaultAnnotation(chart.id);
}
function toggleCommentList(chart) {
    const popover = chart.querySelector('.comment-popover');
    const shouldOpen = popover.hidden;
    document.querySelectorAll('.draggable-chart').forEach(closeCommentList);
    closeChartMenu();
    if (shouldOpen) {
        popover.hidden = false;
        chart.querySelector('.comment-bubble').setAttribute('aria-expanded', 'true');
    }
}
function renderChartComments(visID) {
    const chart = document.getElementById(visID);
    if (!chart) return;
    const comments = sortedChartComments(visID);
    const bubble = chart.querySelector('.comment-bubble');
    bubble.hidden = comments.length === 0;
    bubble.textContent = `+${comments.length}`;
    bubble.setAttribute('aria-label', `Show ${comments.length} comment${comments.length === 1 ? '' : 's'}`);
    const popover = chart.querySelector('.comment-popover');
    if (!comments.length) { popover.hidden = true; bubble.setAttribute('aria-expanded', 'false'); }
    const list = chart.querySelector('.comment-list');
    list.replaceChildren();
    const latest = latestChartAnnotation(visID);
    for (const comment of comments) {
        const item = document.createElement('li');
        item.className = 'comment-item';
        item.tabIndex = 0;
        item.dataset.commentId = comment.id;
        const text = document.createElement('p');
        text.className = 'comment-text';
        text.textContent = comment.text;
        const meta = document.createElement('div');
        meta.className = 'comment-meta';
        const time = document.createElement('time');
        time.dateTime = new Date(comment.time).toISOString();
        time.textContent = new Date(comment.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        meta.appendChild(time);
        if (comment.status === 'pending' || comment.id === latest?.id) {
            const label = document.createElement('span');
            label.className = 'latest-label';
            label.textContent = comment.status === 'pending' ? 'Annotating…' : 'Latest annotation';
            meta.appendChild(label);
        }
        item.append(text, meta);
        if (comment.error) {
            const error = document.createElement('p');
            error.className = 'comment-error';
            error.textContent = comment.error;
            item.appendChild(error);
        }
        item.addEventListener('mouseenter', () => previewComment(visID, comment));
        item.addEventListener('mouseleave', () => showDefaultAnnotation(visID));
        item.addEventListener('focus', () => previewComment(visID, comment));
        item.addEventListener('blur', () => showDefaultAnnotation(visID));
        list.appendChild(item);
    }
}
document.body.addEventListener('chart-comment', event => {
    const comment = event.detail;
    if (!document.getElementById(comment.visId)) return;
    // Clearing invalidates pending results, including results arriving from peers.
    if (comment.generation !== (chartCommentGenerations[comment.visId] || 0)) return;
    const comments = chartComments[comment.visId] ||= [];
    const existing = comments.findIndex(entry => entry.id === comment.id);
    if (existing >= 0) {
        // A replayed pending event cannot overwrite a completed annotation.
        if (comments[existing].status !== 'pending' && comment.status === 'pending') return;
        comments[existing] = comment;
    } else comments.push(comment);
    const previewId = previewedComments[comment.visId];
    renderChartComments(comment.visId);
    const preview = comments.find(entry => entry.id === previewId);
    if (preview?.annotatedSpec) previewComment(comment.visId, preview);
    else showDefaultAnnotation(comment.visId);
});

const chartMenu = document.getElementById('chart-menu');
let menuChartId = null;
function closeChartMenu() { chartMenu.hidden = true; menuChartId = null; }
function openChartMenu(chart, x, y) {
    document.querySelectorAll('.draggable-chart').forEach(closeCommentList);
    selectChart(chart);
    menuChartId = chart.id;
    chartMenu.hidden = false;
    const rect = chartMenu.getBoundingClientRect();
    chartMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    chartMenu.style.top = `${Math.max(document.getElementById('headline').offsetHeight + 8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    chartMenu.querySelector('button').focus();
}
chartMenu.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || !menuChartId) return;
    const visID = menuChartId;
    closeChartMenu();
    if (button.dataset.action === 'comment') openCommentDialog(visID);
    if (button.dataset.action === 'speech') openCommentDialog(visID, true);
    if (button.dataset.action === 'clear-comments') boardEvent('chart-comments-clear', { visId: visID, generation: (chartCommentGenerations[visID] || 0) + 1 });
    if (button.dataset.action === 'delete') boardEvent('chart-delete', { visId: visID });
});
chartMenu.addEventListener('keydown', event => {
    const buttons = [...chartMenu.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
    }
    if (event.key === 'Home') { event.preventDefault(); buttons[0].focus(); }
    if (event.key === 'End') { event.preventDefault(); buttons.at(-1).focus(); }
    if (event.key === 'Tab') closeChartMenu();
});
document.addEventListener('click', event => {
    if (!event.target.closest('#chart-menu, .chart-menu-button')) closeChartMenu();
    document.querySelectorAll('.draggable-chart').forEach(chart => {
        if (!chart.contains(event.target)) closeCommentList(chart);
    });
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        const chart = document.getElementById(menuChartId);
        closeChartMenu();
        if (chart) chart.focus();
        document.querySelectorAll('.draggable-chart').forEach(closeCommentList);
    }
});
window.addEventListener('resize', closeChartMenu);
document.getElementById('vis-container').addEventListener('scroll', closeChartMenu);

const commentDialog = document.getElementById('comment-dialog');
const commentInput = document.getElementById('comment-input');
let commentChartId = null;
function openCommentDialog(visID, speech = false) {
    if (!vlSpecDict[visID]) return;
    commentChartId = visID;
    commentInput.value = '';
    commentInput.setCustomValidity('');
    document.getElementById('comment-chart-name').textContent = document.getElementById(visID).querySelector('.chart-name').textContent;
    setCommentStatus('');
    commentDialog.showModal();
    commentInput.focus();
    if (speech) startCommentSpeech();
}
function setCommentStatus(text) {
    const status = document.getElementById('comment-status');
    status.textContent = text;
    status.hidden = !text;
}
commentInput.addEventListener('input', () => commentInput.setCustomValidity(''));
document.getElementById('comment-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = commentInput.value.trim();
    if (!text) { commentInput.setCustomValidity('Enter a comment.'); commentInput.reportValidity(); return; }
    if (!vlSpecDict[commentChartId]) { commentDialog.close(); return; }
    highLight(text, commentChartId, vlSpecDict[commentChartId]);
    commentDialog.close();
});
commentDialog.addEventListener('close', () => {
    if (speechSession?.mode === 'comment') stopSpeechSession();
    commentChartId = null;
});

function getColumn(csvData) {
    const rows = d3.csvParseRows(csvData).filter(row => row.some(value => value !== ''));
    const isMulti = rows[0].length > 2;
    return [rows.slice(1).map(row => row[isMulti ? 1 : 0]), rows.slice(1).map(row => row[isMulti ? 2 : 1]), isMulti ? rows.slice(1).map(row => row[0]) : 'None', isMulti];
}

// Only one microphone runs at a time. Live recording never calls the comment pipeline.
let speechSession = null;
let liveFinalTranscript = '';
const recordButton = document.getElementById('recordButton');
const speechCommentButton = document.getElementById('speech-comment-button');
function updateSpeechControls() {
    const live = speechSession?.mode === 'live';
    const comment = speechSession?.mode === 'comment';
    recordButton.setAttribute('aria-pressed', String(!!live));
    document.getElementById('record-label').textContent = live ? 'Stop' : 'Record';
    document.getElementById('transcript-indicator').classList.toggle('active', !!live);
    speechCommentButton.setAttribute('aria-pressed', String(!!comment));
    speechCommentButton.textContent = comment ? 'Stop listening' : 'Speech comment';
}
function renderLiveTranscript(interim = '') {
    const text = document.getElementById('transcript-text');
    text.replaceChildren(document.createTextNode(liveFinalTranscript));
    if (interim) {
        const span = document.createElement('span');
        span.className = 'interim';
        span.textContent = `${liveFinalTranscript ? ' ' : ''}${interim}`;
        text.appendChild(span);
    }
    if (!liveFinalTranscript && !interim) text.textContent = 'Listening… your words will appear here.';
    text.scrollTop = text.scrollHeight;
}
function stopSpeechSession() {
    const session = speechSession;
    if (!session) return;
    speechSession = null;
    session.active = false;
    clearTimeout(session.restartTimer);
    try { session.recognition.stop(); } catch {}
    if (session.mode === 'live') {
        document.getElementById('transcript-status').textContent = 'Transcript paused';
        renderLiveTranscript();
        if (!liveFinalTranscript) document.getElementById('live-transcript').hidden = true;
    } else setCommentStatus(commentInput.value.trim() ? 'Ready to post your comment.' : 'No speech captured. Try again or type a comment.');
    updateSpeechControls();
}
function startSpeechSession(mode) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        const message = 'Speech recognition is unavailable in this browser. Try Chrome for voice input.';
        if (mode === 'comment') setCommentStatus(message); else notifyBoard(message);
        return;
    }
    stopSpeechSession();
    const recognition = new SpeechRecognition();
    const session = { mode, recognition, active: true, committed: new Set(), final: '', prefix: commentInput.value.trim() };
    speechSession = session;
    recognition.lang = 'en-US';
    recognition.continuous = mode === 'live';
    recognition.interimResults = true;
    if (mode === 'live') {
        document.getElementById('live-transcript').hidden = false;
        document.getElementById('transcript-status').textContent = 'Live transcript';
        renderLiveTranscript();
    } else setCommentStatus('Listening… speak your comment, then post when ready.');
    updateSpeechControls();
    recognition.onresult = event => {
        if (speechSession !== session || !session.active) return;
        let interim = '';
        for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript.trim();
            if (result.isFinal && !session.committed.has(i)) {
                session.committed.add(i);
                if (mode === 'live') liveFinalTranscript += `${liveFinalTranscript ? ' ' : ''}${text}`;
                else session.final += `${session.final ? ' ' : ''}${text}`;
            } else if (!result.isFinal) interim += `${interim ? ' ' : ''}${text}`;
        }
        if (mode === 'live') renderLiveTranscript(interim);
        else { commentInput.value = [session.prefix, session.final, interim].filter(Boolean).join(' '); commentInput.setCustomValidity(''); }
    };
    recognition.onerror = event => {
        if (speechSession !== session || event.error === 'no-speech') return;
        const messages = {
            'not-allowed': 'Microphone access was denied. Allow microphone access in your browser and try again.',
            'service-not-allowed': 'Speech recognition is unavailable. Check your browser microphone settings.',
            'audio-capture': 'No microphone is available. Connect a microphone and try again.',
            'network': 'Speech recognition lost its connection. Try recording again.'
        };
        stopSpeechSession();
        const message = messages[event.error] || 'Speech recognition stopped. Try again.';
        if (mode === 'comment') setCommentStatus(message); else notifyBoard(message);
    };
    recognition.onend = () => {
        if (speechSession !== session || !session.active) return;
        if (mode === 'live') {
            // Browsers can end continuous recognition after a pause; keep recording until toggled off.
            session.restartTimer = setTimeout(() => {
                if (speechSession !== session || !session.active) return;
                session.committed.clear();
                try { recognition.start(); } catch { stopSpeechSession(); notifyBoard('Recording stopped. Try recording again.'); }
            }, 300);
        } else stopSpeechSession();
    };
    try { recognition.start(); } catch {
        stopSpeechSession();
        if (mode === 'comment') setCommentStatus('Could not start the microphone. Try again.'); else notifyBoard('Could not start the microphone. Try again.');
    }
}
function startCommentSpeech() {
    if (speechSession?.mode === 'comment') stopSpeechSession(); else startSpeechSession('comment');
}
speechCommentButton.addEventListener('click', startCommentSpeech);
recordButton.addEventListener('click', () => {
    if (speechSession?.mode === 'live') stopSpeechSession(); else startSpeechSession('live');
});
window.addEventListener('pagehide', stopSpeechSession);

// Retain VisConnect's invite handler while moving its UI into the top panel.
const shareObserver = new MutationObserver(() => {
    const container = document.getElementById('visconnect-container');
    if (!container) return;
    container.setAttribute('data-visconnect-local', '');
    container.querySelector('style')?.remove();
    container.removeAttribute('style');
    const invite = container.querySelector('#visconnect-invite');
    invite.setAttribute('role', 'button');
    invite.tabIndex = 0;
    invite.setAttribute('aria-label', 'Copy whiteboard sharing link');
    const label = document.createElement('span');
    label.textContent = 'Share';
    invite.appendChild(label);
    invite.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); invite.click(); }
    });
    document.querySelector('.visconnect-container')?.remove();
    document.querySelector('.header-buttons').appendChild(container);
    shareObserver.disconnect();
});
shareObserver.observe(document.body, { childList: true });
