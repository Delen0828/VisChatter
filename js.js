const apiResponseDict = {};
const vlSpecDict = {};
const chartComments = {};
const removedChartComments = {};
const chartOwners = {};
const chartCommentGenerations = {};
const previewedComments = {};
const defaultAnnotations = {};
const BASE_VERSION = 'base';

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
function boardActor(event) {
    // Replayed events carry the original collaborator, including during catch-up.
    return event?.collaboratorId || (event?.['visconnect-received'] ? null : window.vc?.ownId);
}
function canManageChart(visID, actor = boardActor()) {
    return !!actor && (actor === window.vc?.leaderId || actor === chartOwners[visID]);
}
function boardEvent(type, detail) {
    if (['chart-delete', 'chart-comments-clear'].includes(type) && !canManageChart(detail.visId)) {
        notifyBoard(`Only the uploader or presenter can ${type === 'chart-delete' ? 'delete this visualization' : 'clear these comments'}.`);
        return false;
    }
    document.body.dispatchEvent(new CustomEvent(type, { detail }));
    return true;
}
function notifyBoard(text) {
    const notice = document.getElementById('board-notice');
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(notifyBoard.timer);
    notifyBoard.timer = setTimeout(() => { notice.hidden = true; }, 6000);
}
function updateModelStatus() {
    const pending = Object.values(chartComments).flat().filter(comment => comment.status === 'pending').length + transcriptFactRequests.size;
    const status = document.getElementById('model-status');
    status.hidden = pending === 0;
    status.setAttribute('aria-busy', String(pending > 0));
}
function openAddDialog() {
    closeChartMenu();
    closeCommentEditor();
    document.getElementById('add-error').hidden = true;
    document.getElementById('add-dialog').showModal();
    document.getElementById('input').focus();
}
document.getElementById('addButton').addEventListener('click', openAddDialog);
document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog).close());
});
document.querySelectorAll('dialog').forEach(dialog => {
    if (dialog.id === 'username-dialog') return;
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
    const selected = defaultAnnotations[visID];
    if (selected === BASE_VERSION) return originalVisualizations[visID];
    return chartComments[visID]?.find(comment => comment.id === selected)?.annotatedSpec
        || latestChartAnnotation(visID)?.annotatedSpec || originalVisualizations[visID];
}
function currentChartSpec(visID) {
    const preview = previewedComments[visID];
    if (preview === BASE_VERSION) return originalVisualizations[visID];
    return chartComments[visID]?.find(comment => comment.id === preview)?.annotatedSpec || defaultChartSpec(visID);
}
function updateDefaultAnnotationTabs(visID) {
    const selected = defaultAnnotations[visID] || latestChartAnnotation(visID)?.id || BASE_VERSION;
    document.getElementById(visID)?.querySelectorAll('.comment-item').forEach(item => {
        item.setAttribute('aria-pressed', String(item.dataset.versionId === selected));
    });
}
function setDefaultAnnotation(visID, versionId) {
    if (versionId !== BASE_VERSION && !chartComments[visID]?.some(comment => comment.id === versionId && comment.annotatedSpec)) return;
    defaultAnnotations[visID] = versionId;
    showDefaultAnnotation(visID);
    updateDefaultAnnotationTabs(visID);
}
function showDefaultAnnotation(visID) {
    delete previewedComments[visID];
    const spec = defaultChartSpec(visID);
    if (spec) reRenderVegaLite(spec, visID);
}
function previewComment(visID, comment) {
    previewedComments[visID] = comment.id;
    reRenderVegaLite(currentChartSpec(visID), visID);
}
function addAnnotationChoice(item, visID, versionId, label, available = true) {
    item.dataset.versionId = versionId;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Select ${label}`);
    item.setAttribute('aria-disabled', String(!available));
    item.addEventListener('click', () => setDefaultAnnotation(visID, versionId));
    item.addEventListener('keydown', event => {
        if (event.target !== item || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        setDefaultAnnotation(visID, versionId);
    });
}
function addAnnotationPreview(item, visID, versionId) {
    const preview = () => previewComment(visID, { id: versionId });
    const endPreview = event => {
        const nextItem = event.relatedTarget?.closest('.comment-item');
        if (nextItem && nextItem.parentElement === item.parentElement) return;
        if (previewedComments[visID] === versionId) showDefaultAnnotation(visID);
    };
    item.addEventListener('mouseenter', preview);
    item.addEventListener('mouseleave', endPreview);
    item.addEventListener('focusin', preview);
    item.addEventListener('focusout', event => {
        if (!item.contains(event.relatedTarget)) endPreview(event);
    });
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
    bubble.replaceChildren();
    const authors = [...new Map(comments.map(comment => [comment.author.id, comment.author])).values()];
    if (comments.length) {
        const profiles = document.createElement('span');
        profiles.className = 'comment-profiles';
        profiles.setAttribute('aria-hidden', 'true');
        authors.slice(0, 3).forEach(author => profiles.appendChild(createProfileAvatar(author)));
        const count = document.createElement('span');
        count.className = 'comment-count';
        count.textContent = `+${comments.length}`;
        bubble.append(profiles, count);
    }
    bubble.setAttribute('aria-label', `Show ${comments.length} comment${comments.length === 1 ? '' : 's'}${authors.length ? ` by ${authors.map(author => author.username).join(', ')}` : ''}`);
    const popover = chart.querySelector('.comment-popover');
    if (!comments.length) { popover.hidden = true; bubble.setAttribute('aria-expanded', 'false'); }
    const list = chart.querySelector('.comment-list');
    list.replaceChildren();
    if (comments.length) {
        const base = document.createElement('li');
        base.className = 'comment-item base-version';
        base.tabIndex = 0;
        const text = document.createElement('p');
        text.className = 'comment-text';
        text.textContent = 'Original chart';
        base.appendChild(text);
        addAnnotationChoice(base, visID, BASE_VERSION, 'Original chart');
        addAnnotationPreview(base, visID, BASE_VERSION);
        list.appendChild(base);
    }
    for (const comment of comments) {
        const item = document.createElement('li');
        item.className = 'comment-item';
        item.tabIndex = 0;
        item.dataset.commentId = comment.id;
        item.appendChild(createProfileAvatar(comment.author));
        const content = document.createElement('div');
        content.className = 'comment-content';
        const text = document.createElement('p');
        text.className = 'comment-text';
        text.textContent = comment.text;
        const meta = document.createElement('div');
        meta.className = 'comment-meta';
        const author = document.createElement('span');
        author.className = 'comment-author';
        author.textContent = comment.author.username;
        const time = document.createElement('time');
        time.dateTime = new Date(comment.time).toISOString();
        time.textContent = new Date(comment.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        meta.append(author, time);
        if (comment.status === 'pending') {
            const label = document.createElement('span');
            label.className = 'latest-label';
            label.textContent = 'Annotating…';
            meta.appendChild(label);
        }
        content.append(meta, text);
        item.appendChild(content);
        if (comment.error) {
            const error = document.createElement('p');
            error.className = 'comment-error';
            error.textContent = comment.error;
            content.appendChild(error);
        }
        addAnnotationChoice(item, visID, comment.id, `annotation: ${comment.text}`, !!comment.annotatedSpec);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'comment-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove comment: ${comment.text}`);
        remove.addEventListener('click', event => {
            event.stopPropagation();
            boardEvent('chart-comment-delete', { visId: visID, commentId: comment.id });
        });
        item.appendChild(remove);
        addAnnotationPreview(item, visID, comment.id);
        list.appendChild(item);
    }
    updateDefaultAnnotationTabs(visID);
}
document.body.addEventListener('chart-comment', event => {
    const comment = event.detail;
    if (!document.getElementById(comment.visId) || removedChartComments[comment.visId]?.has(comment.id)) return;
    // Clearing invalidates pending results, including results arriving from peers.
    if (comment.generation !== (chartCommentGenerations[comment.visId] || 0)) return;
    const comments = chartComments[comment.visId] ||= [];
    const existing = comments.findIndex(entry => entry.id === comment.id);
    const actor = boardActor(event);
    const author = comments[existing]?.author || window.commentIdentity.authorFor(actor, comment.author);
    if (existing >= 0) {
        // A replayed pending event cannot overwrite a completed annotation.
        if (comments[existing].status !== 'pending' && comment.status === 'pending') return;
        comments[existing] = { ...comment, author };
    } else comments.push({ ...comment, author });
    const previewId = previewedComments[comment.visId];
    renderChartComments(comment.visId);
    const preview = comments.find(entry => entry.id === previewId);
    if (previewId === BASE_VERSION || preview) previewComment(comment.visId, { id: previewId });
    else showDefaultAnnotation(comment.visId);
    updateModelStatus();
});

const chartMenu = document.getElementById('chart-menu');
const shareMenu = document.getElementById('chart-share-menu');
const shareButton = document.getElementById('chart-share-button');
let menuChartId = null;
let menuChartSpec = null;
function closeShareMenu() {
    shareMenu.hidden = true;
    shareButton.setAttribute('aria-expanded', 'false');
}
function closeChartMenu() {
    closeShareMenu();
    chartMenu.hidden = true;
    menuChartId = null;
    menuChartSpec = null;
}
function openChartMenu(chart, x, y) {
    const spec = structuredClone(currentChartSpec(chart.id));
    closeCommentEditor();
    document.querySelectorAll('.draggable-chart').forEach(closeCommentList);
    closeShareMenu();
    selectChart(chart);
    menuChartId = chart.id;
    menuChartSpec = spec;
    chartMenu.hidden = false;
    const rect = chartMenu.getBoundingClientRect();
    chartMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    chartMenu.style.top = `${Math.max(document.getElementById('headline').offsetHeight + 8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
    chartMenu.querySelector('button').focus();
}
function shareMenuPosition(anchor, size, viewport, headerHeight) {
    const minY = headerHeight + 8;
    let x = anchor.right + 4;
    let y = anchor.top;
    if (x + size.width > viewport.width - 8) {
        x = anchor.left - size.width - 4;
        if (x < 8) { x = anchor.left; y = anchor.bottom + 4; }
    }
    return {
        x: Math.max(8, Math.min(x, viewport.width - size.width - 8)),
        y: Math.max(minY, Math.min(y, viewport.height - size.height - 8))
    };
}
function openShareMenu(focus = false) {
    if (!menuChartId) return;
    shareMenu.hidden = false;
    shareButton.setAttribute('aria-expanded', 'true');
    const position = shareMenuPosition(chartMenu.getBoundingClientRect(), shareMenu.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }, document.getElementById('headline').offsetHeight);
    shareMenu.style.left = `${position.x}px`;
    shareMenu.style.top = `${position.y}px`;
    if (focus) shareMenu.querySelector('button').focus();
}
shareButton.addEventListener('mouseenter', () => openShareMenu());
chartMenu.addEventListener('mouseover', event => {
    const button = event.target.closest('[data-action]');
    if (button && button !== shareButton && !shareMenu.contains(button)) closeShareMenu();
});
chartMenu.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || !menuChartId) return;
    if (button.dataset.action === 'share') { openShareMenu(true); return; }
    const visID = menuChartId;
    const spec = menuChartSpec;
    closeChartMenu();
    if (['copy-code', 'download-svg', 'download-png'].includes(button.dataset.action)) {
        shareChartVersion(spec, button.dataset.action);
        return;
    }
    if (button.dataset.action === 'comment') openCommentEditor(visID);
    if (button.dataset.action === 'speech') openCommentEditor(visID, true);
    if (button.dataset.action === 'clear-comments') boardEvent('chart-comments-clear', { visId: visID, generation: (chartCommentGenerations[visID] || 0) + 1 });
    if (button.dataset.action === 'delete') boardEvent('chart-delete', { visId: visID });
});
chartMenu.addEventListener('keydown', event => {
    const inShareMenu = shareMenu.contains(event.target);
    const buttons = inShareMenu ? [...shareMenu.querySelectorAll('button')]
        : [...chartMenu.querySelectorAll('button')].filter(button => !shareMenu.contains(button));
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowRight' && document.activeElement === shareButton) {
        event.preventDefault(); openShareMenu(true); return;
    }
    if (inShareMenu && (event.key === 'ArrowLeft' || event.key === 'Escape')) {
        event.preventDefault(); event.stopPropagation(); closeShareMenu(); shareButton.focus(); return;
    }
    if (!inShareMenu && !['Enter', ' ', 'ArrowRight'].includes(event.key)) closeShareMenu();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
    }
    if (event.key === 'Home') { event.preventDefault(); buttons[0].focus(); }
    if (event.key === 'End') { event.preventDefault(); buttons.at(-1).focus(); }
    if (event.key === 'Tab') closeChartMenu();
});
document.addEventListener('click', event => {
    const chart = document.getElementById(commentChartId);
    if (!commentEditor.hidden && !commentEditor.contains(event.target) && !chart?.contains(event.target) && !event.target.closest('#chart-menu')) closeCommentEditor();
    if (!event.target.closest('#chart-menu, .chart-menu-button')) closeChartMenu();
    document.querySelectorAll('.draggable-chart').forEach(chart => {
        if (!chart.querySelector('.comment-popover').contains(event.target) && !chart.querySelector('.comment-bubble').contains(event.target)) closeCommentList(chart);
    });
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        closeCommentEditor(true);
        const chart = document.getElementById(menuChartId);
        closeChartMenu();
        if (chart) chart.focus();
        document.querySelectorAll('.draggable-chart').forEach(closeCommentList);
    }
});
window.addEventListener('resize', () => { closeChartMenu(); positionCommentEditor(); });
document.getElementById('vis-container').addEventListener('scroll', () => { closeChartMenu(); positionCommentEditor(); });
document.body.addEventListener('chart-move', event => {
    if (event.detail.visId === commentChartId) requestAnimationFrame(positionCommentEditor);
});

const commentEditor = document.getElementById('comment-editor');
const commentInput = document.getElementById('comment-input');
let commentChartId = null;

function commentEditorPosition(anchor, size, viewport, headerHeight) {
    const gap = 12;
    const minY = headerHeight + 8;
    let x = anchor.right + gap;
    let y = anchor.top;
    if (x + size.width > viewport.width - 8) {
        if (anchor.left - gap - size.width >= 8) x = anchor.left - gap - size.width;
        else { x = anchor.left; y = anchor.bottom + gap; }
    }
    return {
        x: Math.max(8, Math.min(x, viewport.width - size.width - 8)),
        y: Math.max(minY, Math.min(y, viewport.height - size.height - 8))
    };
}
function positionCommentEditor() {
    if (commentEditor.hidden) return;
    const chart = document.getElementById(commentChartId);
    if (!chart) { closeCommentEditor(); return; }
    const position = commentEditorPosition(chart.getBoundingClientRect(), commentEditor.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight }, document.getElementById('headline').offsetHeight);
    commentEditor.style.left = `${position.x}px`;
    commentEditor.style.top = `${position.y}px`;
}
function closeCommentEditor(restoreFocus = false) {
    if (speechSession?.mode === 'comment') stopSpeechSession();
    const chart = document.getElementById(commentChartId);
    commentEditor.hidden = true;
    commentChartId = null;
    if (restoreFocus && chart) chart.focus();
}
function openCommentEditor(visID, speech = false) {
    if (!vlSpecDict[visID]) return;
    closeCommentEditor();
    closeChartMenu();
    const chart = document.getElementById(visID);
    selectChart(chart);
    commentChartId = visID;
    commentInput.value = '';
    commentInput.setCustomValidity('');
    commentEditor.setAttribute('aria-label', `Comment on ${chart.getAttribute('aria-label') || 'chart'}`);
    setCommentStatus('');
    commentEditor.hidden = false;
    positionCommentEditor();
    commentInput.focus();
    if (speech) startCommentSpeech();
}
function setCommentStatus(text) {
    const status = document.getElementById('comment-status');
    status.textContent = text;
    status.hidden = !text;
    positionCommentEditor();
}
document.getElementById('close-comment-button').addEventListener('click', () => closeCommentEditor(true));
commentInput.addEventListener('input', () => commentInput.setCustomValidity(''));
document.getElementById('comment-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = commentInput.value.trim();
    if (!text) { commentInput.setCustomValidity('Enter a comment.'); commentInput.reportValidity(); return; }
    if (!vlSpecDict[commentChartId]) { closeCommentEditor(); return; }
    highLight(text, commentChartId, vlSpecDict[commentChartId]);
    closeCommentEditor(true);
});

function getColumn(csvData) {
    const rows = d3.csvParseRows(csvData).filter(row => row.some(value => value !== ''));
    const isMulti = rows[0].length > 2;
    return [rows.slice(1).map(row => row[isMulti ? 1 : 0]), rows.slice(1).map(row => row[isMulti ? 2 : 1]), isMulti ? rows.slice(1).map(row => row[0]) : 'None', isMulti];
}

// Only one microphone runs at a time. Final live phrases are checked once, locally.
let speechSession = null;
let liveFinalTranscript = '';
let liveInterimTranscript = '';
let transcriptVisible = true;
const liveTranscriptPhrases = [];
const transcriptFactRequests = new Map();
const recordButton = document.getElementById('recordButton');
const speechCommentButton = document.getElementById('speech-comment-button');

function splitTranscriptPhrases(text) {
    // Sentence segmentation preserves decimals and abbreviations. Semicolons and
    // line breaks also separate clauses; an unpunctuated final result is a pause.
    const sentences = typeof Intl.Segmenter === 'function'
        ? [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)]
        : [...text.matchAll(/[^.!?]+(?:[.!?]+|$)/g)].map(match => ({ segment: match[0], index: match.index }));
    return sentences.flatMap(sentence => [...sentence.segment.matchAll(/[^;\n]+[;\n]*/g)].flatMap(match => {
        const phrase = match[0].trim();
        if (!phrase) return [];
        const start = sentence.index + match.index + match[0].indexOf(phrase);
        return [{ text: phrase, start, end: start + phrase.length }];
    }));
}

function appendLiveTranscript(text) {
    if (!text) return;
    const offset = liveFinalTranscript.length + (liveFinalTranscript ? 1 : 0);
    liveFinalTranscript += `${liveFinalTranscript ? ' ' : ''}${text}`;
    for (const part of splitTranscriptPhrases(text)) {
        const phrase = { ...part, start: offset + part.start, end: offset + part.end,
            id: createBoardId('phrase'), isDataFact: false,
            time: lastCommentTimestamp = Math.max(Date.now(), lastCommentTimestamp + 1) };
        liveTranscriptPhrases.push(phrase);
        const request = { phrase, charts: transcriptChartContext(), model: modelSelect.value,
            controller: new AbortController(), started: false };
        transcriptFactRequests.set(phrase.id, request);
    }
    updateModelStatus();
    processTranscriptFactQueue();
}

function processTranscriptFactQueue() {
    let running = [...transcriptFactRequests.values()].filter(request => request.started).length;
    for (const request of transcriptFactRequests.values()) {
        if (running >= 2) break;
        if (request.started) continue;
        request.started = true;
        running++;
        checkTranscriptPhrase(request);
    }
}

async function checkTranscriptPhrase(request) {
    const { phrase, model, controller } = request;
    const isCurrent = () => transcriptFactRequests.get(phrase.id) === request;
    try {
        const decision = await detectTranscriptDataFact(phrase.text, request.charts, model, controller.signal);
        if (!isCurrent()) return;
        phrase.isDataFact = decision.isDataFact;
        renderLiveTranscript();
        if (decision.isDataFact) {
            const target = request.charts.find(chart => chart.id === decision.chartId);
            if (target && document.getElementById(target.id) && target.generation === (chartCommentGenerations[target.id] || 0)) {
                highLight(phrase.text, target.id, target.spec, { time: phrase.time, model });
            } else if (!request.cancelledChartIds?.has(decision.chartId)) {
                notifyBoard('Data fact detected. No matching chart is available for its comment.');
            }
        }
    } catch (error) {
        if (error.name !== 'AbortError' && isCurrent()) {
            notifyBoard(error.name === 'TypeError' ? 'Could not check this transcript phrase. Try recording again.' : error.message);
        }
    } finally {
        if (isCurrent()) transcriptFactRequests.delete(phrase.id);
        updateModelStatus();
        processTranscriptFactQueue();
    }
}

function cancelTranscriptFacts(visID) {
    for (const [id, request] of transcriptFactRequests) {
        if (visID !== undefined) {
            if (!request.charts.some(chart => chart.id === visID)) continue;
            (request.cancelledChartIds ||= new Set()).add(visID);
            // Keep original ids for validating an in-flight response, but make
            // cleared/deleted charts ineligible for new comments.
            request.charts.find(chart => chart.id === visID).generation = -1;
            if (request.charts.some(chart => chart.generation >= 0)) continue;
        }
        request.controller.abort();
        transcriptFactRequests.delete(id);
    }
    updateModelStatus();
    processTranscriptFactQueue();
}
function updateTranscriptVisibility() {
    const available = speechSession?.mode === 'live' || !!liveFinalTranscript;
    const visible = !!available && transcriptVisible;
    document.getElementById('live-transcript').hidden = !available;
    const text = document.getElementById('transcript-text');
    text.hidden = !visible;
    const toggle = document.getElementById('transcript-toggle');
    toggle.hidden = !available;
    toggle.setAttribute('aria-expanded', String(visible));
    const label = visible ? 'Hide transcript' : 'Show transcript';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
    if (visible) {
        text.scrollTop = text.scrollHeight;
    }
}
document.getElementById('transcript-toggle').addEventListener('click', () => {
    transcriptVisible = !transcriptVisible;
    updateTranscriptVisibility();
});
function updateSpeechControls() {
    const live = speechSession?.mode === 'live';
    const comment = speechSession?.mode === 'comment';
    recordButton.setAttribute('aria-pressed', String(!!live));
    document.getElementById('record-label').textContent = live ? 'Stop' : 'Record';
    document.getElementById('transcript-indicator').classList.toggle('active', !!live);
    speechCommentButton.setAttribute('aria-pressed', String(!!comment));
    speechCommentButton.textContent = comment ? 'Stop listening' : 'Speech comment';
    updateTranscriptVisibility();
}
function renderLiveTranscript(interim = liveInterimTranscript) {
    liveInterimTranscript = interim;
    const text = document.getElementById('transcript-text');
    text.replaceChildren();
    let offset = 0;
    for (const phrase of liveTranscriptPhrases) {
        text.appendChild(document.createTextNode(liveFinalTranscript.slice(offset, phrase.start)));
        const span = document.createElement(phrase.isDataFact ? 'mark' : 'span');
        if (phrase.isDataFact) span.className = 'transcript-fact';
        span.dataset.phraseId = phrase.id;
        span.textContent = liveFinalTranscript.slice(phrase.start, phrase.end);
        text.appendChild(span);
        offset = phrase.end;
    }
    text.appendChild(document.createTextNode(liveFinalTranscript.slice(offset)));
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
        renderLiveTranscript('');
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
        document.getElementById('transcript-status').textContent = 'Live Transcript';
        renderLiveTranscript('');
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
                if (mode === 'live') appendLiveTranscript(text);
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
window.addEventListener('pagehide', () => { stopSpeechSession(); cancelTranscriptFacts(); });

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
    invite.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); invite.click(); }
    });
    document.querySelector('.visconnect-container').replaceWith(container);
    shareObserver.disconnect();
});
shareObserver.observe(document.body, { childList: true });
