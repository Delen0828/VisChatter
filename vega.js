function chartTitle(spec, fallback) {
    const title = typeof spec.title === 'object' && !Array.isArray(spec.title) ? spec.title?.text : spec.title;
    return Array.isArray(title) ? title.join(' ') : title || fallback;
}

function renderVegaLite(spec, uniqueId = createBoardId('vis')) {
    const board = document.getElementById('vis-container');
    const vegaLiteSpec = typeof spec === 'string' ? JSON.parse(spec) : spec;
    const count = board.querySelectorAll('.draggable-chart').length;
    const chart = document.createElement('div');
    chart.className = 'draggable-chart';
    chart.id = uniqueId;
    chart.tabIndex = 0;
    chart.setAttribute('aria-label', chartTitle(vegaLiteSpec, `Visualization ${count + 1}`));
    chart.setAttribute('data-vl-spec', JSON.stringify(vegaLiteSpec));
    const offset = (count % 6) * 36;
    chart.style.transform = `translate3d(${36 + offset}px, ${36 + offset}px, 0)`;
    chart.innerHTML = `<div class="chart-header">
        <span class="chart-name">Visualization ${count + 1}</span>
        <div class="chart-controls" data-visconnect-local>
            <button type="button" class="comment-bubble" aria-expanded="false" aria-controls="${uniqueId}-comments" hidden></button>
            <button type="button" class="chart-menu-button" aria-label="Visualization actions" aria-haspopup="menu">···</button>
        </div>
    </div>
    <section id="${uniqueId}-comments" class="comment-popover" aria-label="Chart comments" data-visconnect-local hidden>
        <div class="comment-popover-heading"><h3>Comments</h3><button type="button" class="icon-button" aria-label="Close comments">×</button></div>
        <ol class="comment-list"></ol>
    </section>
    <div class="chart-visualization"></div>`;
    chartComments[uniqueId] = [];
    originalVisualizations[uniqueId] = structuredClone(vegaLiteSpec);
    callApi(JSON.stringify(vegaLiteSpec), uniqueId);
    chart.querySelector('.comment-bubble').addEventListener('click', () => toggleCommentList(chart));
    chart.querySelector('.comment-popover .icon-button').addEventListener('click', () => closeCommentList(chart));
    chart.querySelector('.chart-menu-button').addEventListener('click', event => {
        const rect = event.currentTarget.getBoundingClientRect();
        openChartMenu(chart, rect.left, rect.bottom + 5);
    });
    chart.addEventListener('keydown', event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const rect = chart.getBoundingClientRect();
            openChartMenu(chart, rect.left + 20, rect.top + 40);
        }
    });
    board.appendChild(chart);
    makeDraggable(chart);
    makeSelectable(chart);
    reRenderVegaLite(vegaLiteSpec, uniqueId);
}

function reRenderVegaLite(spec, uniqueId) {
    const chart = document.getElementById(uniqueId);
    if (!chart || !spec) return;
    const version = chart.renderVersion = (chart.renderVersion || 0) + 1;
    // Serialize embeds so a slower preview cannot replace a newer annotation.
    chart.renderQueue = (chart.renderQueue || Promise.resolve()).then(async () => {
        if (!chart.isConnected || chart.renderVersion !== version) return;
        chart.vegaView?.finalize();
        const target = chart.querySelector('.chart-visualization');
        try {
            const result = await vegaEmbed(target, spec, { actions: false, renderer: 'svg' });
            if (!chart.isConnected) result.view.finalize();
            else chart.vegaView = result.view;
        } catch (error) {
            if (!chart.isConnected || chart.renderVersion !== version) return;
            const notice = document.createElement('p');
            notice.className = 'chart-error';
            notice.textContent = `Error rendering chart: ${error.message}`;
            target.replaceChildren(notice);
        }
    }).catch(error => console.error('Chart rendering failed:', error));
    return chart.renderQueue;
}
