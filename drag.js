function getElementPosition(element) {
    const transform = window.getComputedStyle(element).transform;
    if (transform === 'none') return { x: 0, y: 0 };
    const matrix = new DOMMatrixReadOnly(transform);
    return { x: matrix.m41, y: matrix.m42 };
}
function makeDraggable(element) {
    element.addEventListener('mousedown', event => {
        if (event.button !== 0 || event.target.closest('button, a, input, textarea, .comment-popover')) return;
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
