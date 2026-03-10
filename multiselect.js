/**
 * multiselect.js — Shift+click multi-select system
 *
 * - Shift+click in viewport OR hierarchy adds/removes objects from selection
 * - Multi-selection shows count in inspector; transform gizmo attaches to first
 * - Delete: removes all selected
 * - G key: groups all selected into a new Empty parent
 * - Ctrl+A: select all
 * - Duplicate: duplicates all selected
 * - Selection highlight: outline effect via emissive overlay
 */

let multiSelected = new Set(); // Set of engineObject ids
const MULTI_EMISSIVE_COLOR = new THREE.Color(0x2255ff);
const MULTI_EMISSIVE_INTENSITY = 0.25;

// ─── Add/Remove from multi-select ────────────────────────────────────────────
function multiSelectToggle(entry) {
    if (!entry) return;
    if (multiSelected.has(entry.id)) {
        multiSelected.delete(entry.id);
        clearMultiHighlight(entry);
    } else {
        multiSelected.add(entry.id);
        applyMultiHighlight(entry);
    }
    updateMultiSelectUI();
}

function multiSelectAdd(entry) {
    if (!entry || multiSelected.has(entry.id)) return;
    multiSelected.add(entry.id);
    applyMultiHighlight(entry);
    updateMultiSelectUI();
}

function clearMultiSelect() {
    multiSelected.forEach(id => {
        const entry = engineObjects.find(o => o.id === id);
        if (entry) clearMultiHighlight(entry);
    });
    multiSelected.clear();
    updateMultiSelectUI();
}

function getMultiSelected() {
    return Array.from(multiSelected)
        .map(id => engineObjects.find(o => o.id === id))
        .filter(Boolean);
}

// ─── Visual highlight ─────────────────────────────────────────────────────────
function applyMultiHighlight(entry) {
    if (!entry.object.isMesh) return;
    const mat = entry.object.material;
    entry.object.userData._prevEmissive = mat.emissive ? mat.emissive.clone() : new THREE.Color(0);
    entry.object.userData._prevEmissiveIntensity = mat.emissiveIntensity || 0;
    mat.emissive = MULTI_EMISSIVE_COLOR.clone();
    mat.emissiveIntensity = MULTI_EMISSIVE_INTENSITY;
}

function clearMultiHighlight(entry) {
    if (!entry.object.isMesh) return;
    const mat = entry.object.material;
    mat.emissive = entry.object.userData._prevEmissive || new THREE.Color(0);
    mat.emissiveIntensity = entry.object.userData._prevEmissiveIntensity || 0;
}

// ─── UI Update ────────────────────────────────────────────────────────────────
function updateMultiSelectUI() {
    const count = multiSelected.size;
    const badge = document.getElementById('multi-select-badge');
    const bar   = document.getElementById('multi-select-bar');

    if (badge) {
        badge.textContent = count > 0 ? `${count} selected` : '';
        badge.classList.toggle('hidden', count === 0);
    }
    if (bar) {
        bar.classList.toggle('hidden', count < 2);
        if (count >= 2) {
            document.getElementById('multi-count-label').textContent = `${count} objects selected`;
        }
    }

    // Re-render hierarchy (it reads multiSelected)
    updateHierarchyUI();
}

// ─── Multi-select Actions ─────────────────────────────────────────────────────
function deleteMultiSelected() {
    if (multiSelected.size === 0) { deleteSelected(); return; }
    const ids = Array.from(multiSelected);
    const names = ids.map(id => engineObjects.find(o => o.id === id)?.name).filter(Boolean);
    recordHistory(`Delete ${names.length} objects`);
    ids.forEach(id => {
        const entry = engineObjects.find(o => o.id === id);
        if (!entry) return;
        clearMultiHighlight(entry);
        selectObject(entry);
        deleteSelected();
    });
    multiSelected.clear();
    updateMultiSelectUI();
    logConsole(`Deleted ${names.length} objects.`, 'warn');
}

function duplicateMultiSelected() {
    if (multiSelected.size === 0) { duplicateSelected(); return; }
    const entries = getMultiSelected();
    const newIds = [];
    entries.forEach(entry => {
        selectObject(entry);
        duplicateSelected();
        const newest = engineObjects[engineObjects.length - 1];
        if (newest) newIds.push(newest.id);
    });
    // Re-select the new duplicates
    clearMultiSelect();
    newIds.forEach(id => {
        const entry = engineObjects.find(o => o.id === id);
        if (entry) multiSelectAdd(entry);
    });
    logConsole(`Duplicated ${entries.length} objects.`, 'info');
}

function groupMultiSelected() {
    const entries = getMultiSelected();
    if (entries.length < 2) { logConsole('Select 2+ objects to group.', 'warn'); return; }

    // Create new Empty at centroid
    const centroid = new THREE.Vector3();
    entries.forEach(e => {
        const wp = new THREE.Vector3();
        e.object.getWorldPosition(wp);
        centroid.add(wp);
    });
    centroid.divideScalar(entries.length);

    const groupEntry = createEngineObject('Group', 'Empty', false);
    groupEntry.object.position.copy(centroid);

    entries.forEach(entry => {
        setParent(entry.id, groupEntry.id);
    });

    clearMultiSelect();
    selectObject(groupEntry);
    recordHistory(`Group ${entries.length} objects`);
    logConsole(`Grouped ${entries.length} objects into "${groupEntry.name}".`, 'success');
}

function selectAllObjects() {
    clearMultiSelect();
    engineObjects.forEach(entry => multiSelectAdd(entry));
    if (engineObjects.length > 0) selectObject(engineObjects[0]);
    logConsole(`Selected all ${engineObjects.length} objects.`, 'info');
}

// ─── Move all selected together (called on transform end) ─────────────────────
function translateMultiSelected(dx, dy, dz) {
    getMultiSelected().forEach(entry => {
        entry.object.position.x += dx;
        entry.object.position.y += dy;
        entry.object.position.z += dz;
    });
}

// ─── Patch onPointerDown for shift-click multi-select ────────────────────────
// We wrap the existing onPointerDown in engine.js
function initMultiSelect() {
    // The engine.js onPointerDown will call handlePointerDownMulti
    logConsole('Multi-select ready. Shift+click to add to selection.', 'info');
}

function handlePointerDownMulti(event, foundEntry) {
    if (event.shiftKey) {
        if (foundEntry) {
            // Add primary selection to multiSelected first
            if (selectedObject && !multiSelected.has(selectedObject.id)) {
                multiSelectAdd(selectedObject);
            }
            multiSelectToggle(foundEntry);
            // Keep primary selectedObject
            if (multiSelected.size > 0 && !selectedObject) {
                selectedObject = foundEntry;
            }
        }
        return true; // handled
    }
    // Normal click — clear multi-select
    if (multiSelected.size > 0) clearMultiSelect();
    return false;
}
