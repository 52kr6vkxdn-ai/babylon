/**
 * viewport.js — Quad-view cameras/renderers, axis gizmo canvas, shading toggle
 */

// ─── Quad View ────────────────────────────────────────────────────────────────
function initQuadViews() {
    const makeOrtho = (pos, up, zoom = 5) => {
        const cam = new THREE.OrthographicCamera(-zoom, zoom, zoom, -zoom, 0.1, 1000);
        cam.position.set(...pos);
        cam.lookAt(0, 0, 0);
        if (up) cam.up.set(...up);
        return cam;
    };

    camTop   = makeOrtho([0, 20, 0], [0, 0, -1]);
    camFront = makeOrtho([0, 0, 20]);
    camSide  = makeOrtho([20, 0, 0]);

    const make2DRenderer = (containerId) => {
        const el = document.getElementById(containerId);
        if (!el) return null;
        const r = new THREE.WebGLRenderer({ antialias: true });
        r.setPixelRatio(window.devicePixelRatio);
        r.setSize(el.clientWidth || 300, el.clientHeight || 200);
        el.appendChild(r.domElement);
        const ro = new ResizeObserver(() => {
            r.setSize(el.clientWidth, el.clientHeight);
        });
        ro.observe(el);
        return r;
    };

    rendererTop   = make2DRenderer('canvas-top');
    rendererFront = make2DRenderer('canvas-front');
    rendererSide  = make2DRenderer('canvas-side');
}

function renderQuadViews() {
    if (!quadMode) return;
    if (rendererTop)   rendererTop.render(scene, camTop);
    if (rendererFront) rendererFront.render(scene, camFront);
    if (rendererSide)  rendererSide.render(scene, camSide);
}

function setViewportMode(mode) {
    quadMode = (mode === 'quad');

    const wrapper = document.getElementById('viewport-wrapper');
    const quadPanes = document.querySelectorAll('.quad-pane');
    const mainPane  = document.getElementById('viewport-main');
    const btn = document.getElementById('toggle-quad');

    if (quadMode) {
        wrapper.classList.remove('single-view');
        wrapper.classList.add('quad-view');
        quadPanes.forEach(p => p.classList.remove('hidden'));
        mainPane.style.width  = '50%';
        mainPane.style.height = '50%';
        if (btn) btn.classList.add('active');
        document.getElementById('stat-mode').innerText = 'Quad View';
    } else {
        wrapper.classList.add('single-view');
        wrapper.classList.remove('quad-view');
        quadPanes.forEach(p => p.classList.add('hidden'));
        mainPane.style.width  = '';
        mainPane.style.height = '';
        if (btn) btn.classList.remove('active');
        document.getElementById('stat-mode').innerText = 'Perspective';
    }

    resizeMainRenderer();
    logConsole(`Viewport: ${quadMode ? 'Quad' : 'Single'} view.`, 'info');
}

function initQuadToggle() {
    document.getElementById('toggle-quad').addEventListener('click', () => {
        setViewportMode(quadMode ? 'single' : 'quad');
    });

    document.getElementById('overlay-shading').addEventListener('change', e => {
        const wf = e.target.value === 'wireframe';
        engineObjects.forEach(o => {
            if (o.object.isMesh && o.object.material) {
                o.object.material.wireframe = wf;
            }
        });
    });
}

// ─── Axis Gizmo ───────────────────────────────────────────────────────────────
const GIZMO_AXES = [
    { dir: new THREE.Vector3(1, 0, 0), color: '#e05252', label: 'X' },
    { dir: new THREE.Vector3(0, 1, 0), color: '#52c552', label: 'Y' },
    { dir: new THREE.Vector3(0, 0, 1), color: '#5283e0', label: 'Z' },
];

function drawGizmo() {
    const canvas = document.getElementById('gizmo-canvas');
    if (!canvas || canvas.classList.contains('hidden')) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, r = W / 2 - 4;

    ctx.clearRect(0, 0, W, H);

    // Get camera rotation matrix
    const mat = new THREE.Matrix4().extractRotation(camera.matrixWorldInverse);

    // Project each axis
    const projected = GIZMO_AXES.map(ax => {
        const v = ax.dir.clone().applyMatrix4(mat);
        return { x: cx + v.x * (r - 12), y: cy - v.y * (r - 12), z: v.z, color: ax.color, label: ax.label };
    });

    // Sort by depth (back to front)
    projected.sort((a, b) => a.z - b.z);

    projected.forEach(ax => {
        // Negative axis (dim)
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - (ax.x - cx), cy - (ax.y - cy));
        ctx.strokeStyle = ax.color + '40';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Positive axis
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ax.x, ax.y);
        ctx.strokeStyle = ax.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Circle at tip
        ctx.beginPath();
        ctx.arc(ax.x, ax.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = ax.color;
        ctx.fill();

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ax.label, ax.x, ax.y);
    });

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#888';
    ctx.fill();
}

function initGizmoToggle() {
    document.getElementById('toggle-gizmo').addEventListener('click', e => {
        const canvas = document.getElementById('gizmo-canvas');
        e.currentTarget.classList.toggle('active');
        canvas.classList.toggle('hidden', !e.currentTarget.classList.contains('active'));
    });
}
