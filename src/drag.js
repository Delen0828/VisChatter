function getElementPosition(element) {
    const transform = window.getComputedStyle(element).transform;
    if (transform === 'none') return { x: 0, y: 0 };
    const matrix = new DOMMatrixReadOnly(transform);
    return { x: matrix.m41, y: matrix.m42 };
}
const CHART_MIN_WIDTH = 240;
const CHART_MIN_HEIGHT = 180;

function chartResizeEdge(element, event) {
    if (event.target.closest('button, a, input, textarea, .comment-popover')) return '';
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return '';
    const vertical = y <= 8 ? 'n' : y >= rect.height - 8 ? 's' : '';
    const horizontal = x <= 8 ? 'w' : x >= rect.width - 8 ? 'e' : '';
    return vertical + horizontal;
}

function chartResizeBounds(start, edge, dx, dy) {
    const right = start.x + start.width;
    const bottom = start.y + start.height;
    const x = edge.includes('w') ? Math.max(0, Math.min(start.x + dx, right - CHART_MIN_WIDTH)) : start.x;
    const y = edge.includes('n') ? Math.max(0, Math.min(start.y + dy, bottom - CHART_MIN_HEIGHT)) : start.y;
    const width = edge.includes('w') ? right - x : edge.includes('e') ? Math.max(CHART_MIN_WIDTH, start.width + dx) : start.width;
    const height = edge.includes('n') ? bottom - y : edge.includes('s') ? Math.max(CHART_MIN_HEIGHT, start.height + dy) : start.height;
    return { x, y, width, height };
}

function applyChartSize(element, bounds) {
    element.style.width = `${bounds.width}px`;
    element.style.height = `${bounds.height}px`;
    element.style.transform = `translate3d(${bounds.x}px, ${bounds.y}px, 0)`;
    element.classList.add('resized');
    resizeChartVisualization(element);
}

function startChartResize(element, event, edge) {
    event.preventDefault();
    const container = element.parentElement;
    const rect = element.getBoundingClientRect();
    const start = { ...getElementPosition(element), width: rect.width, height: rect.height };
    const initialX = event.clientX + container.scrollLeft;
    const initialY = event.clientY + container.scrollTop;
    let bounds = start;
    let frame;
    const publish = () => boardEvent('chart-resize', { visId: element.id, ...bounds });
    const onMove = event => {
        if (!element.isConnected) { onUp(); return; }
        bounds = chartResizeBounds(start, edge, event.clientX + container.scrollLeft - initialX, event.clientY + container.scrollTop - initialY);
        applyChartSize(element, bounds);
        if (!frame) frame = requestAnimationFrame(() => { frame = null; publish(); });
    };
    const onUp = () => {
        if (frame) cancelAnimationFrame(frame);
        if (element.isConnected && bounds !== start) publish();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        window.removeEventListener('blur', onUp);
        document.body.classList.remove('chart-resizing');
        document.body.style.removeProperty('--chart-resize-cursor');
        element.style.cursor = '';
        element.cancelResize = null;
    };
    selectChart(element);
    element.cancelResize = onUp;
    document.body.style.setProperty('--chart-resize-cursor', `${edge}-resize`);
    document.body.classList.add('chart-resizing');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp);
}

function makeDraggable(element) {
    element.addEventListener('mousemove', event => {
        if (document.body.classList.contains('chart-resizing') || element.classList.contains('dragging')) return;
        const edge = chartResizeEdge(element, event);
        element.style.cursor = edge ? `${edge}-resize` : '';
    });
    element.addEventListener('mouseleave', () => { element.style.cursor = ''; });
    element.addEventListener('mousedown', event => {
        if (event.button !== 0 || event.target.closest('button, a, input, textarea, .comment-popover')) return;
        const edge = chartResizeEdge(element, event);
        if (edge) { startChartResize(element, event, edge); return; }
        const container = element.parentElement;
        const start = getElementPosition(element);
        const initialX = event.clientX + container.scrollLeft;
        const initialY = event.clientY + container.scrollTop;
        let position = start;
        let frame;
        const onMove = event => {
            const x = Math.max(0, start.x + event.clientX + container.scrollLeft - initialX);
            const y = Math.max(0, start.y + event.clientY + container.scrollTop - initialY);
            element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            position = { x, y };
            if (!frame) frame = requestAnimationFrame(() => {
                frame = null;
                boardEvent('chart-move', { visId: element.id, ...position });
            });
        };
        const onUp = () => {
            if (frame) cancelAnimationFrame(frame);
            if (position !== start) boardEvent('chart-move', { visId: element.id, ...position });
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            element.classList.remove('dragging');
        };
        selectChart(element);
        element.classList.add('dragging');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
document.body.addEventListener('chart-move', event => {
    const { visId, x, y } = event.detail;
    const chart = document.getElementById(visId);
    if (chart && Number.isFinite(x) && Number.isFinite(y)) chart.style.transform = `translate3d(${Math.max(0, x)}px, ${Math.max(0, y)}px, 0)`;
});
document.body.addEventListener('chart-resize', event => {
    const { visId, x, y, width, height } = event.detail;
    const chart = document.getElementById(visId);
    if (chart && [x, y, width, height].every(Number.isFinite) && width >= CHART_MIN_WIDTH && height >= CHART_MIN_HEIGHT) {
        applyChartSize(chart, { x: Math.max(0, x), y: Math.max(0, y), width, height });
    }
});
function selectChart(element) {
    document.querySelectorAll('.draggable-chart').forEach(chart => chart.classList.toggle('selected', chart === element));
}
function makeSelectable(element) {
    element.addEventListener('click', event => {
        if (!event.target.closest('button, .comment-popover')) selectChart(element);
    });
}
document.getElementById('vis-container').addEventListener('click', event => {
    if (!event.target.closest('.draggable-chart')) {
        document.querySelectorAll('.draggable-chart').forEach(chart => chart.classList.remove('selected'));
    }
});
