/**
 * script-editor.js — Fullscreen sandboxed JS script editor
 * Opens as an overlay with a textarea, syntax colors (via highlight.js or custom),
 * live error display, and an API reference sidebar.
 */

let scriptEditorTarget = null; // the engineObject entry being edited
let scriptEditorDirty  = false;

// ─── Open Editor ─────────────────────────────────────────────────────────────
function openScriptEditor(entry) {
    scriptEditorTarget = entry;
    scriptEditorDirty  = false;

    const overlay = document.getElementById('script-editor-overlay');
    const textarea = document.getElementById('script-textarea');
    const title = document.getElementById('script-editor-title');

    title.innerText = `Script — ${entry.name}`;
    textarea.value  = entry.script || getDefaultScript(entry.type);
    overlay.classList.add('active');
    textarea.focus();
    updateScriptLineCount();
    lintScript();
}

function closeScriptEditor(save = true) {
    if (save && scriptEditorTarget) {
        const code = document.getElementById('script-textarea').value;
        scriptEditorTarget.script = code;
        logConsole(`Script saved for "${scriptEditorTarget.name}".`, 'success');
        // Re-compile if playing
        if (isPlaying && code.trim()) {
            const compiled = compileScript(scriptEditorTarget);
            if (compiled && compiled.lifecycle) {
                scriptInstances[scriptEditorTarget.id] = compiled;
                try { if (compiled.lifecycle.start) compiled.lifecycle.start(); } catch(e) {}
            }
        }
        recordHistory(`Edit script: ${scriptEditorTarget.name}`);
    }
    document.getElementById('script-editor-overlay').classList.remove('active');
    scriptEditorTarget = null;
}

// ─── Default Script Templates ─────────────────────────────────────────────────
function getDefaultScript(type) {
    const templates = {
        'Cube':    rotateBobTemplate('Cube'),
        'Sphere':  rotateBobTemplate('Sphere'),
        'Cylinder':rotateBobTemplate('Cylinder'),
        'Torus':   rotateBobTemplate('Torus'),
        'Plane':   planeTemplate(),
        'PointLight': lightPulseTemplate(),
        'SpotLight':  lightPulseTemplate(),
        'DirectionalLight': sunCycleTemplate(),
        'Camera':  cameraOrbitTemplate(),
        'Empty':   emptyTemplate(),
    };
    return templates[type] || emptyTemplate();
}

function rotateBobTemplate(typeName) {
    return `// ${typeName} Script
// Available: self, transform, material, scene, input, time, camera, debug, math, audio, events

start(() => {
  debug.log("${typeName} started!");
  // Store initial Y position
  self.data.startY = transform.position.y;
});

update((dt) => {
  // Rotate continuously
  transform.rotate(0, 45 * dt, 0);

  // Bob up and down
  const bob = Math.sin(time.now * 2) * 0.3;
  const pos = transform.position;
  transform.setPosition(pos.x, self.data.startY + bob, pos.z);

  // Press Space to change color
  if (input.isKeyPressed('space')) {
    const colors = ['#ff4444','#44ff44','#4444ff','#ffff44','#ff44ff'];
    material.setColor(colors[math.randomInt(0, colors.length - 1)]);
    audio.playTone(440, 0.1);
  }
});
`;
}

function planeTemplate() {
    return `// Plane Script
start(() => {
  debug.log("Plane ready.");
});

update((dt) => {
  // Press WASD to move camera
  const speed = 5;
  if (input.isKeyDown('w')) camera.setPosition(camera.position.x, camera.position.y, camera.position.z - speed * dt);
  if (input.isKeyDown('s')) camera.setPosition(camera.position.x, camera.position.y, camera.position.z + speed * dt);
  if (input.isKeyDown('a')) camera.setPosition(camera.position.x - speed * dt, camera.position.y, camera.position.z);
  if (input.isKeyDown('d')) camera.setPosition(camera.position.x + speed * dt, camera.position.y, camera.position.z);
});
`;
}

function lightPulseTemplate() {
    return `// Light Pulse Script
start(() => {
  debug.log("Light script running.");
  self.data.baseIntensity = light.intensity;
});

update((dt) => {
  // Pulse light intensity
  light.pulse(2, 0.3, 2.0);

  // Press L to toggle
  if (input.isKeyPressed('l')) {
    self.active = !self.active;
    debug.log("Light toggled: " + self.active);
  }
});
`;
}

function sunCycleTemplate() {
    return `// Day/Night Cycle Script
start(() => {
  self.data.angle = 0;
  debug.log("Day/night cycle started.");
});

update((dt) => {
  self.data.angle += dt * 20; // 20 deg/sec
  const rad = math.rad(self.data.angle);

  transform.setPosition(Math.cos(rad) * 10, Math.sin(rad) * 10, 5);
  transform.lookAt(0, 0, 0);

  // Color shift: warm at horizon, white at noon
  const t = Math.sin(rad) * 0.5 + 0.5;
  const r = Math.round(255 * math.lerp(1, 1, t)).toString(16).padStart(2,'0');
  const g = Math.round(255 * math.lerp(0.4, 1, t)).toString(16).padStart(2,'0');
  const b = Math.round(255 * math.lerp(0, 1, t)).toString(16).padStart(2,'0');
  light.color = '#' + r + g + b;
  light.intensity = math.lerp(0, 1.5, t);
});
`;
}

function cameraOrbitTemplate() {
    return `// Camera Script
start(() => {
  self.data.angle = 0;
  debug.log("Camera script running.");
});

update((dt) => {
  // Auto-orbit (disable when not needed)
  // self.data.angle += dt * 30;
  // const r = 12;
  // camera.setPosition(Math.cos(math.rad(self.data.angle)) * r, 5, Math.sin(math.rad(self.data.angle)) * r);
  // camera.lookAt(0, 0, 0);
});
`;
}

function emptyTemplate() {
    return `// Script
// Use start() and update(dt) lifecycle hooks
// dt = delta time in seconds

start(() => {
  debug.log("Hello from " + self.name + "!");
});

update((dt) => {
  // Your logic here
});
`;
}

// ─── Editor UI Init ───────────────────────────────────────────────────────────
function initScriptEditor() {
    const textarea = document.getElementById('script-textarea');
    const lineNums = document.getElementById('script-line-numbers');
    const errorBar = document.getElementById('script-error-bar');

    // Sync scroll between textarea and line numbers
    textarea.addEventListener('scroll', () => {
        lineNums.scrollTop = textarea.scrollTop;
    });

    // Line count & lint on input
    textarea.addEventListener('input', () => {
        scriptEditorDirty = true;
        updateScriptLineCount();
        clearTimeout(textarea._lintTimer);
        textarea._lintTimer = setTimeout(lintScript, 600);
    });

    // Tab key inserts spaces
    textarea.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end   = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 2;
            updateScriptLineCount();
        }
        // Ctrl+S saves
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            closeScriptEditor(true);
        }
        // Escape closes without saving
        if (e.key === 'Escape') {
            if (scriptEditorDirty) {
                if (confirm('Close without saving?')) closeScriptEditor(false);
            } else {
                closeScriptEditor(false);
            }
        }
    });

    // API search
    const apiSearch = document.getElementById('api-search');
    if (apiSearch) {
        apiSearch.addEventListener('input', e => filterAPIRef(e.target.value));
    }

    buildAPIReference();
}

function updateScriptLineCount() {
    const textarea = document.getElementById('script-textarea');
    const lineNums = document.getElementById('script-line-numbers');
    const lines = textarea.value.split('\n');
    lineNums.innerHTML = lines.map((_, i) => `<div>${i + 1}</div>`).join('');
    lineNums.scrollTop = textarea.scrollTop;
}

function lintScript() {
    const textarea = document.getElementById('script-textarea');
    const errorBar = document.getElementById('script-error-bar');
    const code = textarea.value;
    if (!code.trim()) { errorBar.classList.add('hidden'); return; }

    try {
        // Quick syntax check
        new Function(code);
        errorBar.classList.add('hidden');
        textarea.style.borderColor = '';
    } catch (err) {
        errorBar.classList.remove('hidden');
        errorBar.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${err.message}`;
        textarea.style.borderColor = '#c0392b';
    }
}

// ─── API Reference Sidebar ────────────────────────────────────────────────────
const API_REF = [
    { category: 'Transform', color: '#5283e0', entries: [
        { sig: 'transform.setPosition(x, y, z)',    desc: 'Move to world position' },
        { sig: 'transform.translate(x, y, z)',       desc: 'Offset by amount' },
        { sig: 'transform.position',                 desc: '→ {x,y,z} getter' },
        { sig: 'transform.rotate(x, y, z)',          desc: 'Rotate by degrees/frame' },
        { sig: 'transform.setRotation(x, y, z)',     desc: 'Set rotation in degrees' },
        { sig: 'transform.rotation',                 desc: '→ {x,y,z} in degrees' },
        { sig: 'transform.setScale(x, y, z)',        desc: 'Set uniform/non-uniform scale' },
        { sig: 'transform.lookAt(x, y, z)',          desc: 'Face a world point' },
        { sig: 'transform.getWorldPosition()',       desc: '→ {x,y,z} in world space' },
    ]},
    { category: 'Material', color: '#e08052', entries: [
        { sig: 'material.setColor(hex)',             desc: 'Set object color' },
        { sig: 'material.color',                     desc: '→ hex string getter/setter' },
        { sig: 'material.roughness',                 desc: '0–1 getter/setter' },
        { sig: 'material.metalness',                 desc: '0–1 getter/setter' },
        { sig: 'material.opacity',                   desc: '0–1, auto-sets transparent' },
        { sig: 'material.wireframe',                 desc: 'bool getter/setter' },
        { sig: 'material.setEmissive(hex, i)',       desc: 'Glow effect' },
    ]},
    { category: 'Light', color: '#e0d052', entries: [
        { sig: 'light.color',                        desc: 'hex getter/setter' },
        { sig: 'light.intensity',                    desc: 'number getter/setter' },
        { sig: 'light.pulse(speed,min,max)',          desc: 'Animate intensity as sine wave' },
    ]},
    { category: 'Self', color: '#52c552', entries: [
        { sig: 'self.name',                          desc: 'Object name getter/setter' },
        { sig: 'self.active',                        desc: 'Visibility bool getter/setter' },
        { sig: 'self.setActive(bool)',               desc: 'Show/hide object' },
        { sig: 'self.data',                          desc: 'Persistent data store object' },
        { sig: 'self.destroy()',                     desc: 'Delete this object from scene' },
        { sig: 'self.addTag(tag)',                   desc: 'Add a tag string' },
        { sig: 'self.hasTag(tag)',                   desc: '→ bool' },
    ]},
    { category: 'Scene', color: '#c552e0', entries: [
        { sig: 'scene.find(name)',                   desc: '→ object API by name' },
        { sig: 'scene.findByTag(tag)',               desc: '→ array of object APIs' },
        { sig: 'scene.backgroundColor',             desc: 'hex getter/setter' },
        { sig: 'scene.setFog(color, near, far)',     desc: 'Add scene fog' },
        { sig: 'scene.removeFog()',                  desc: 'Clear fog' },
    ]},
    { category: 'Input', color: '#52d4e0', entries: [
        { sig: 'input.isKeyDown(key)',               desc: 'Held key → bool' },
        { sig: 'input.isKeyPressed(key)',            desc: 'Just pressed this frame → bool' },
        { sig: 'input.isMouseDown(btn)',             desc: 'Mouse button held → bool' },
        { sig: 'input.getMousePosition()',           desc: '→ {x,y,nx,ny}' },
    ]},
    { category: 'Time', color: '#e05252', entries: [
        { sig: 'time.now',                           desc: 'Seconds since play started' },
        { sig: 'time.fps',                           desc: 'Current frames per second' },
        { sig: 'time.sin(speed)',                    desc: '→ -1..1 sine wave' },
        { sig: 'time.cos(speed)',                    desc: '→ -1..1 cosine wave' },
        { sig: 'time.pingPong(speed)',               desc: '→ 0..1 bouncing' },
    ]},
    { category: 'Camera', color: '#e0a052', entries: [
        { sig: 'camera.position',                   desc: '{x,y,z} getter' },
        { sig: 'camera.setPosition(x,y,z)',         desc: 'Move editor camera' },
        { sig: 'camera.lookAt(x,y,z)',              desc: 'Point camera at position' },
        { sig: 'camera.fov',                        desc: 'Field of view getter/setter' },
        { sig: 'camera.shake(intensity,duration)',  desc: 'Screen shake effect' },
    ]},
    { category: 'Math', color: '#a0e052', entries: [
        { sig: 'math.lerp(a, b, t)',                desc: 'Linear interpolation' },
        { sig: 'math.clamp(v, min, max)',           desc: 'Constrain value' },
        { sig: 'math.random(min, max)',             desc: 'Random float in range' },
        { sig: 'math.randomInt(min, max)',          desc: 'Random integer in range' },
        { sig: 'math.distance(a, b)',               desc: '3D distance between {x,y,z}' },
        { sig: 'math.deg(radians)',                 desc: 'Radians → Degrees' },
        { sig: 'math.rad(degrees)',                 desc: 'Degrees → Radians' },
    ]},
    { category: 'Audio', color: '#e052a0', entries: [
        { sig: 'audio.playTone(freq,dur,type)',     desc: 'Play a web audio tone' },
    ]},
    { category: 'Events', color: '#52e0a0', entries: [
        { sig: 'events.emit(name, data)',           desc: 'Broadcast event to all scripts' },
        { sig: 'events.on(name, fn)',               desc: 'Listen for event' },
    ]},
    { category: 'Debug', color: '#888', entries: [
        { sig: 'debug.log(msg)',                    desc: 'Log to console' },
        { sig: 'debug.warn(msg)',                   desc: 'Warning in console' },
        { sig: 'debug.error(msg)',                  desc: 'Error in console' },
    ]},
    { category: 'Physics', color: '#e67e22', entries: [
        { sig: 'physics.applyForce(x,y,z)',         desc: 'Apply continuous force' },
        { sig: 'physics.applyImpulse(x,y,z)',       desc: 'Apply instant impulse' },
        { sig: 'physics.applyTorque(x,y,z)',        desc: 'Apply rotational impulse' },
        { sig: 'physics.setVelocity(x,y,z)',        desc: 'Set linear velocity' },
        { sig: 'physics.getVelocity()',             desc: '→ {x,y,z} velocity' },
        { sig: 'physics.setAngularVelocity(x,y,z)','desc': 'Set spin velocity' },
        { sig: 'physics.setGravityScale(s)',        desc: 'Override gravity multiplier' },
        { sig: 'physics.wakeUp()',                  desc: 'Wake sleeping body' },
        { sig: 'physics.onCollision(fn)',           desc: 'Callback on collision enter/exit' },
        { sig: 'physics.bodyType',                  desc: '→ "dynamic"|"static"|"kinematic"' },
    ]},
    { category: 'PostFX', color: '#c084fc', entries: [
        { sig: 'postfx.bloom.enabled = true',       desc: 'Toggle bloom' },
        { sig: 'postfx.bloom.strength = 0.8',       desc: 'Bloom brightness' },
        { sig: 'postfx.bloom.threshold = 0.5',      desc: 'Bloom cutoff' },
        { sig: 'postfx.bloom.pulse(speed,min,max)', desc: 'Animate bloom over time' },
        { sig: 'postfx.dof.enabled = true',         desc: 'Toggle depth of field' },
        { sig: 'postfx.dof.focus = 10',             desc: 'DOF focus distance' },
        { sig: 'postfx.chroma.enabled = true',      desc: 'Chromatic aberration' },
        { sig: 'postfx.chroma.strength = 0.005',    desc: 'Aberration amount' },
        { sig: 'postfx.vignette.enabled = true',    desc: 'Toggle vignette' },
        { sig: 'postfx.vignette.intensity = 0.7',   desc: 'Vignette strength' },
        { sig: 'postfx.grain.enabled = true',       desc: 'Toggle film grain' },
        { sig: 'postfx.grain.intensity = 0.4',      desc: 'Grain amount' },
        { sig: 'postfx.colorGrade.saturation = 1.5','desc': 'Color saturation' },
        { sig: "postfx.preset('neon')",             desc: 'Apply preset: neon/horror/cinematic/reset' },
    ]},
];

function buildAPIReference() {
    renderAPIRef('');
}

function filterAPIRef(q) {
    renderAPIRef(q.toLowerCase().trim());
}

function renderAPIRef(q) {
    const container = document.getElementById('api-reference-list');
    if (!container) return;
    container.innerHTML = '';

    API_REF.forEach(cat => {
        const items = q
            ? cat.entries.filter(e => e.sig.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q))
            : cat.entries;
        if (!items.length) return;

        const catEl = document.createElement('div');
        catEl.className = 'api-category';
        catEl.innerHTML = `<div class="api-cat-header" style="color:${cat.color}">${cat.category}</div>`;

        items.forEach(entry => {
            const row = document.createElement('div');
            row.className = 'api-entry';
            row.innerHTML = `<code class="api-sig" style="color:${cat.color}">${escapeHtml(entry.sig)}</code>
                             <span class="api-desc">${entry.desc}</span>`;
            row.onclick = () => insertAtCursor(entry.sig);
            catEl.appendChild(row);
        });

        container.appendChild(catEl);
    });
}

function insertAtCursor(text) {
    const ta = document.getElementById('script-textarea');
    const start = ta.selectionStart;
    ta.value = ta.value.substring(0, start) + text + ta.value.substring(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + text.length;
    ta.focus();
    updateScriptLineCount();
}

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Snippet Loader ───────────────────────────────────────────────────────────
const SNIPPETS = [
    { name: 'Rotate',    code: `transform.rotate(0, 90 * dt, 0);` },
    { name: 'Bob',       code: `transform.setPosition(transform.position.x, self.data.startY + Math.sin(time.now * 2) * 0.5, transform.position.z);` },
    { name: 'Color Cycle', code: `material.setColor(\`hsl(\${(time.now * 60) % 360}, 80%, 60%)\`);` },
    { name: 'Pulse Light', code: `light.pulse(2, 0.2, 2);` },
    { name: 'Key Move',  code: `if(input.isKeyDown('arrowleft')) transform.translate(-3*dt,0,0);\nif(input.isKeyDown('arrowright')) transform.translate(3*dt,0,0);` },
    { name: 'Orbit',     code: `self.data.a=(self.data.a||0)+dt*60;\ntransform.setPosition(Math.cos(math.rad(self.data.a))*3, transform.position.y, Math.sin(math.rad(self.data.a))*3);` },
    { name: 'Fade In',   code: `material.opacity = math.clamp(time.now, 0, 1);` },
    { name: 'Find+Move', code: `const other = scene.find('Cube');\nif(other) other.transform.translate(0, dt, 0);` },
    { name: 'Event Emit', code: `events.emit('hit', { from: self.name });` },
    { name: 'Cam Shake',  code: `camera.shake(0.3, 400);` },
    { name: 'Jump',       code: `physics.applyImpulse(0, 8, 0);` },
    { name: 'Explode',    code: `physics.applyImpulse(math.random(-5,5), math.random(3,8), math.random(-5,5));` },
    { name: 'Bloom On',   code: `postfx.bloom.enabled = true;\npostfx.bloom.strength = 1.0;` },
    { name: 'Neon FX',    code: `postfx.preset('neon');` },
    { name: 'Horror FX',  code: `postfx.preset('horror');` },
    { name: 'Bloom Pulse',code: `postfx.bloom.pulse(2, 0.2, 1.5);` },
    { name: 'DOF Focus',  code: `postfx.dof.enabled = true;\npostfx.dof.focus = math.lerp(postfx.dof.focus, 5, dt * 2);` },
];

function renderSnippets() {
    const container = document.getElementById('snippet-list');
    if (!container) return;
    container.innerHTML = '';
    SNIPPETS.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'snippet-btn';
        btn.innerText = s.name;
        btn.title = s.code;
        btn.onclick = () => insertAtCursor('\n' + s.code + '\n');
        container.appendChild(btn);
    });
}
