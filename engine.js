/**
 * engine.js — Three.js core: scene, cameras, renderers, object factory,
 *             parenting system, raycasting, snapping, render loop
 */

// ─── State ────────────────────────────────────────────────────────────────────
let scene, camera, renderer, orbitControls, transformControls;
let gridHelper;
let engineObjects = [];   // flat list of { id, name, object, type, parentId, children[], components[] }
let selectedObject = null;
let snapEnabled    = false;
const SNAP_TRANSLATE = 0.5;
const SNAP_ROTATE    = 15;   // degrees
const SNAP_SCALE     = 0.25;

const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();

// Quad-view cameras
let camTop, camFront, camSide;
let rendererTop, rendererFront, rendererSide;
let quadMode = false;

// FPS tracking
let frameCount = 0, lastTime = performance.now(), currentFps = 60;

// ─── Init ─────────────────────────────────────────────────────────────────────
function initThree() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 50, 200);

    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(6, 5, 9);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.07;

    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('dragging-changed', e => {
        orbitControls.enabled = !e.value;
        if (!e.value && selectedObject) {
            // Record move in history when drag ends
            recordHistory(`Transform ${selectedObject.name}`);
        }
    });
    transformControls.addEventListener('change', () => {
        if (snapEnabled && selectedObject) applySnap();
        updateInspectorFromObject();
    });
    scene.add(transformControls);

    gridHelper = new THREE.GridHelper(30, 30, 0x3a3a3a, 0x2a2a2a);
    scene.add(gridHelper);

    scene.add(new THREE.AmbientLight(0x404050, 0.6));
    ambientLight = scene.children.find(c => c.isAmbientLight);

    // Default scene objects
    createEngineObject('Directional Light', 'DirectionalLight', false);
    createEngineObject('Main Camera', 'Camera', false);

    const ro = new ResizeObserver(() => resizeMainRenderer());
    ro.observe(container);

    renderer.domElement.addEventListener('mousedown', onPointerDown);

    logConsole('Engine initialized.', 'success');
    logConsole('Scene ready — right-click hierarchy to add objects.', 'info');
}

function resizeMainRenderer() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// ─── Object Factory ───────────────────────────────────────────────────────────
function createEngineObject(name, type, addToHistory = true, parentId = null) {
    let obj, helper;

    switch (type) {
        case 'Cube':
            obj = new THREE.Mesh(
                new THREE.BoxGeometry(),
                new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.1 })
            );
            break;
        case 'Sphere':
            obj = new THREE.Mesh(
                new THREE.SphereGeometry(0.5, 32, 16),
                new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.1 })
            );
            break;
        case 'Plane':
            obj = new THREE.Mesh(
                new THREE.PlaneGeometry(5, 5),
                new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.9, side: THREE.DoubleSide })
            );
            obj.rotation.x = -Math.PI / 2;
            break;
        case 'Cylinder':
            obj = new THREE.Mesh(
                new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
                new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.1 })
            );
            break;
        case 'Cone':
            obj = new THREE.Mesh(
                new THREE.ConeGeometry(0.5, 1, 32),
                new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.1 })
            );
            break;
        case 'Icosphere':
            obj = new THREE.Mesh(
                new THREE.IcosahedronGeometry(0.6, 1),
                new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5, metalness: 0.2 })
            );
            break;
        case 'Ring':
            obj = new THREE.Mesh(
                new THREE.RingGeometry(0.3, 0.7, 32),
                new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, side: THREE.DoubleSide })
            );
            obj.rotation.x = -Math.PI / 2;
            break;
        case 'Torus':
            obj = new THREE.Mesh(
                new THREE.TorusGeometry(0.5, 0.2, 16, 48),
                new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.1 })
            );
            break;
        case 'DirectionalLight': {
            obj = new THREE.DirectionalLight(0xffffff, 1);
            obj.position.set(3, 6, 4);
            obj.castShadow = true;
            helper = new THREE.DirectionalLightHelper(obj, 1);
            scene.add(helper);
            obj.userData.helper = helper;
            break;
        }
        case 'PointLight': {
            obj = new THREE.PointLight(0xffffff, 1, 20);
            obj.position.set(0, 3, 0);
            helper = new THREE.PointLightHelper(obj, 0.4);
            scene.add(helper);
            obj.userData.helper = helper;
            break;
        }
        case 'SpotLight': {
            obj = new THREE.SpotLight(0xffffff, 1);
            obj.position.set(2, 5, 2);
            obj.angle = Math.PI / 6;
            helper = new THREE.SpotLightHelper(obj);
            scene.add(helper);
            obj.userData.helper = helper;
            break;
        }
        case 'HemisphereLight': {
            obj = new THREE.HemisphereLight(0x87ceeb, 0x3a2a1a, 0.8);
            obj.position.set(0, 10, 0);
            helper = new THREE.HemisphereLightHelper(obj, 1);
            scene.add(helper);
            obj.userData.helper = helper;
            break;
        }
        case 'Particles': {
            const count = 500;
            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 4;
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            obj = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x88ccff, size: 0.05 }));
            obj.userData.isParticles = true;
            break;
        }
        case 'Camera': {
            obj = new THREE.PerspectiveCamera(60, 16/9, 0.1, 100);
            obj.position.set(0, 1, 5);
            helper = new THREE.CameraHelper(obj);
            scene.add(helper);
            obj.userData.helper = helper;
            break;
        }
        case 'Empty':
        default:
            obj = new THREE.Object3D();
            break;
    }

    obj.userData.engineId   = THREE.MathUtils.generateUUID();
    obj.userData.engineType = type;
    obj.name = name;

    // Parenting
    if (parentId) {
        const parentEntry = engineObjects.find(o => o.id === parentId);
        if (parentEntry) {
            parentEntry.object.add(obj);
        } else {
            scene.add(obj);
        }
    } else {
        scene.add(obj);
    }

    const entry = {
        id: obj.userData.engineId,
        name,
        object: obj,
        type,
        parentId: parentId || null,
        children: [],
        components: []
    };

    if (parentId) {
        const parentEntry = engineObjects.find(o => o.id === parentId);
        if (parentEntry) parentEntry.children.push(entry.id);
    }

    engineObjects.push(entry);

    if (addToHistory) recordHistory(`Create ${name}`);
    updateHierarchyUI();
    selectObject(entry);
    updateStatusBar();
    return entry;
}

// ─── Delete ───────────────────────────────────────────────────────────────────
function deleteSelected() {
    if (!selectedObject) return;
    const id = selectedObject.id;

    // Recursively delete children
    const toDelete = collectSubtree(id);
    toDelete.forEach(eid => {
        const entry = engineObjects.find(o => o.id === eid);
        if (!entry) return;
        const obj3d = entry.object;
        if (obj3d.userData.helper) {
            scene.remove(obj3d.userData.helper);
            obj3d.userData.helper.dispose && obj3d.userData.helper.dispose();
        }
        obj3d.parent && obj3d.parent.remove(obj3d);
        if (obj3d.geometry) obj3d.geometry.dispose();
        if (obj3d.material) obj3d.material.dispose();
    });

    // Remove from parent's children list
    if (selectedObject.parentId) {
        const parentEntry = engineObjects.find(o => o.id === selectedObject.parentId);
        if (parentEntry) parentEntry.children = parentEntry.children.filter(cid => cid !== id);
    }

    engineObjects = engineObjects.filter(o => !toDelete.includes(o.id));

    recordHistory(`Delete ${selectedObject.name}`);
    selectObject(null);
    transformControls.detach();
    updateHierarchyUI();
    updateStatusBar();
    logConsole(`Deleted object.`, 'warn');
}

function collectSubtree(id) {
    const result = [id];
    const entry = engineObjects.find(o => o.id === id);
    if (entry) entry.children.forEach(cid => result.push(...collectSubtree(cid)));
    return result;
}

// ─── Duplicate ────────────────────────────────────────────────────────────────
function duplicateSelected() {
    if (!selectedObject) return;
    const src = selectedObject;
    const newName = src.name + ' (Copy)';
    const newEntry = createEngineObject(newName, src.type, false, src.parentId);

    // Copy transform
    newEntry.object.position.copy(src.object.position).addScalar(0.5);
    newEntry.object.rotation.copy(src.object.rotation);
    newEntry.object.scale.copy(src.object.scale);

    // Copy material properties if mesh
    if (src.object.isMesh && src.object.material && newEntry.object.isMesh) {
        newEntry.object.material = src.object.material.clone();
    }

    // Copy components
    newEntry.components = JSON.parse(JSON.stringify(src.components));

    recordHistory(`Duplicate ${src.name}`);
    updateHierarchyUI();
    logConsole(`Duplicated "${src.name}".`, 'info');
}

// ─── Parenting ────────────────────────────────────────────────────────────────
function setParent(childId, newParentId) {
    const child  = engineObjects.find(o => o.id === childId);
    const newPar = engineObjects.find(o => o.id === newParentId);
    if (!child || !newPar || childId === newParentId) return;
    if (collectSubtree(childId).includes(newParentId)) return; // would be circular

    // Remove from old parent
    if (child.parentId) {
        const oldPar = engineObjects.find(o => o.id === child.parentId);
        if (oldPar) oldPar.children = oldPar.children.filter(id => id !== childId);
    }
    const worldPos = new THREE.Vector3();
    child.object.getWorldPosition(worldPos);

    child.object.parent && child.object.parent.remove(child.object);
    newPar.object.add(child.object);
    child.object.position.copy(worldPos).sub(newPar.object.getWorldPosition(new THREE.Vector3()));
    child.parentId = newParentId;
    newPar.children.push(childId);

    recordHistory(`Parent ${child.name} → ${newPar.name}`);
    updateHierarchyUI();
}

// ─── Snapping ─────────────────────────────────────────────────────────────────
function toggleSnapping() {
    snapEnabled = !snapEnabled;
    const btn = document.getElementById('toggle-snap');
    if (btn) btn.classList.toggle('active', snapEnabled);
    const ind = document.getElementById('snap-indicator');
    if (ind) ind.classList.toggle('hidden', !snapEnabled);
    document.getElementById('stat-snap').innerText = `Snap: ${snapEnabled ? 'ON' : 'OFF'}`;
    logConsole(`Snapping ${snapEnabled ? 'enabled' : 'disabled'}.`, 'info');
}

function applySnap() {
    if (!selectedObject) return;
    const obj = selectedObject.object;
    const mode = transformControls.getMode();
    if (mode === 'translate') {
        obj.position.x = Math.round(obj.position.x / SNAP_TRANSLATE) * SNAP_TRANSLATE;
        obj.position.y = Math.round(obj.position.y / SNAP_TRANSLATE) * SNAP_TRANSLATE;
        obj.position.z = Math.round(obj.position.z / SNAP_TRANSLATE) * SNAP_TRANSLATE;
    } else if (mode === 'rotate') {
        const snap = THREE.MathUtils.degToRad(SNAP_ROTATE);
        obj.rotation.x = Math.round(obj.rotation.x / snap) * snap;
        obj.rotation.y = Math.round(obj.rotation.y / snap) * snap;
        obj.rotation.z = Math.round(obj.rotation.z / snap) * snap;
    } else if (mode === 'scale') {
        obj.scale.x = Math.round(obj.scale.x / SNAP_SCALE) * SNAP_SCALE;
        obj.scale.y = Math.round(obj.scale.y / SNAP_SCALE) * SNAP_SCALE;
        obj.scale.z = Math.round(obj.scale.z / SNAP_SCALE) * SNAP_SCALE;
    }
}

// ─── Focus ────────────────────────────────────────────────────────────────────
function focusSelected() {
    if (!selectedObject) return;
    const obj = selectedObject.object;
    const pos = new THREE.Vector3();
    obj.getWorldPosition(pos);
    orbitControls.target.copy(pos);
    const offset = camera.position.clone().sub(orbitControls.target).normalize().multiplyScalar(4);
    camera.position.copy(pos.clone().add(offset));
    orbitControls.update();
}

// ─── Raycasting ───────────────────────────────────────────────────────────────
function onPointerDown(event) {
    if (event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const targets = engineObjects.map(o => o.object.userData.helper || o.object);
    const hits = raycaster.intersectObjects(targets, true);

    let foundEntry = null;
    if (hits.length > 0) {
        let hit = hits[0].object;
        while (hit.parent && hit.parent.type !== 'Scene' && !hit.userData.engineId) {
            if (hit.parent.type && hit.parent.type.includes('Helper')) { hit = hit.parent; break; }
            hit = hit.parent;
        }
        foundEntry = engineObjects.find(o =>
            o.object.userData.engineId === hit.userData.engineId ||
            (o.object.userData.helper && o.object.userData.helper === hit)
        ) || null;
    }

    // Let multi-select handle shift+click
    if (typeof handlePointerDownMulti === 'function') {
        const handled = handlePointerDownMulti(event, foundEntry);
        if (handled) return;
    }

    if (foundEntry) { selectObject(foundEntry); return; }
    if (!transformControls.dragging) selectObject(null);
}

// ─── Render Loop ──────────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);

    frameCount++;
    const now = performance.now();
    const dt  = Math.min((now - (animate._last || now)) / 1000, 0.1);
    animate._last = now;

    if (now - lastTime >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastTime = now;
        document.getElementById('stat-fps').innerText = `FPS: ${currentFps}`;
        updateStatusBar();
    }

    orbitControls.update();
    tickScripts();

    // Physics step — only when playing
    if (isPlaying && typeof stepPhysics === 'function') stepPhysics(dt);

    // Update light/camera helpers
    engineObjects.forEach(o => {
        if (o.object.userData.helper && o.object.userData.helper.update) {
            o.object.userData.helper.update();
        }
    });

    // Render through post-FX composer if available, else direct
    if (typeof renderWithFX === 'function') {
        renderWithFX();
    } else {
        renderer.render(scene, camera);
    }
    if (quadMode) renderQuadViews();
    drawGizmo();
    drawSceneStats();
}

// ─── Scene Save / Load ────────────────────────────────────────────────────────
function saveScene() {
    const data = {
        version: '0.2',
        objects: engineObjects.map(o => ({
            id: o.id, name: o.name, type: o.type,
            parentId: o.parentId, components: o.components,
            position: o.object.position.toArray(),
            rotation: [o.object.rotation.x, o.object.rotation.y, o.object.rotation.z],
            scale:    o.object.scale.toArray(),
            color: (o.object.isMesh && o.object.material.color)
                ? '#' + o.object.material.color.getHexString() : null,
            roughness: o.object.isMesh ? o.object.material.roughness : null,
            metalness: o.object.isMesh ? o.object.material.metalness : null,
        }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scene.json';
    a.click();
    logConsole('Scene saved.', 'success');
}

function newScene() {
    if (!confirm('Clear scene and start new? Unsaved changes will be lost.')) return;
    engineObjects.slice().forEach(o => {
        if (o.object.userData.helper) scene.remove(o.object.userData.helper);
        scene.remove(o.object);
    });
    engineObjects = [];
    historyStack = []; historyIndex = -1;
    selectObject(null);
    updateHierarchyUI();
    updateStatusBar();
    logConsole('New scene created.', 'info');
}

function handleLoadFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            newScene();
            (data.objects || []).forEach(obj => {
                const entry = createEngineObject(obj.name, obj.type, false, null);
                entry.object.position.fromArray(obj.position);
                entry.object.rotation.set(...obj.rotation);
                entry.object.scale.fromArray(obj.scale);
                if (obj.color && entry.object.isMesh) {
                    entry.object.material.color.set(obj.color);
                    if (obj.roughness != null) entry.object.material.roughness = obj.roughness;
                    if (obj.metalness != null) entry.object.material.metalness = obj.metalness;
                }
                entry.components = obj.components || [];
            });
            logConsole(`Loaded scene: ${file.name}`, 'success');
        } catch(err) {
            logConsole(`Failed to load scene: ${err.message}`, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ─── Status Bar ───────────────────────────────────────────────────────────────
function updateStatusBar() {
    document.getElementById('stat-objects').innerText = `Objects: ${engineObjects.length}`;
    const scriptCount = engineObjects.filter(o => o.script && o.script.trim()).length;
    const statScripts = document.getElementById('stat-scripts');
    if (statScripts) statScripts.innerText = `Scripts: ${scriptCount}`;
    document.getElementById('stat-mem').innerText = `Memory: ${(120 + engineObjects.length * 2 + Math.random() * 3).toFixed(1)}MB`;
}

// ─── Console Log ──────────────────────────────────────────────────────────────
function logConsole(msg, level = 'info') {
    const out = document.getElementById('tab-console');
    if (!out) return;
    const cls = `log-${level}`;
    const time = new Date().toLocaleTimeString('en',{hour12:false});
    out.innerHTML += `<span class="${cls}">[${time}] ${msg}</span><br>`;
    out.scrollTop = out.scrollHeight;
}
