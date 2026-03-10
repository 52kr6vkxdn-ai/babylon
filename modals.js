/**
 * modals.js — Modal management + component system registry
 */

// ─── Modal Open/Close ─────────────────────────────────────────────────────────
function openModal(id) {
    document.getElementById(id).classList.add('active');
    // Sync history modal content
    if (id === 'modal-history') updateHistoryUI();
    if (id === 'modal-prefabs') updatePrefabUI();
    if (id === 'modal-components') renderComponentList();
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Close on overlay click
document.addEventListener('click', e => {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

// ─── Component Registry ───────────────────────────────────────────────────────
const COMPONENT_REGISTRY = [
    {
        category: 'Physics',
        items: [
            { name: 'Rigidbody',      desc: 'Adds physics simulation to the object.',   icon: 'fa-atom' },
            { name: 'Box Collider',   desc: 'Axis-aligned bounding box collider.',       icon: 'fa-square' },
            { name: 'Sphere Collider',desc: 'Spherical collision boundary.',             icon: 'fa-circle' },
        ]
    },
    {
        category: 'Rendering',
        items: [
            { name: 'LOD Group',      desc: 'Level of detail management.',              icon: 'fa-layer-group' },
            { name: 'Trail Renderer', desc: 'Renders a trail behind a moving object.',  icon: 'fa-wave-square' },
            { name: 'Particle System',desc: 'Emits and simulates particles.',           icon: 'fa-snowflake' },
        ]
    },
    {
        category: 'Scripting',
        items: [
            { name: 'Rotate',         desc: 'Continuously rotates the object.',         icon: 'fa-sync-alt' },
            { name: 'Follow Target',  desc: 'Follows a target transform.',              icon: 'fa-crosshairs' },
            { name: 'Oscillate',      desc: 'Oscillates position over time.',           icon: 'fa-wave-square' },
            { name: 'Billboard',      desc: 'Always faces the main camera.',            icon: 'fa-tv' },
        ]
    },
    {
        category: 'Audio',
        items: [
            { name: 'Audio Source',   desc: 'Plays audio clips at this position.',      icon: 'fa-volume-up' },
            { name: 'Audio Listener', desc: 'Receives audio from the scene.',           icon: 'fa-headphones' },
        ]
    },
    {
        category: 'Animation',
        items: [
            { name: 'Animator',       desc: 'Controls animation state machine.',        icon: 'fa-film' },
            { name: 'Blend Shape',    desc: 'Morphs between mesh shapes.',              icon: 'fa-sliders-h' },
        ]
    }
];

let filteredComponents = COMPONENT_REGISTRY;

function renderComponentList(query = '') {
    const list = document.getElementById('component-list');
    if (!list) return;
    list.innerHTML = '';

    const q = query.toLowerCase().trim();

    COMPONENT_REGISTRY.forEach(cat => {
        const items = q
            ? cat.items.filter(i => i.name.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q))
            : cat.items;
        if (items.length === 0) return;

        const catEl = document.createElement('div');
        catEl.className = 'comp-category';
        catEl.innerText = cat.category;
        list.appendChild(catEl);

        items.forEach(comp => {
            const el = document.createElement('div');
            el.className = 'comp-item';
            el.innerHTML = `
                <div class="comp-item-icon"><i class="fas ${comp.icon}"></i></div>
                <div class="comp-item-info">
                    <div class="comp-item-name">${comp.name}</div>
                    <div class="comp-item-desc">${comp.desc}</div>
                </div>`;
            el.onclick = () => addComponent({ name: comp.name, icon: comp.icon, category: cat.category });
            list.appendChild(el);
        });
    });
}

function filterComponents() {
    const q = document.getElementById('component-search').value;
    renderComponentList(q);
}

// ─── Add Component to Selected Object ────────────────────────────────────────
function addComponent(comp) {
    if (!selectedObject) {
        logConsole('Select an object first.', 'warn');
        return;
    }
    // Prevent duplicates
    if (selectedObject.components.find(c => c.name === comp.name)) {
        logConsole(`"${comp.name}" is already attached.`, 'warn');
        return;
    }
    selectedObject.components.push(comp);
    buildDynamicInspector(selectedObject);
    recordHistory(`Add component: ${comp.name}`);
    closeModal('modal-components');
    logConsole(`Added component "${comp.name}" to ${selectedObject.name}.`, 'success');
}

// Close context menu
function closeCtx() {
    document.getElementById('hierarchy-context').classList.remove('active');
}
