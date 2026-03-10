/**
 * prefabs.js — Save objects as prefabs, display in shelf, instantiate on click
 */

let prefabLibrary = [];  // { name, type, color, roughness, metalness, components, scale, icon }

// ─── Save ─────────────────────────────────────────────────────────────────────
function savePrefab() {
    if (!selectedObject) {
        logConsole('No object selected to save as prefab.', 'warn');
        return;
    }
    const obj = selectedObject;
    const mat = obj.object.isMesh ? obj.object.material : null;

    const prefab = {
        id:         THREE.MathUtils.generateUUID(),
        name:       obj.name,
        type:       obj.type,
        components: JSON.parse(JSON.stringify(obj.components)),
        color:      mat ? '#' + mat.color.getHexString() : null,
        roughness:  mat ? mat.roughness : null,
        metalness:  mat ? mat.metalness : null,
        scale:      obj.object.scale.toArray(),
        icon:       getTypeIcon(obj.type),
    };

    prefabLibrary.push(prefab);
    updatePrefabUI();
    logConsole(`Saved prefab: "${obj.name}".`, 'success');
    openModal('modal-prefabs');
}

// ─── Instantiate ──────────────────────────────────────────────────────────────
function instantiatePrefab(prefab) {
    const entry = createEngineObject(prefab.name, prefab.type, false);
    entry.components = JSON.parse(JSON.stringify(prefab.components));

    if (prefab.color && entry.object.isMesh) {
        entry.object.material.color.set(prefab.color);
        if (prefab.roughness != null) entry.object.material.roughness = prefab.roughness;
        if (prefab.metalness != null) entry.object.material.metalness = prefab.metalness;
    }
    if (prefab.scale) entry.object.scale.fromArray(prefab.scale);

    // Offset slightly so it doesn't stack on top of another
    entry.object.position.set(
        (Math.random() - 0.5) * 4,
        0,
        (Math.random() - 0.5) * 4
    );

    recordHistory(`Instantiate prefab: ${prefab.name}`);
    closeModal('modal-prefabs');
    logConsole(`Instantiated prefab: "${prefab.name}".`, 'info');
}

// ─── Delete Prefab ────────────────────────────────────────────────────────────
function deletePrefab(id) {
    prefabLibrary = prefabLibrary.filter(p => p.id !== id);
    updatePrefabUI();
    logConsole('Prefab removed from library.', 'info');
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function updatePrefabUI() {
    const shelf = document.getElementById('prefab-shelf');
    const grid  = document.getElementById('modal-prefab-grid');
    const empty = document.getElementById('prefab-empty');

    const renderCards = (container, small = false) => {
        container.innerHTML = '';
        prefabLibrary.forEach(p => {
            const card = document.createElement('div');
            card.className = 'prefab-card';
            card.style.width = small ? '80px' : '100px';
            card.innerHTML = `
                <div class="prefab-card-icon"><i class="fas ${p.icon}"></i></div>
                <div class="prefab-card-name">${p.name}</div>
                <div class="prefab-card-type">${p.type}</div>
                <div class="prefab-card-del" onclick="event.stopPropagation();deletePrefab('${p.id}')">
                    <i class="fas fa-times"></i> Remove
                </div>`;
            card.onclick = () => instantiatePrefab(p);
            container.appendChild(card);
        });
    };

    if (shelf) renderCards(shelf, true);
    if (grid)  renderCards(grid, false);
    if (empty) empty.classList.toggle('hidden', prefabLibrary.length > 0);
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function getTypeIcon(type) {
    const map = {
        Cube:'fa-cube', Sphere:'fa-circle', Plane:'fa-square', Cylinder:'fa-database',
        Torus:'fa-circle-notch', DirectionalLight:'fa-sun', PointLight:'fa-lightbulb',
        SpotLight:'fa-bullseye', Camera:'fa-video', Empty:'fa-box'
    };
    return map[type] || 'fa-cube';
}
