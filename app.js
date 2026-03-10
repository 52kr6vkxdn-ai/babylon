/**
 * app.js — Entry point for Forge3D v0.3
 */

let ambientLight;
let statsOverlayVisible = false;

function initApp() {
    initThree();
    initQuadViews();
    initScriptInput();
    initScriptEditor();
    initUI();
    initResizers();
    initShortcuts();
    initMultiSelect();
    renderSnippets();
    buildAPIReference();
    // Init PostFX (async, non-blocking)
    initPostFX().catch(e => logConsole('PostFX init failed: ' + e.message, 'warn'));
    recordHistory('Scene opened');
    animate();
    logConsole('Welcome to Forge3D v0.4', 'success');
    logConsole('Physics: Add "Rigidbody" component to objects, then ▶ Play.', 'info');
    logConsole('Shift+click objects to multi-select. G to group.', 'info');
}

// ─── Script editor helpers (called from HTML) ─────────────────────────────────
function openScriptEditorForSelected() {
    if (!selectedObject) { logConsole('Select an object first.', 'warn'); return; }
    openScriptEditor(selectedObject);
}

function saveAndPlay() {
    closeScriptEditor(true);
    setTimeout(() => playScene(), 80);
}

function insertTemplate(type) {
    const templates = {
        rotate: `  transform.rotate(0, 90 * dt, 0);\n`,
        color:  `  material.setColor(\`hsl(\${(time.now*60)%360},80%,60%)\`);\n`,
        move:   `  if(input.isKeyDown('arrowleft'))  transform.translate(-3*dt,0,0);\n  if(input.isKeyDown('arrowright')) transform.translate(3*dt,0,0);\n  if(input.isKeyDown('arrowup'))    transform.translate(0,0,-3*dt);\n  if(input.isKeyDown('arrowdown'))  transform.translate(0,0,3*dt);\n`,
    };
    if (templates[type]) insertAtCursor(templates[type]);
}

function switchSidebarTab(tab, btn) {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('sidebar-api').classList.toggle('hidden', tab !== 'api');
    document.getElementById('sidebar-snippets').classList.toggle('hidden', tab !== 'snippets');
}

function clearConsole() {
    const el = document.getElementById('tab-console');
    if (el) el.innerHTML = '';
}

function selectAll() {
    selectAllObjects();
}

function exportScripts() {
    const scripts = engineObjects.filter(o => o.script && o.script.trim());
    if (!scripts.length) { logConsole('No scripts to export.', 'warn'); return; }
    let out = `// Forge3D Exported Scripts — ${new Date().toISOString()}\n\n`;
    scripts.forEach(o => { out += `// ── ${o.name} (${o.type}) ──\n${o.script}\n\n`; });
    const blob = new Blob([out], { type: 'text/javascript' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'scripts.js'; a.click();
    logConsole(`Exported ${scripts.length} scripts.`, 'success');
}

// ─── Scene Settings ───────────────────────────────────────────────────────────
function updateAmbient() {
    if (!ambientLight) return;
    ambientLight.color.set(document.getElementById('scene-ambient-color').value);
    ambientLight.intensity = parseFloat(document.getElementById('scene-ambient-intensity').value);
}

function toggleSceneFog(enabled) { enabled ? updateFog() : (scene.fog = null); }

function updateFog() {
    scene.fog = new THREE.Fog(
        document.getElementById('scene-fog-color').value,
        parseFloat(document.getElementById('scene-fog-near').value) || 20,
        parseFloat(document.getElementById('scene-fog-far').value)  || 100
    );
}

function updateGrid() {
    const size = parseInt(document.getElementById('scene-grid-size').value) || 30;
    scene.remove(gridHelper);
    gridHelper = new THREE.GridHelper(size, size, 0x3a3a3a, 0x2a2a2a);
    scene.add(gridHelper);
}

// ─── Stats HUD ────────────────────────────────────────────────────────────────
function toggleStatsOverlay() {
    statsOverlayVisible = !statsOverlayVisible;
    document.getElementById('stats-canvas').classList.toggle('hidden', !statsOverlayVisible);
    logConsole(`Stats HUD: ${statsOverlayVisible ? 'ON' : 'OFF'}`, 'info');
}

function drawSceneStats() {
    if (!statsOverlayVisible) return;
    const canvas = document.getElementById('stats-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 200, 120);
    const info = renderer.info;
    const lines = [
        ['FPS',    `${currentFps}`],
        ['Draws',  `${info.render.calls}`],
        ['Tris',   `${info.render.triangles.toLocaleString()}`],
        ['Objects',`${engineObjects.length}`],
        ['Scripts',`${Object.keys(scriptInstances).length} ${isPlaying?'▶':''}`],
        ['Mem',    `${(120 + engineObjects.length*2).toFixed(0)}MB`],
    ];
    ctx.font = '10px monospace';
    lines.forEach(([label, val], i) => {
        ctx.fillStyle = '#5a8ec0';
        ctx.fillText(label, 8, 16 + i * 17);
        ctx.fillStyle = '#e0e0e8';
        ctx.fillText(val, 72, 16 + i * 17);
    });
}

// ─── Tag System ───────────────────────────────────────────────────────────────
let globalTags = ['Player','Enemy','Collectible','Terrain','Trigger','UI','Static'];

function addTagToSelected() {
    if (!selectedObject) return;
    updateTagManagerUI();
    openModal('modal-tags');
}

function updateTagManagerUI() {
    const list = document.getElementById('tag-list');
    if (!list) return;
    list.innerHTML = '';
    globalTags.forEach(tag => {
        const has = selectedObject && (selectedObject.tags || []).includes(tag);
        const el = document.createElement('div');
        el.className = 'comp-item';
        el.innerHTML = `<div class="comp-item-icon" style="${has ? 'background:rgba(74,158,255,.25);' : ''}"><i class="fas fa-tag" style="color:${has ? 'var(--accent-color)' : 'var(--text-inactive)'}"></i></div>
            <div class="comp-item-info"><div class="comp-item-name">${tag}</div></div>
            <button class="small-btn" style="${has ? 'border-color:var(--accent-color);color:var(--accent-color);' : ''}">${has ? 'Remove' : 'Add'}</button>`;
        el.querySelector('button').onclick = () => {
            if (!selectedObject) return;
            selectedObject.tags = selectedObject.tags || [];
            if (has) selectedObject.tags = selectedObject.tags.filter(t => t !== tag);
            else selectedObject.tags.push(tag);
            updateTagManagerUI();
            updateTagsInspector();
        };
        list.appendChild(el);
    });
}

function createGlobalTag() {
    const input = document.getElementById('new-tag-input');
    const name = input.value.trim();
    if (!name || globalTags.includes(name)) return;
    globalTags.push(name);
    input.value = '';
    updateTagManagerUI();
    logConsole(`Tag "${name}" created.`, 'info');
}

function updateTagsInspector() {
    const list = document.getElementById('insp-tags-list');
    if (!list || !selectedObject) return;
    list.innerHTML = '';
    (selectedObject.tags || []).forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.innerHTML = `${tag}<span class="tag-x" onclick="removeTagFromSelected('${tag}')">✕</span>`;
        list.appendChild(chip);
    });
}

function removeTagFromSelected(tag) {
    if (!selectedObject) return;
    selectedObject.tags = (selectedObject.tags || []).filter(t => t !== tag);
    updateTagsInspector();
}

window.addEventListener('load', initApp);
