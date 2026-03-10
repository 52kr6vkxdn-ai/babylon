/**
 * ui.js — Hierarchy UI with parenting drag-and-drop, bottom tabs,
 *          context menu, toolbar tool buttons, inspector name binding
 */

// ─── Hierarchy ────────────────────────────────────────────────────────────────
let hierarchyExpanded = {};  // id -> bool
let draggedId = null;

function updateHierarchyUI() {
    const list = document.getElementById('hierarchy-list');
    list.innerHTML = '';

    // Build root-level items (no parent)
    const roots = engineObjects.filter(o => !o.parentId);
    roots.forEach(o => renderHierarchyItem(list, o, 0));
}

function renderHierarchyItem(container, obj, depth) {
    const hasChildren = obj.children && obj.children.length > 0;
    const expanded = hierarchyExpanded[obj.id] !== false;
    const isSelected = selectedObject && selectedObject.id === obj.id;
    const isMulti = typeof multiSelected !== 'undefined' && multiSelected.has(obj.id);

    const item = document.createElement('div');
    item.className = `hierarchy-item${isSelected ? ' selected' : ''}${isMulti && !isSelected ? ' multi-selected' : ''}`;
    item.style.paddingLeft = (18 + depth * 14) + 'px';
    item.setAttribute('draggable', 'true');
    item.dataset.id = obj.id;

    item.innerHTML = `<span class="hierarchy-toggle">${hasChildren ? (expanded ? '▾' : '▸') : ''}</span>
        <i class="fas ${getTypeIcon(obj.type)}" style="width:13px;text-align:center;font-size:11px;flex-shrink:0;"></i>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${obj.name}</span>
        ${obj.script && obj.script.trim() ? '<span class="hi-script-dot" title="Has script"></span>' : ''}
        ${obj.physics && obj.physics.enabled ? '<span class="hi-physics-dot" title="Has physics"></span>' : ''}
        <span class="hi-type">${obj.type}</span>`;

    item.onclick = (e) => {
        if (e.shiftKey && typeof handlePointerDownMulti === 'function') {
            if (selectedObject && !multiSelected.has(selectedObject.id)) {
                multiSelectAdd(selectedObject);
            }
            multiSelectToggle(obj);
            return;
        }
        if (typeof clearMultiSelect === 'function' && multiSelected.size > 0) clearMultiSelect();
        selectObject(obj);
    };

    item.querySelector('.hierarchy-toggle').onclick = e => {
        e.stopPropagation();
        hierarchyExpanded[obj.id] = !expanded;
        updateHierarchyUI();
    };

    // Drag-and-drop parenting
    item.addEventListener('dragstart', e => {
        draggedId = obj.id;
        e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', e => {
        e.preventDefault();
        item.classList.add('drop-target');
    });
    item.addEventListener('dragleave', () => item.classList.remove('drop-target'));
    item.addEventListener('drop', e => {
        e.preventDefault();
        item.classList.remove('drop-target');
        if (draggedId && draggedId !== obj.id) setParent(draggedId, obj.id);
        draggedId = null;
    });

    container.appendChild(item);

    if (hasChildren && expanded) {
        obj.children.forEach(cid => {
            const child = engineObjects.find(o => o.id === cid);
            if (child) renderHierarchyItem(container, child, depth + 1);
        });
    }
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
function initContextMenu() {
    const ctxMenu = document.getElementById('hierarchy-context');
    const panel   = document.getElementById('panel-left');

    panel.addEventListener('contextmenu', e => {
        e.preventDefault();
        ctxMenu.style.left = e.pageX + 'px';
        ctxMenu.style.top  = e.pageY + 'px';
        ctxMenu.classList.add('active');
    });

    document.addEventListener('click', e => {
        if (!ctxMenu.contains(e.target)) ctxMenu.classList.remove('active');
    });
}

// ─── Bottom Tabs ──────────────────────────────────────────────────────────────
function initBottomTabs() {
    document.querySelectorAll('#bottom-tabs .panel-tab').forEach(tab => {
        tab.addEventListener('click', e => {
            document.querySelectorAll('#bottom-tabs .panel-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const target = e.currentTarget.dataset.target;
            document.querySelectorAll('#panel-bottom .panel-content > div').forEach(d => d.classList.add('hidden'));
            document.getElementById(target).classList.remove('hidden');
        });
    });
}

// ─── Toolbar Tools ────────────────────────────────────────────────────────────
function initToolbarTools() {
    ['move', 'rotate', 'scale'].forEach(tool => {
        const btn = document.getElementById(`tool-${tool}`);
        if (!btn) return;
        btn.addEventListener('click', () => {
            document.querySelectorAll('#transform-tools .tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            transformControls.setMode(tool === 'move' ? 'translate' : tool);
        });
    });
    document.getElementById('tool-select').addEventListener('click', () => {
        document.querySelectorAll('#transform-tools .tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('tool-select').classList.add('active');
        transformControls.detach();
    });

    document.getElementById('toggle-grid').addEventListener('click', e => {
        e.currentTarget.classList.toggle('active');
        gridHelper.visible = e.currentTarget.classList.contains('active');
    });

    document.getElementById('toggle-snap').addEventListener('click', () => toggleSnapping());
    document.getElementById('btn-focus').addEventListener('click', () => focusSelected());
    document.getElementById('btn-undo').addEventListener('click', () => undoAction());
    document.getElementById('btn-redo').addEventListener('click', () => redoAction());
    document.getElementById('btn-duplicate').addEventListener('click', () => duplicateSelected());
    document.getElementById('btn-delete').addEventListener('click', () => deleteSelected());
}

// ─── Inspector Name ───────────────────────────────────────────────────────────
function initInspectorBindings() {
    document.getElementById('insp-name').addEventListener('change', e => {
        if (!selectedObject) return;
        selectedObject.name = e.target.value;
        selectedObject.object.name = e.target.value;
        recordHistory(`Rename to ${e.target.value}`);
        updateHierarchyUI();
    });

    ['pos','rot','scl'].forEach(t => {
        ['x','y','z'].forEach(a => {
            const el = document.getElementById(`${t}-${a}`);
            if (!el) return;
            el.addEventListener('input', applyInspectorToObject);
            el.addEventListener('blur', () => {
                if (selectedObject) recordHistory(`Transform ${selectedObject.name}`);
            });
            el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
        });
    });
}

// ─── Master UI Init ───────────────────────────────────────────────────────────
function initUI() {
    initToolbarTools();
    initContextMenu();
    initBottomTabs();
    initInspectorBindings();
    initQuadToggle();
    initGizmoToggle();
    updateUndoRedoBtns();
    renderComponentList();
    updatePrefabUI();
    logConsole('UI ready.', 'info');
}
