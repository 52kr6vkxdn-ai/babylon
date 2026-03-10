/**
 * resizers.js — Draggable panel resizers
 */

function initResizers() {
    const resizerLC = document.getElementById('resizer-l-c');
    const resizerCR = document.getElementById('resizer-c-r');
    const resizerMB = document.getElementById('resizer-m-b');

    const panelLeft   = document.getElementById('panel-left');
    const panelRight  = document.getElementById('panel-right');
    const mainPanels  = document.getElementById('main-panels');
    const panelBottom = document.getElementById('panel-bottom');

    let isResizing = false;
    let currentResizer = null;

    const startResize = (resizerId) => {
        isResizing = true;
        currentResizer = resizerId;
        document.getElementById(resizerId).classList.add('active');
        document.body.style.cursor = resizerId === 'resizer-m-b' ? 'row-resize' : 'col-resize';
        document.body.style.pointerEvents = 'none';
    };

    resizerLC.addEventListener('mousedown', () => startResize('resizer-l-c'));
    resizerCR.addEventListener('mousedown', () => startResize('resizer-c-r'));
    resizerMB.addEventListener('mousedown', () => startResize('resizer-m-b'));

    document.addEventListener('mousemove', e => {
        if (!isResizing) return;

        if (currentResizer === 'resizer-l-c') {
            const w = e.clientX;
            if (w > 140 && w < window.innerWidth * 0.38) panelLeft.style.width = w + 'px';

        } else if (currentResizer === 'resizer-c-r') {
            const w = window.innerWidth - e.clientX;
            if (w > 180 && w < window.innerWidth * 0.42) panelRight.style.width = w + 'px';

        } else if (currentResizer === 'resizer-m-b') {
            const statusH = 20;
            const newH = window.innerHeight - e.clientY - statusH;
            if (newH > 80 && newH < window.innerHeight * 0.55) {
                panelBottom.style.height = newH + 'px';
                mainPanels.style.height  = `calc(100% - ${newH + 4}px)`;
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        document.getElementById(currentResizer).classList.remove('active');
        isResizing = false;
        currentResizer = null;
        document.body.style.cursor = '';
        document.body.style.pointerEvents = '';
        resizeMainRenderer();
    });
}
