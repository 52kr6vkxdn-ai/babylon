/**
 * inspector.js — Inspector panel: transform sync, material editor,
 *                live light controls, camera properties, component display
 */

// ─── Selection ────────────────────────────────────────────────────────────────
function selectObject(obj) {
    selectedObject = obj;
    updateHierarchyUI();

    const empty = document.getElementById('inspector-empty');
    const props  = document.getElementById('inspector-props');
    const icon   = document.getElementById('insp-icon');
    const name   = document.getElementById('insp-name');

    if (obj) {
        transformControls.attach(obj.object);
        empty.classList.add('hidden');
        props.classList.remove('hidden');

        // Icon
        const iconMap = { Camera:'fa-video', DirectionalLight:'fa-sun', PointLight:'fa-lightbulb',
                          SpotLight:'fa-bullseye', Empty:'fa-box' };
        icon.className = `fas ${iconMap[obj.type] || 'fa-cube'} insp-obj-icon`;

        name.value = obj.name;
        updateInspectorFromObject();
        buildDynamicInspector(obj);
        if (typeof updateTagsInspector === 'function') updateTagsInspector();
    } else {
        transformControls.detach();
        empty.classList.remove('hidden');
        props.classList.add('hidden');
    }
}

// ─── Transform Read ───────────────────────────────────────────────────────────
function updateInspectorFromObject() {
    if (!selectedObject) return;
    const o = selectedObject.object;

    setValue('pos-x', o.position.x);
    setValue('pos-y', o.position.y);
    setValue('pos-z', o.position.z);
    setValue('rot-x', THREE.MathUtils.radToDeg(o.rotation.x));
    setValue('rot-y', THREE.MathUtils.radToDeg(o.rotation.y));
    setValue('rot-z', THREE.MathUtils.radToDeg(o.rotation.z));
    setValue('scl-x', o.scale.x);
    setValue('scl-y', o.scale.y);
    setValue('scl-z', o.scale.z);
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = parseFloat(val).toFixed(3);
}

// ─── Transform Write ──────────────────────────────────────────────────────────
function applyInspectorToObject() {
    if (!selectedObject) return;
    const o = selectedObject.object;

    o.position.set(
        parseFloat(document.getElementById('pos-x').value) || 0,
        parseFloat(document.getElementById('pos-y').value) || 0,
        parseFloat(document.getElementById('pos-z').value) || 0
    );
    o.rotation.set(
        THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-x').value) || 0),
        THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-y').value) || 0),
        THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-z').value) || 0)
    );
    o.scale.set(
        parseFloat(document.getElementById('scl-x').value) || 1,
        parseFloat(document.getElementById('scl-y').value) || 1,
        parseFloat(document.getElementById('scl-z').value) || 1
    );
    if (o.userData.helper && o.userData.helper.update) o.userData.helper.update();
}

function resetTransform(part) {
    if (!selectedObject) return;
    const o = selectedObject.object;
    if (part === 'pos') o.position.set(0, 0, 0);
    if (part === 'rot') o.rotation.set(0, 0, 0);
    if (part === 'scl') o.scale.set(1, 1, 1);
    updateInspectorFromObject();
    recordHistory(`Reset ${part} of ${selectedObject.name}`);
}

// ─── Dynamic Inspector Builder ────────────────────────────────────────────────
function buildDynamicInspector(obj) {
    const dyn = document.getElementById('inspector-dynamic');
    dyn.innerHTML = '';

    // Script section — always shown
    dyn.appendChild(buildScriptSection(obj));

    if (obj.type === 'Camera') {
        dyn.appendChild(buildCameraSection(obj));
    }

    const meshTypes = ['Cube','Sphere','Plane','Cylinder','Torus','Cone','Icosphere','Ring'];
    if (meshTypes.includes(obj.type)) {
        dyn.appendChild(buildMaterialSection(obj));
    }

    if (obj.type.includes('Light')) {
        dyn.appendChild(buildLightSection(obj));
    }

    // Physics section (all mesh objects)
    if (meshTypes.includes(obj.type) || obj.type === 'Empty') {
        dyn.appendChild(buildPhysicsSection(obj));
    }

    // Attached components
    if (obj.components && obj.components.length > 0) {
        const sec = buildComponentsSection(obj);
        dyn.appendChild(sec);
    }
}

// ─── Script Section ───────────────────────────────────────────────────────────
function buildScriptSection(obj) {
    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    const hasScript = !!(obj.script && obj.script.trim());

    sec.innerHTML = `<summary>
        <span style="flex:1;">Script</span>
        ${hasScript ? '<span class="script-badge">JS</span>' : ''}
    </summary>
    <div class="inspector-content-inner">
        ${hasScript
            ? `<div class="script-preview">${escapePreview(obj.script)}</div>`
            : `<div style="color:var(--text-inactive);font-size:11px;margin-bottom:8px;">No script attached.</div>`
        }
        <button class="add-component-btn script-open-btn" onclick="openScriptEditor(engineObjects.find(o=>o.id==='${obj.id}'))">
            <i class="fas fa-code"></i> ${hasScript ? 'Edit Script' : 'Create Script'}
        </button>
        ${hasScript ? `<button class="add-component-btn" style="margin-top:5px;background:rgba(192,57,43,.1);border-color:#c0392b;" onclick="clearScript('${obj.id}')">
            <i class="fas fa-times"></i> Clear Script
        </button>` : ''}
    </div>`;

    return sec;
}

function escapePreview(code) {
    const lines = code.split('\n').slice(0, 5);
    const preview = lines.map(l => escapeHtml(l)).join('\n');
    const more = code.split('\n').length > 5 ? `\n<span style="color:var(--text-inactive)">... +${code.split('\n').length - 5} more lines</span>` : '';
    return `<pre class="script-preview-code">${preview}${more}</pre>`;
}

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function clearScript(id) {
    const entry = engineObjects.find(o => o.id === id);
    if (!entry) return;
    if (!confirm('Clear script?')) return;
    entry.script = '';
    buildDynamicInspector(entry);
    recordHistory(`Clear script: ${entry.name}`);
    logConsole(`Script cleared for "${entry.name}".`, 'warn');
}

// ─── Camera Section ───────────────────────────────────────────────────────────
function buildCameraSection(obj) {
    const cam = obj.object;
    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    sec.open = true;
    sec.innerHTML = `<summary>Camera</summary>
    <div class="inspector-content-inner">
        <div class="prop-row">
            <div class="prop-label">FOV</div>
            <div class="prop-inputs">
                <div class="prop-input-group" style="flex:1;">
                    <input type="number" id="cam-fov" class="insp-input" value="${cam.fov}" min="10" max="170" step="1">
                </div>
            </div>
        </div>
        <div class="prop-row">
            <div class="prop-label">Near</div>
            <div class="prop-inputs">
                <div class="prop-input-group" style="flex:1;">
                    <input type="number" id="cam-near" class="insp-input" value="${cam.near}" step="0.01">
                </div>
            </div>
        </div>
        <div class="prop-row">
            <div class="prop-label">Far</div>
            <div class="prop-inputs">
                <div class="prop-input-group" style="flex:1;">
                    <input type="number" id="cam-far" class="insp-input" value="${cam.far}" step="1">
                </div>
            </div>
        </div>
    </div>`;

    sec.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
        cam.fov  = parseFloat(document.getElementById('cam-fov').value) || 60;
        cam.near = parseFloat(document.getElementById('cam-near').value) || 0.1;
        cam.far  = parseFloat(document.getElementById('cam-far').value) || 100;
        cam.updateProjectionMatrix();
        if (cam.userData.helper) cam.userData.helper.update();
    }));

    return sec;
}

// ─── Material Section ─────────────────────────────────────────────────────────
function buildMaterialSection(obj) {
    const mat = obj.object.material;
    if (!mat) return document.createElement('div');

    const hexColor = '#' + mat.color.getHexString();
    const roughness = mat.roughness !== undefined ? mat.roughness : 0.7;
    const metalness = mat.metalness !== undefined ? mat.metalness : 0.1;

    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    sec.open = true;
    sec.innerHTML = `<summary>Material</summary>
    <div class="inspector-content-inner">
        <div class="prop-row">
            <div class="prop-label">Color</div>
            <div class="prop-inputs" style="gap:6px;align-items:center;">
                <input type="color" id="mat-color" value="${hexColor}" style="width:36px;height:24px;border:1px solid var(--border-color);background:transparent;cursor:pointer;border-radius:3px;">
                <input type="text"  id="mat-color-hex" value="${hexColor}" style="flex:1;background:var(--bg-primary);border:1px solid var(--border-color);color:var(--text-primary);padding:3px 6px;border-radius:2px;font-family:monospace;font-size:11px;">
            </div>
        </div>
        <div class="prop-row">
            <div class="prop-label">Roughness</div>
            <div class="prop-inputs" style="align-items:center;gap:6px;">
                <input type="range" id="mat-roughness" min="0" max="1" step="0.01" value="${roughness}" style="flex:1;">
                <span id="mat-roughness-val" style="width:30px;text-align:right;font-size:11px;">${roughness.toFixed(2)}</span>
            </div>
        </div>
        <div class="prop-row">
            <div class="prop-label">Metalness</div>
            <div class="prop-inputs" style="align-items:center;gap:6px;">
                <input type="range" id="mat-metalness" min="0" max="1" step="0.01" value="${metalness}" style="flex:1;">
                <span id="mat-metalness-val" style="width:30px;text-align:right;font-size:11px;">${metalness.toFixed(2)}</span>
            </div>
        </div>
        <div class="prop-row">
            <div class="prop-label">Wireframe</div>
            <div class="prop-inputs">
                <input type="checkbox" id="mat-wireframe" ${mat.wireframe ? 'checked' : ''} style="cursor:pointer;">
            </div>
        </div>
    </div>`;

    // Color picker → hex text sync
    sec.querySelector('#mat-color').addEventListener('input', e => {
        const hex = e.target.value;
        mat.color.set(hex);
        sec.querySelector('#mat-color-hex').value = hex;
    });
    sec.querySelector('#mat-color-hex').addEventListener('change', e => {
        try {
            mat.color.set(e.target.value);
            sec.querySelector('#mat-color').value = '#' + mat.color.getHexString();
        } catch(_) {}
    });

    // Roughness slider
    sec.querySelector('#mat-roughness').addEventListener('input', e => {
        mat.roughness = parseFloat(e.target.value);
        sec.querySelector('#mat-roughness-val').innerText = mat.roughness.toFixed(2);
    });

    // Metalness slider
    sec.querySelector('#mat-metalness').addEventListener('input', e => {
        mat.metalness = parseFloat(e.target.value);
        sec.querySelector('#mat-metalness-val').innerText = mat.metalness.toFixed(2);
    });

    // Wireframe toggle
    sec.querySelector('#mat-wireframe').addEventListener('change', e => {
        mat.wireframe = e.target.checked;
    });

    return sec;
}

// ─── Light Section ────────────────────────────────────────────────────────────
function buildLightSection(obj) {
    const light  = obj.object;
    const hexCol = '#' + light.color.getHexString();

    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    sec.open = true;

    let extraHTML = '';
    if (obj.type === 'PointLight') {
        extraHTML = `
        <div class="prop-row">
            <div class="prop-label">Distance</div>
            <div class="prop-inputs">
                <div class="prop-input-group" style="flex:1;">
                    <input type="number" id="light-distance" class="insp-input" value="${light.distance}" step="0.5" min="0">
                </div>
            </div>
        </div>`;
    }
    if (obj.type === 'SpotLight') {
        extraHTML = `
        <div class="prop-row">
            <div class="prop-label">Angle</div>
            <div class="prop-inputs" style="align-items:center;gap:6px;">
                <input type="range" id="light-angle" min="1" max="89" step="1" value="${Math.round(THREE.MathUtils.radToDeg(light.angle))}" style="flex:1;">
                <span id="light-angle-val" style="width:30px;text-align:right;font-size:11px;">${Math.round(THREE.MathUtils.radToDeg(light.angle))}°</span>
            </div>
        </div>`;
    }

    sec.innerHTML = `<summary>Light</summary>
    <div class="inspector-content-inner">
        <div class="prop-row">
            <div class="prop-label">Color</div>
            <div class="prop-inputs" style="gap:6px;align-items:center;">
                <input type="color" id="light-color" value="${hexCol}" style="width:36px;height:24px;border:1px solid var(--border-color);background:transparent;cursor:pointer;border-radius:3px;">
            </div>
        </div>
        <div class="prop-row">
            <div class="prop-label">Intensity</div>
            <div class="prop-inputs" style="align-items:center;gap:6px;">
                <input type="range" id="light-intensity" min="0" max="5" step="0.05" value="${light.intensity}" style="flex:1;">
                <span id="light-intensity-val" style="width:30px;text-align:right;font-size:11px;">${light.intensity.toFixed(2)}</span>
            </div>
        </div>
        <div class="prop-row">
            <div class="prop-label">Shadows</div>
            <div class="prop-inputs">
                <input type="checkbox" id="light-shadows" ${light.castShadow ? 'checked':''} style="cursor:pointer;">
            </div>
        </div>
        ${extraHTML}
    </div>`;

    sec.querySelector('#light-color').addEventListener('input', e => {
        light.color.set(e.target.value);
        if (light.userData.helper && light.userData.helper.update) light.userData.helper.update();
    });
    sec.querySelector('#light-intensity').addEventListener('input', e => {
        light.intensity = parseFloat(e.target.value);
        sec.querySelector('#light-intensity-val').innerText = light.intensity.toFixed(2);
        if (light.userData.helper && light.userData.helper.update) light.userData.helper.update();
    });
    sec.querySelector('#light-shadows').addEventListener('change', e => {
        light.castShadow = e.target.checked;
    });

    if (obj.type === 'PointLight') {
        sec.querySelector('#light-distance').addEventListener('input', e => {
            light.distance = parseFloat(e.target.value) || 0;
        });
    }
    if (obj.type === 'SpotLight') {
        sec.querySelector('#light-angle').addEventListener('input', e => {
            light.angle = THREE.MathUtils.degToRad(parseFloat(e.target.value));
            sec.querySelector('#light-angle-val').innerText = e.target.value + '°';
            if (light.userData.helper && light.userData.helper.update) light.userData.helper.update();
        });
    }

    return sec;
}

// ─── Attached Components Section ──────────────────────────────────────────────
function buildComponentsSection(obj) {
    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    sec.open = true;
    sec.innerHTML = '<summary>Components</summary><div class="inspector-content-inner" id="attached-comps"></div>';

    const container = sec.querySelector('#attached-comps');
    obj.components.forEach((comp, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border-color);';
        row.innerHTML = `<span><i class="fas ${comp.icon || 'fa-puzzle-piece'}" style="margin-right:6px;color:var(--accent-color);"></i>${comp.name}</span>
            <button class="small-btn" onclick="removeComponent(${idx})" style="color:#e05252;"><i class="fas fa-times"></i></button>`;
        container.appendChild(row);
    });

    return sec;
}

function removeComponent(index) {
    if (!selectedObject) return;
    const removed = selectedObject.components.splice(index, 1);
    recordHistory(`Remove component: ${removed[0].name}`);
    buildDynamicInspector(selectedObject);
    logConsole(`Removed component: ${removed[0].name}`, 'info');
}

// ─── Physics Section ──────────────────────────────────────────────────────────
function buildPhysicsSection(obj) {
    if (!obj.physics) obj.physics = typeof defaultPhysicsConfig === 'function' ? defaultPhysicsConfig() : {
        enabled: false, bodyType: 'dynamic', mass: 1, restitution: 0.3,
        friction: 0.5, linearDamping: 0.1, angularDamping: 0.1,
        gravityScale: 1.0, isTrigger: false, shape: 'auto'
    };
    const p = obj.physics;
    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    sec.innerHTML = `<summary>
        <span style="flex:1;">Rigidbody</span>
        ${p.enabled ? '<span class="script-badge" style="background:#e67e22;">PHYSICS</span>' : ''}
    </summary>
    <div class="inspector-content-inner">
        <div class="prop-row">
            <div class="prop-label">Enabled</div>
            <input type="checkbox" id="phys-enabled" ${p.enabled ? 'checked' : ''} style="cursor:pointer;">
            <span style="font-size:10px;color:var(--text-inactive);margin-left:6px;">Runs only in ▶ Play</span>
        </div>
        <div id="phys-options" style="display:${p.enabled ? 'block' : 'none'}">
            <div class="prop-row"><div class="prop-label">Body Type</div>
                <select id="phys-bodytype" class="overlay-select" style="flex:1;height:24px;">
                    <option value="dynamic" ${p.bodyType==='dynamic'?'selected':''}>Dynamic</option>
                    <option value="static" ${p.bodyType==='static'?'selected':''}>Static</option>
                    <option value="kinematic" ${p.bodyType==='kinematic'?'selected':''}>Kinematic</option>
                </select>
            </div>
            <div class="prop-row"><div class="prop-label">Mass</div>
                <div class="prop-input-group" style="flex:1;"><input type="number" id="phys-mass" value="${p.mass}" step="0.1" min="0.001"></div>
            </div>
            <div class="prop-row"><div class="prop-label">Restitution</div>
                <input type="range" id="phys-restitution" min="0" max="1" step="0.01" value="${p.restitution}" style="flex:1;">
                <span id="phys-restitution-val" style="width:30px;font-size:10px;text-align:right;">${p.restitution.toFixed(2)}</span>
            </div>
            <div class="prop-row"><div class="prop-label">Friction</div>
                <input type="range" id="phys-friction" min="0" max="2" step="0.01" value="${p.friction}" style="flex:1;">
                <span id="phys-friction-val" style="width:30px;font-size:10px;text-align:right;">${p.friction.toFixed(2)}</span>
            </div>
            <div class="prop-row"><div class="prop-label">Gravity ×</div>
                <div class="prop-input-group" style="flex:1;"><input type="number" id="phys-gravity" value="${p.gravityScale}" step="0.1"></div>
            </div>
            <div class="prop-row"><div class="prop-label">Shape</div>
                <select id="phys-shape" class="overlay-select" style="flex:1;height:24px;">
                    <option value="auto" ${p.shape==='auto'?'selected':''}>Auto</option>
                    <option value="box" ${p.shape==='box'?'selected':''}>Box</option>
                    <option value="sphere" ${p.shape==='sphere'?'selected':''}>Sphere</option>
                    <option value="capsule" ${p.shape==='capsule'?'selected':''}>Capsule</option>
                </select>
            </div>
            <div class="prop-row"><div class="prop-label">Is Trigger</div>
                <input type="checkbox" id="phys-trigger" ${p.isTrigger?'checked':''} style="cursor:pointer;">
                <span style="font-size:10px;color:var(--text-inactive);margin-left:6px;">No collision response</span>
            </div>
        </div>
    </div>`;

    const enabledCb = sec.querySelector('#phys-enabled');
    const opts = sec.querySelector('#phys-options');
    enabledCb.onchange = () => {
        p.enabled = enabledCb.checked;
        opts.style.display = p.enabled ? 'block' : 'none';
        buildDynamicInspector(obj);
        recordHistory(`Physics ${p.enabled?'enabled':'disabled'}: ${obj.name}`);
        logConsole(`Rigidbody ${p.enabled?'enabled':'disabled'} on "${obj.name}".`,'info');
    };
    const bind = (id, key, parse) => {
        const el = sec.querySelector('#'+id); if (!el) return;
        el.oninput = el.onchange = () => {
            const v = el.type==='checkbox' ? el.checked : (parse ? parse(el.value) : parseFloat(el.value));
            p[key] = v;
            const vEl = sec.querySelector('#'+id+'-val');
            if (vEl) vEl.innerText = typeof v==='number' ? v.toFixed(2) : v;
        };
    };
    bind('phys-bodytype','bodyType',v=>v);
    bind('phys-mass','mass');
    bind('phys-restitution','restitution');
    bind('phys-friction','friction');
    bind('phys-gravity','gravityScale');
    bind('phys-shape','shape',v=>v);
    bind('phys-trigger','isTrigger',()=>sec.querySelector('#phys-trigger').checked);
    return sec;
}
