/**
 * script-engine.js — Sandboxed JavaScript runtime for object scripts
 *
 * Each object can have a script with:
 *   start()  — called once when play starts or scene loads
 *   update(dt) — called every frame, dt = delta time in seconds
 *
 * Full Scene API exposed to scripts via the `Engine` global inside each sandbox.
 */

// ─── Script Runner State ──────────────────────────────────────────────────────
let isPlaying = false;
let scriptInstances = {};  // objectId -> { fn, ctx, error }
let lastFrameTime = performance.now();
let playStartTime  = 0;

// ─── Build the API context for a given engine object ─────────────────────────
function buildScriptAPI(entry) {
    const obj3d = entry.object;

    // ── Transform API ──────────────────────────────────────────────────────────
    const transform = {
        get position() { return { x: obj3d.position.x, y: obj3d.position.y, z: obj3d.position.z }; },
        set position(v) { obj3d.position.set(v.x ?? obj3d.position.x, v.y ?? obj3d.position.y, v.z ?? obj3d.position.z); },
        setPosition(x, y, z) { obj3d.position.set(x, y, z); },
        translate(x, y, z) { obj3d.position.x += x; obj3d.position.y += y; obj3d.position.z += z; },

        get rotation() {
            return {
                x: THREE.MathUtils.radToDeg(obj3d.rotation.x),
                y: THREE.MathUtils.radToDeg(obj3d.rotation.y),
                z: THREE.MathUtils.radToDeg(obj3d.rotation.z)
            };
        },
        setRotation(x, y, z) {
            obj3d.rotation.set(
                THREE.MathUtils.degToRad(x),
                THREE.MathUtils.degToRad(y),
                THREE.MathUtils.degToRad(z)
            );
        },
        rotate(x, y, z) {
            obj3d.rotation.x += THREE.MathUtils.degToRad(x);
            obj3d.rotation.y += THREE.MathUtils.degToRad(y);
            obj3d.rotation.z += THREE.MathUtils.degToRad(z);
        },

        get scale() { return { x: obj3d.scale.x, y: obj3d.scale.y, z: obj3d.scale.z }; },
        setScale(x, y, z) { obj3d.scale.set(x, y, z); },

        lookAt(x, y, z) { obj3d.lookAt(x, y, z); },
        getWorldPosition() {
            const v = new THREE.Vector3();
            obj3d.getWorldPosition(v);
            return { x: v.x, y: v.y, z: v.z };
        }
    };

    // ── Material API ───────────────────────────────────────────────────────────
    const material = obj3d.isMesh ? {
        get color() { return '#' + obj3d.material.color.getHexString(); },
        set color(v) { obj3d.material.color.set(v); },
        setColor(hex) { obj3d.material.color.set(hex); },
        get roughness() { return obj3d.material.roughness; },
        set roughness(v) { obj3d.material.roughness = v; },
        get metalness() { return obj3d.material.metalness; },
        set metalness(v) { obj3d.material.metalness = v; },
        get opacity() { return obj3d.material.opacity; },
        set opacity(v) {
            obj3d.material.transparent = v < 1;
            obj3d.material.opacity = v;
        },
        get wireframe() { return obj3d.material.wireframe; },
        set wireframe(v) { obj3d.material.wireframe = v; },
        setEmissive(hex, intensity = 1) {
            obj3d.material.emissive = new THREE.Color(hex);
            obj3d.material.emissiveIntensity = intensity;
        }
    } : null;

    // ── Light API ──────────────────────────────────────────────────────────────
    const lightAPI = obj3d.isLight ? {
        get color() { return '#' + obj3d.color.getHexString(); },
        set color(v) { obj3d.color.set(v); },
        get intensity() { return obj3d.intensity; },
        set intensity(v) { obj3d.intensity = v; },
        pulse(speed = 1, min = 0.2, max = 1.5) {
            const t = (performance.now() / 1000) * speed;
            obj3d.intensity = min + (Math.sin(t) * 0.5 + 0.5) * (max - min);
        }
    } : null;

    // ── Scene API ──────────────────────────────────────────────────────────────
    const sceneAPI = {
        find(name) {
            const e = engineObjects.find(o => o.name === name);
            return e ? buildScriptAPI(e) : null;
        },
        findById(id) {
            const e = engineObjects.find(o => o.id === id);
            return e ? buildScriptAPI(e) : null;
        },
        findByTag(tag) {
            return engineObjects
                .filter(o => o.tags && o.tags.includes(tag))
                .map(o => buildScriptAPI(o));
        },
        getAllObjects() {
            return engineObjects.map(o => ({ name: o.name, id: o.id, type: o.type }));
        },
        get backgroundColor() { return '#' + scene.background.getHexString(); },
        set backgroundColor(hex) { scene.background = new THREE.Color(hex); },
        get fogDensity() { return scene.fog ? scene.fog.near : null; },
        setFog(color, near, far) { scene.fog = new THREE.Fog(color, near, far); },
        removeFog() { scene.fog = null; },
    };

    // ── Input API ─────────────────────────────────────────────────────────────
    const inputAPI = {
        keys: scriptInputState.keys,
        mouse: scriptInputState.mouse,
        isKeyDown(key) { return !!scriptInputState.keys[key.toLowerCase()]; },
        isKeyPressed(key) { return !!scriptInputState.keysPressed[key.toLowerCase()]; },
        getMousePosition() { return { ...scriptInputState.mouse }; },
        isMouseDown(btn = 0) { return !!scriptInputState.mouseButtons[btn]; },
    };

    // ── Physics / Math Helpers ─────────────────────────────────────────────────
    const math = {
        lerp: (a, b, t) => a + (b - a) * t,
        clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
        map: (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c),
        random: (min = 0, max = 1) => min + Math.random() * (max - min),
        randomInt: (min, max) => Math.floor(min + Math.random() * (max - min + 1)),
        sin: Math.sin, cos: Math.cos, abs: Math.abs, PI: Math.PI,
        deg: (r) => THREE.MathUtils.radToDeg(r),
        rad: (d) => THREE.MathUtils.degToRad(d),
        distance(a, b) {
            return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
        }
    };

    // ── Object self-reference ──────────────────────────────────────────────────
    const self = {
        get name() { return entry.name; },
        set name(v) { entry.name = v; obj3d.name = v; updateHierarchyUI(); },
        get id() { return entry.id; },
        get type() { return entry.type; },
        get active() { return obj3d.visible; },
        set active(v) { obj3d.visible = v; },
        setActive(v) { obj3d.visible = v; },
        destroy() { selectObject(entry); deleteSelected(); },
        clone() { duplicateSelected(); },
        get tags() { return entry.tags || []; },
        addTag(t) { entry.tags = entry.tags || []; if (!entry.tags.includes(t)) entry.tags.push(t); },
        removeTag(t) { entry.tags = (entry.tags || []).filter(x => x !== t); },
        hasTag(t) { return (entry.tags || []).includes(t); },
        // Per-script data store
        data: entry.scriptData || (entry.scriptData = {}),
    };

    // ── Camera API ────────────────────────────────────────────────────────────
    const cameraAPI = {
        get position() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z }; },
        setPosition(x, y, z) { camera.position.set(x, y, z); },
        lookAt(x, y, z) { camera.lookAt(x, y, z); orbitControls.target.set(x, y, z); },
        get fov() { return camera.fov; },
        set fov(v) { camera.fov = v; camera.updateProjectionMatrix(); },
        shake(intensity = 0.2, duration = 300) {
            const start = performance.now();
            const origPos = camera.position.clone();
            const tick = () => {
                const elapsed = performance.now() - start;
                if (elapsed > duration) { camera.position.copy(origPos); return; }
                camera.position.x = origPos.x + (Math.random() - 0.5) * intensity;
                camera.position.y = origPos.y + (Math.random() - 0.5) * intensity;
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }
    };

    // ── Time API ──────────────────────────────────────────────────────────────
    const timeAPI = {
        get now() { return (performance.now() - playStartTime) / 1000; },
        get fps() { return currentFps; },
        sin(speed = 1) { return Math.sin(this.now * speed); },
        cos(speed = 1) { return Math.cos(this.now * speed); },
        pingPong(speed = 1) { return Math.abs(Math.sin(this.now * speed)); },
    };

    // ── Debug API ────────────────────────────────────────────────────────────
    const debugAPI = {
        log: (msg) => logConsole(`[${entry.name}] ${msg}`, 'info'),
        warn: (msg) => logConsole(`[${entry.name}] ⚠ ${msg}`, 'warn'),
        error: (msg) => logConsole(`[${entry.name}] ✖ ${msg}`, 'error'),
    };

    // ── Audio API (Web Audio) ─────────────────────────────────────────────────
    const audioAPI = {
        playTone(freq = 440, duration = 0.2, type = 'sine') {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = type; osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
                osc.start(); osc.stop(ctx.currentTime + duration);
            } catch(e) {}
        }
    };

    // ── Events API ────────────────────────────────────────────────────────────
    const eventsAPI = {
        emit(name, data) { scriptEventBus.emit(name, data, entry.id); },
        on(name, fn) { scriptEventBus.on(name, fn, entry.id); },
    };

    return {
        self, transform, material, light: lightAPI,
        scene: sceneAPI, input: inputAPI, camera: cameraAPI,
        time: timeAPI, debug: debugAPI, audio: audioAPI,
        events: eventsAPI, math,
        physics: (typeof buildPhysicsAPI === 'function') ? buildPhysicsAPI(entry) : null,
        postfx:  (typeof buildPostFXScriptAPI === 'function') ? buildPostFXScriptAPI() : null,
        THREE,
    };
}

// ─── Event Bus ───────────────────────────────────────────────────────────────
const scriptEventBus = {
    listeners: {},  // eventName -> [{fn, ownerId}]
    on(name, fn, ownerId) {
        if (!this.listeners[name]) this.listeners[name] = [];
        this.listeners[name].push({ fn, ownerId });
    },
    emit(name, data, senderId) {
        (this.listeners[name] || []).forEach(l => {
            try { l.fn(data, senderId); } catch(e) {}
        });
    },
    clearOwner(ownerId) {
        Object.keys(this.listeners).forEach(name => {
            this.listeners[name] = this.listeners[name].filter(l => l.ownerId !== ownerId);
        });
    }
};

// ─── Input State ─────────────────────────────────────────────────────────────
const scriptInputState = {
    keys: {}, keysPressed: {}, mouseButtons: {},
    mouse: { x: 0, y: 0, nx: 0, ny: 0 }
};

function initScriptInput() {
    document.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if (!scriptInputState.keys[k]) scriptInputState.keysPressed[k] = true;
        scriptInputState.keys[k] = true;
    });
    document.addEventListener('keyup', e => {
        scriptInputState.keys[e.key.toLowerCase()] = false;
    });
    renderer.domElement.addEventListener('mousemove', e => {
        const rect = renderer.domElement.getBoundingClientRect();
        scriptInputState.mouse.x = e.clientX - rect.left;
        scriptInputState.mouse.y = e.clientY - rect.top;
        scriptInputState.mouse.nx = (scriptInputState.mouse.x / rect.width)  * 2 - 1;
        scriptInputState.mouse.ny = (scriptInputState.mouse.y / rect.height) * 2 - 1;
    });
    renderer.domElement.addEventListener('mousedown', e => { scriptInputState.mouseButtons[e.button] = true; });
    renderer.domElement.addEventListener('mouseup',   e => { scriptInputState.mouseButtons[e.button] = false; });
}

// ─── Compile & Wrap Script ────────────────────────────────────────────────────
function compileScript(entry) {
    if (!entry.script || !entry.script.trim()) return null;

    const api = buildScriptAPI(entry);

    // Inject all API props as named vars in scope
    const apiKeys = Object.keys(api);
    const apiVals = apiKeys.map(k => api[k]);

    try {
        // Wrap in function that exposes API + start/update lifecycle
        const wrapped = `
"use strict";
let _start = null, _update = null;
function start(fn) { _start = fn; }
function update(fn) { _update = fn; }
${entry.script}
return { start: _start, update: _update };
        `;
        // eslint-disable-next-line no-new-func
        const factory = new Function(...apiKeys, wrapped);
        const lifecycle = factory(...apiVals);
        return { lifecycle, api, error: null };
    } catch (err) {
        logConsole(`[${entry.name}] Script compile error: ${err.message}`, 'error');
        return { lifecycle: null, api, error: err.message };
    }
}

// ─── Play / Stop ─────────────────────────────────────────────────────────────
function playScene() {
    if (isPlaying) return;
    isPlaying = true;
    playStartTime = performance.now();
    lastFrameTime = playStartTime;
    scriptInstances = {};

    // Start physics (async, but bodies created before scripts run)
    if (typeof startPhysics === 'function') startPhysics();

    engineObjects.forEach(entry => {
        if (!entry.script || !entry.script.trim()) return;
        const compiled = compileScript(entry);
        if (!compiled || !compiled.lifecycle) return;
        scriptInstances[entry.id] = compiled;

        try {
            if (compiled.lifecycle.start) compiled.lifecycle.start();
        } catch(err) {
            logConsole(`[${entry.name}] start() error: ${err.message}`, 'error');
        }
    });

    logConsole(`▶ Scene playing. ${Object.keys(scriptInstances).length} scripts running.`, 'success');
    updatePlayButtons(true);
}

function stopScene() {
    if (!isPlaying) return;
    isPlaying = false;
    scriptInstances = {};
    scriptEventBus.listeners = {};
    scriptInputState.keysPressed = {};

    // Stop physics and restore editor transforms
    if (typeof stopPhysics === 'function') stopPhysics();

    logConsole('⏹ Scene stopped.', 'info');
    updatePlayButtons(false);
}

function pauseScene() {
    isPlaying = !isPlaying;
    logConsole(isPlaying ? '▶ Resumed.' : '⏸ Paused.', 'info');
    updatePlayButtons(isPlaying);
}

// ─── Tick Scripts ─────────────────────────────────────────────────────────────
function tickScripts() {
    if (!isPlaying) return;

    const now = performance.now();
    const dt  = Math.min((now - lastFrameTime) / 1000, 0.1); // cap at 100ms
    lastFrameTime = now;

    Object.entries(scriptInstances).forEach(([id, inst]) => {
        if (!inst.lifecycle || !inst.lifecycle.update) return;
        const entry = engineObjects.find(o => o.id === id);
        if (!entry || !entry.object.visible) return;
        try {
            inst.lifecycle.update(dt);
        } catch(err) {
            logConsole(`[${entry.name}] update() error: ${err.message}`, 'error');
            delete scriptInstances[id]; // Stop crashing script
        }
    });

    // Clear one-frame pressed state
    scriptInputState.keysPressed = {};
}

function updatePlayButtons(playing) {
    const playBtn = document.getElementById('btn-play');
    if (playBtn) playBtn.classList.toggle('active', playing);
    const playInd = document.getElementById('play-indicator');
    if (playInd) playInd.classList.toggle('hidden', !playing);
    document.getElementById('stat-mode').innerText = playing ? '▶ PLAYING' : (quadMode ? 'Quad View' : 'Perspective');
}
