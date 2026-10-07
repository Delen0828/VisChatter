function chartTitle(spec, fallback) {
    const title = typeof spec.title === 'object' && !Array.isArray(spec.title) ? spec.title?.text : spec.title;
    return Array.isArray(title) ? title.join(' ') : title || fallback;
}

function canFitChartSpec(spec) {
    return !!(spec.mark || spec.layer) && !spec.facet && !spec.encoding?.facet && !spec.encoding?.row && !spec.encoding?.column;
}

function resizeChartVisualization(chart) {
    if (!chart.style.width || !chart.style.height || !chart.vegaView || !chart.isConnected) return;
    if (chart.panelFits && !chart.renderedLayout) {
        // Compile discrete step dimensions into flexible dimensions once, then
        // resize the live view without rebuilding it on every pointer movement.
        return reRenderVegaLite(JSON.parse(chart.requestedSpec || chart.renderedSpec), chart.id);
    }
    chart.resizePending = true;
    if (chart.resizeQueue) return chart.resizeQueue;
    // Serialize Vega updates and coalesce sizes received while a render is running.
    chart.resizeQueue = Promise.resolve().then(async () => {
        while (chart.resizePending && chart.isConnected) {
            chart.resizePending = false;
            const target = chart.querySelector('.chart-visualization');
            const view = chart.vegaView;
            if (chart.panelFits) {
                view.signal('autosize', { type: 'fit', contains: 'padding' });
                await view.width(target.clientWidth).height(target.clientHeight).resize().runAsync();
            } else {
                // Vega-Lite compositions cannot use fit autosizing. Scale their full
                // SVG viewport so facets and concatenated plots stay visible together.
                const svg = target.querySelector('svg');
                if (!svg) continue;
                if (!svg.hasAttribute('viewBox')) {
                    svg.setAttribute('viewBox', `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
                }
                svg.style.width = `${target.clientWidth}px`;
                svg.style.height = `${target.clientHeight}px`;
            }
        }
    }).catch(error => {
        if (chart.isConnected) console.error('Chart resizing failed:', error);
    }).finally(() => { chart.resizeQueue = null; });
    return chart.resizeQueue;
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
        <div class="comment-popover-heading"><h3>Comments</h3><button type="button" class="comment-clear-all">Clear all</button></div>
        <ol class="comment-list"></ol>
    </section>
    <div class="chart-visualization"></div>`;
    chartComments[uniqueId] = [];
    originalVisualizations[uniqueId] = structuredClone(vegaLiteSpec);
    callApi(JSON.stringify(vegaLiteSpec), uniqueId);
    chart.querySelector('.comment-bubble').addEventListener('click', () => toggleCommentList(chart));
    chart.querySelector('.comment-clear-all').addEventListener('click', () => {
        boardEvent('chart-comments-clear', { visId: uniqueId, generation: (chartCommentGenerations[uniqueId] || 0) + 1 });
    });
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
    const specKey = JSON.stringify(spec);
    const panelFits = canFitChartSpec(spec);
    const panelLayout = !!(panelFits && chart.style.width && chart.style.height);
    if (chart.requestedSpec === specKey && !!chart.requestedLayout === panelLayout) return chart.renderQueue;
    chart.requestedSpec = specKey;
    chart.requestedLayout = panelLayout;
    const version = chart.renderVersion = (chart.renderVersion || 0) + 1;
    // Returning to the visible version also invalidates any unfinished preview.
    if (chart.renderedSpec === specKey && !!chart.renderedLayout === panelLayout) return chart.renderQueue = Promise.resolve();
    // Coalesce requests in this turn, then render without clearing the visible plot.
    chart.renderQueue = Promise.resolve().then(async () => {
        if (!chart.isConnected || chart.renderVersion !== version) return;
        const target = chart.querySelector('.chart-visualization');
        const staging = document.createElement('div');
        staging.className = 'chart-visualization';
        staging.setAttribute('data-visconnect-local', '');
        staging.setAttribute('aria-hidden', 'true');
        staging.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
        // Container-sized specs need the same available width as the visible plot.
        staging.style.width = `${target.getBoundingClientRect().width}px`;
        staging.style.height = `${target.getBoundingClientRect().height}px`;
        document.body.appendChild(staging);
        let committed = false;
        try {
            const renderSpec = panelLayout
                ? { ...spec, width: target.clientWidth, height: target.clientHeight, autosize: { type: 'fit', contains: 'padding' } }
                : spec;
            const result = await vegaEmbed(staging, renderSpec, { actions: false, renderer: 'svg' });
            if (!chart.isConnected || chart.renderVersion !== version) {
                result.view.finalize();
                return;
            }
            staging.removeAttribute('style');
            staging.removeAttribute('aria-hidden');
            staging.removeAttribute('data-visconnect-local');
            const previousView = chart.vegaView;
            target.replaceWith(staging);
            chart.vegaView = result.view;
            chart.renderedSpec = specKey;
            chart.renderedLayout = panelLayout;
            chart.panelFits = panelFits;
            committed = true;
            previousView?.finalize();
            chart.resizeObserver ||= new ResizeObserver(() => resizeChartVisualization(chart));
            chart.resizeObserver.disconnect();
            chart.resizeObserver.observe(staging);
            await resizeChartVisualization(chart);
        } catch (error) {
            if (!chart.isConnected || chart.renderVersion !== version) return;
            chart.requestedSpec = null;
            if (chart.vegaView) {
                notifyBoard(`Error rendering chart: ${error.message}`);
                return;
            }
            const notice = document.createElement('p');
            notice.className = 'chart-error';
            notice.textContent = `Error rendering chart: ${error.message}`;
            target.replaceChildren(notice);
        } finally {
            if (!committed) staging.remove();
        }
    }).catch(error => console.error('Chart rendering failed:', error));
    return chart.renderQueue;
}
