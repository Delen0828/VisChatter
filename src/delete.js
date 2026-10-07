function removeChartComment(visID, commentId) {
    if (!document.getElementById(visID)) return;
    (removedChartComments[visID] ||= new Set()).add(commentId);
    const request = annotationRequests[commentId];
    if (request?.visID === visID) {
        request.controller.abort();
        delete annotationRequests[commentId];
    }
    chartComments[visID] = (chartComments[visID] || []).filter(comment => comment.id !== commentId);
    if (defaultAnnotations[visID] === commentId) delete defaultAnnotations[visID];
    if (previewedComments[visID] === commentId) delete previewedComments[visID];
    renderChartComments(visID);
    reRenderVegaLite(currentChartSpec(visID), visID);
    updateModelStatus();
}
document.body.addEventListener('chart-comment-delete', event => removeChartComment(event.detail.visId, event.detail.commentId));

function cancelChartAnnotations(visID) {
    cancelTranscriptFacts(visID);
    for (const [id, request] of Object.entries(annotationRequests)) {
        if (request.visID === visID) { request.controller.abort(); delete annotationRequests[id]; }
    }
}
function clearChartComments(visID, generation = (chartCommentGenerations[visID] || 0) + 1, actor = boardActor()) {
    if (!canManageChart(visID, actor)) return;
    if (!document.getElementById(visID) || generation <= (chartCommentGenerations[visID] || 0)) return;
    chartCommentGenerations[visID] = generation;
    cancelChartAnnotations(visID);
    chartComments[visID] = [];
    delete previewedComments[visID];
    delete defaultAnnotations[visID];
    renderChartComments(visID);
    showDefaultAnnotation(visID);
    updateModelStatus();
}
function deleteChart(visID, actor = boardActor()) {
    if (!canManageChart(visID, actor)) return;
    const chart = document.getElementById(visID);
    if (!chart) return;
    cancelChartAnnotations(visID);
    chart.vegaView?.finalize();
    chart.remove();
    for (const dictionary of [apiResponseDict, vlSpecDict, msgPool, specPool, chartComments, chartOwners, originalVisualizations, previewedComments, defaultAnnotations, chartCommentGenerations, removedChartComments]) delete dictionary[visID];
    if (commentChartId === visID) closeCommentEditor();
    if (menuChartId === visID) closeChartMenu();
    updateModelStatus();
}
document.body.addEventListener('chart-comments-clear', event => clearChartComments(event.detail.visId, event.detail.generation, boardActor(event)));
document.body.addEventListener('chart-delete', event => deleteChart(event.detail.visId, boardActor(event)));
document.body.addEventListener('board-clear', event => {
    closeChartMenu();
    const actor = boardActor(event);
    document.querySelectorAll('.draggable-chart').forEach(chart => deleteChart(chart.id, actor));
    document.getElementById('input').value = '';
    updateModelStatus();
});
document.getElementById('clearButton').addEventListener('click', () => boardEvent('board-clear', {}));
// Right-click opens actions; deletion is only performed by the Delete menu item.
document.getElementById('vis-container').addEventListener('contextmenu', event => {
    const chart = event.target.closest('.draggable-chart');
    if (!chart || event.target.closest('.comment-popover')) return;
    event.preventDefault();
    openChartMenu(chart, event.clientX, event.clientY);
});
