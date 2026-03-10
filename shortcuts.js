/**
 * shortcuts.js — Global keyboard shortcuts
 */

function initShortcuts() {
    document.addEventListener('keydown', e => {
        // Ignore if typing in an input / textarea
        const tag = document.activeElement.tagName;
        const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

        // Shift = snap toggle (held)
        if (e.key === 'Shift') {
            if (!snapEnabled) toggleSnapping();
        }

        // Undo/Redo
        if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); undoAction(); return; }
        if (e.ctrlKey && e.key === 'y')                  { e.preventDefault(); redoAction(); return; }
        if (e.ctrlKey && e.shiftKey && e.key === 'Z')    { e.preventDefault(); redoAction(); return; }

        // Duplicate
        if (e.ctrlKey && e.key === 'd') { e.preventDefault();
            if (typeof duplicateMultiSelected === 'function' && multiSelected && multiSelected.size > 1) {
                duplicateMultiSelected();
            } else {
                duplicateSelected();
            }
            return; }

        // Save
        if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveScene(); return; }

        // History
        if (e.ctrlKey && e.key === 'h') { e.preventDefault(); openModal('modal-history'); return; }
        if (e.ctrlKey && e.key === 'e') { e.preventDefault(); openScriptEditorForSelected(); return; }
        if (e.ctrlKey && e.key === 'p') { e.preventDefault(); playScene(); return; }
        if (e.ctrlKey && e.key === '.') { e.preventDefault(); stopScene(); return; }

        if (inInput) return;

        // Tool shortcuts
        switch (e.key) {
            case 'w': case 'W':
                activateTool('move', 'translate'); break;
            case 'e': case 'E':
                activateTool('rotate', 'rotate'); break;
            case 'r': case 'R':
                activateTool('scale', 'scale'); break;
            case 'q': case 'Q':
                document.querySelectorAll('#transform-tools .tool-btn').forEach(b => b.classList.remove('active'));
                document.getElementById('tool-select').classList.add('active');
                transformControls.detach();
                break;
            case 'f': case 'F':
                focusSelected(); break;
            case 'g': case 'G':
                if (typeof groupMultiSelected === 'function') groupMultiSelected(); break;
            case 'Delete': case 'Backspace':
                if (typeof deleteMultiSelected === 'function' && multiSelected && multiSelected.size > 1) {
                    deleteMultiSelected();
                } else {
                    deleteSelected();
                }
                break;
            case 'Escape':
                // Close any open modal
                document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
                selectObject(null);
                break;
        }
    });

    document.addEventListener('keyup', e => {
        if (e.key === 'Shift' && snapEnabled) {
            toggleSnapping();
        }
    });
}

function activateTool(btnSuffix, mode) {
    document.querySelectorAll('#transform-tools .tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tool-${btnSuffix}`);
    if (btn) btn.classList.add('active');
    if (selectedObject) transformControls.attach(selectedObject.object);
    transformControls.setMode(mode);
}
