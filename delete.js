function cancelChartAnnotations(visID) {
    for (const [id, request] of Object.entries(annotationRequests)) {
        if (request.visID === visID) { request.controller.abort(); delete annotationRequests[id]; }
    }
}
function clearChartComments(visID, generation = (chartCommentGenerations[visID] || 0) + 1) {
    if (!document.getElementById(visID) || generation <= (chartCommentGenerations[visID] || 0)) return;
    chartCommentGenerations[visID] = generation;
    cancelChartAnnotations(visID);
    chartComments[visID] = [];
    delete previewedComments[visID];
    renderChartComments(visID);
    showDefaultAnnotation(visID);
}
function deleteChart(visID) {
    const chart = document.getElementById(visID);
    if (!chart) return;
    cancelChartAnnotations(visID);
    chart.vegaView?.finalize();
    chart.remove();
    for (const dictionary of [apiResponseDict, vlSpecDict, msgPool, specPool, chartComments, originalVisualizations, previewedComments, chartCommentGenerations]) delete dictionary[visID];
    if (commentChartId === visID) commentDialog.close();
    if (menuChartId === visID) closeChartMenu();
    updateBoardState();
}
document.body.addEventListener('chart-comments-clear', event => clearChartComments(event.detail.visId, event.detail.generation));
document.body.addEventListener('chart-delete', event => deleteChart(event.detail.visId));
document.body.addEventListener('board-clear', () => {
    closeChartMenu();
    document.querySelectorAll('.draggable-chart').forEach(chart => deleteChart(chart.id));
    document.getElementById('input').value = '';
    updateBoardState();
});
document.getElementById('clearButton').addEventListener('click', () => boardEvent('board-clear', {}));
// Right-click opens actions; deletion is only performed by the Delete menu item.
document.getElementById('vis-container').addEventListener('contextmenu', event => {
    const chart = event.target.closest('.draggable-chart');
    if (!chart || event.target.closest('.comment-popover')) return;
    event.preventDefault();
    openChartMenu(chart, event.clientX, event.clientY);
});
