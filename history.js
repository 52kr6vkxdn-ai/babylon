/**
 * history.js — Undo/Redo command history stack
 * Strategy: snapshot-based (stores serialized state per action)
 */

let historyStack = [];   // array of { label, snapshot }
let historyIndex = -1;   // points to current state
const MAX_HISTORY = 80;

// ─── Snapshot ─────────────────────────────────────────────────────────────────
function takeSnapshot() {
    return JSON.stringify(engineObjects.map(o => ({
        id:         o.id,
        name:       o.name,
        type:       o.type,
        parentId:   o.parentId,
        children:   [...o.children],
        components: JSON.parse(JSON.stringify(o.components)),
        position:   o.object.position.toArray(),
        rotation:   [o.object.rotation.x, o.object.rotation.y, o.object.rotation.z],
        scale:      o.object.scale.toArray(),
        color:      (o.object.isMesh && o.object.material && o.object.material.color)
                        ? '#' + o.object.material.color.getHexString() : null,
        roughness:  o.object.isMesh && o.object.material ? o.object.material.roughness : null,
        metalness:  o.object.isMesh && o.object.material ? o.object.material.metalness : null,
        lightColor: (o.object.isLight) ? '#' + o.object.color.getHexString() : null,
        intensity:  (o.object.isLight) ? o.object.intensity : null,
    })));
}

function restoreSnapshot(snapshot) {
    const data = JSON.parse(snapshot);

    // Remove all current objects from scene
    engineObjects.forEach(o => {
        if (o.object.userData.helper) scene.remove(o.object.userData.helper);
        o.object.parent && o.object.parent.remove(o.object);
    });
    engineObjects = [];

    // Rebuild
    data.forEach(d => {
        const entry = createEngineObject(d.name, d.type, false, null);
        // Override generated id to match saved id
        entry.id = d.id;
        entry.object.userData.engineId = d.id;
        entry.parentId = d.parentId;
        entry.children = d.children;
        entry.components = d.components;

        entry.object.position.fromArray(d.position);
        entry.object.rotation.set(...d.rotation);
        entry.object.scale.fromArray(d.scale);

        if (d.color && entry.object.isMesh && entry.object.material) {
            entry.object.material.color.set(d.color);
            if (d.roughness != null) entry.object.material.roughness = d.roughness;
            if (d.metalness != null) entry.object.material.metalness = d.metalness;
        }
        if (d.lightColor && entry.object.isLight) {
            entry.object.color.set(d.lightColor);
            entry.object.intensity = d.intensity;
        }
    });

    // Re-parent scene graph
    data.forEach(d => {
        if (d.parentId) {
            const child  = engineObjects.find(o => o.id === d.id);
            const parent = engineObjects.find(o => o.id === d.parentId);
            if (child && parent) {
                scene.remove(child.object);
                parent.object.add(child.object);
                child.parentId = d.parentId;
            }
        }
    });

    selectObject(null);
    updateHierarchyUI();
    updateStatusBar();
    updateHistoryUI();
}

// ─── Record ───────────────────────────────────────────────────────────────────
function recordHistory(label) {
    // Trim redo branch
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }
    historyStack.push({ label, snapshot: takeSnapshot() });
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
    historyIndex = historyStack.length - 1;
    updateHistoryUI();
    updateUndoRedoBtns();
}

// ─── Undo / Redo ──────────────────────────────────────────────────────────────
function undoAction() {
    if (historyIndex <= 0) return;
    historyIndex--;
    restoreSnapshot(historyStack[historyIndex].snapshot);
    logConsole(`Undo: ${historyStack[historyIndex + 1].label}`, 'info');
    updateUndoRedoBtns();
}

function redoAction() {
    if (historyIndex >= historyStack.length - 1) return;
    historyIndex++;
    restoreSnapshot(historyStack[historyIndex].snapshot);
    logConsole(`Redo: ${historyStack[historyIndex].label}`, 'info');
    updateUndoRedoBtns();
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function updateHistoryUI() {
    const lists = [
        document.getElementById('history-list'),
        document.getElementById('modal-history-list')
    ];
    lists.forEach(list => {
        if (!list) return;
        list.innerHTML = '';
        historyStack.forEach((entry, i) => {
            const el = document.createElement('div');
            el.className = `history-entry ${i === historyIndex ? 'current' : i > historyIndex ? 'future' : ''}`;
            const icon = i === historyIndex ? 'fa-circle' : i > historyIndex ? 'fa-circle-o' : 'fa-check';
            el.innerHTML = `<i class="fas ${icon}"></i> ${entry.label}`;
            el.onclick = () => jumpToHistory(i);
            list.prepend(el); // newest on top
        });
        if (historyStack.length === 0) {
            list.innerHTML = '<div class="empty-state">No history yet.</div>';
        }
    });
}

function jumpToHistory(index) {
    if (index < 0 || index >= historyStack.length) return;
    historyIndex = index;
    restoreSnapshot(historyStack[historyIndex].snapshot);
    logConsole(`Jumped to: ${historyStack[historyIndex].label}`, 'info');
    updateUndoRedoBtns();
}

function updateUndoRedoBtns() {
    const undo = document.getElementById('btn-undo');
    const redo = document.getElementById('btn-redo');
    if (undo) undo.disabled = historyIndex <= 0;
    if (redo) redo.disabled = historyIndex >= historyStack.length - 1;
}
