async function copyChartCode(spec) {
    const code = JSON.stringify(spec, null, 2);
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        return;
    }
    const input = document.createElement('textarea');
    input.value = code;
    input.setAttribute('data-visconnect-local', '');
    input.style.cssText = 'position:fixed;left:-10000px;top:0';
    document.body.appendChild(input);
    const focused = document.activeElement;
    try {
        input.select();
        if (!document.execCommand('copy')) throw new Error('Clipboard access is unavailable.');
    } finally {
        input.remove();
        focused?.focus();
    }
}

async function downloadChartImage(spec, format) {
    // An isolated view exports the captured version even if a newer annotation arrives.
    const target = document.createElement('div');
    target.setAttribute('data-visconnect-local', '');
    target.setAttribute('aria-hidden', 'true');
    target.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none';
    document.body.appendChild(target);
    let view;
    let objectURL;
    let link;
    try {
        ({ view } = await vegaEmbed(target, spec, { actions: false, renderer: 'svg' }));
        const url = format === 'svg'
            ? (objectURL = URL.createObjectURL(new Blob([await view.toSVG()], { type: 'image/svg+xml;charset=utf-8' })))
            : await view.toImageURL('png', 2);
        link = document.createElement('a');
        link.href = url;
        const title = String(chartTitle(spec, 'visualization')).replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'visualization';
        link.download = `${title}.${format}`;
        link.setAttribute('data-visconnect-local', '');
        document.body.appendChild(link);
        link.click();
    } finally {
        view?.finalize();
        target.remove();
        link?.remove();
        if (objectURL) setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
    }
}

async function shareChartVersion(spec, action) {
    if (!spec) return;
    try {
        if (action === 'copy-code') {
            await copyChartCode(spec);
            notifyBoard('Code copied to clipboard.');
        } else {
            await downloadChartImage(spec, action === 'download-svg' ? 'svg' : 'png');
        }
    } catch (error) {
        notifyBoard(`Could not share visualization: ${error.message}`);
    }
}
