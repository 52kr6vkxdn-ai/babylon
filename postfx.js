/**
 * postfx.js — Three.js Post-Processing Effects
 *
 * Uses EffectComposer with:
 *   - Bloom (UnrealBloomPass)
 *   - Depth of Field (BokehPass)
 *   - Chromatic Aberration (ShaderPass)
 *   - Vignette (ShaderPass)
 *   - Film Grain (ShaderPass)
 *   - Color Grading / LUT (ShaderPass)
 *   - Outline selection highlight
 *
 * Script API:  postfx.bloom.intensity = 0.8
 *              postfx.dof.focus = 5
 *              postfx.chromaticAberration.strength = 0.005
 *              postfx.vignette.intensity = 0.5
 *              postfx.filmGrain.intensity = 0.35
 *              postfx.enabled = false
 */

let composer    = null;
let bloomPass   = null;
let bokehPass   = null;
let chromaPass  = null;
let vignettePass= null;
let filmPass    = null;
let renderPass  = null;
let postfxEnabled = false;

// Current settings (readable/writable from scripts)
const postfxSettings = {
    bloom:    { enabled: false, strength: 0.4, radius: 0.4, threshold: 0.85 },
    dof:      { enabled: false, focus: 10, aperture: 0.00002, maxblur: 0.008 },
    chroma:   { enabled: false, strength: 0.003 },
    vignette: { enabled: false, intensity: 0.5, smoothness: 0.5 },
    grain:    { enabled: false, intensity: 0.35, animated: true },
    colorGrade:{ enabled: false, saturation: 1.0, brightness: 1.0, contrast: 1.0, hue: 0 },
};

// ─── CDN loaders ─────────────────────────────────────────────────────────────
const FX_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';

function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = url; s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function loadPostFXDeps() {
    try {
        await loadScript(FX_CDN + 'postprocessing/EffectComposer.js');
        await loadScript(FX_CDN + 'postprocessing/RenderPass.js');
        await loadScript(FX_CDN + 'postprocessing/ShaderPass.js');
        await loadScript(FX_CDN + 'postprocessing/UnrealBloomPass.js');
        await loadScript(FX_CDN + 'postprocessing/BokehPass.js');
        await loadScript(FX_CDN + 'shaders/CopyShader.js');
        await loadScript(FX_CDN + 'shaders/LuminosityHighPassShader.js');
        await loadScript(FX_CDN + 'shaders/BokehShader.js');
        return true;
    } catch(e) {
        logConsole(`PostFX deps load failed: ${e.message}`, 'error');
        return false;
    }
}

// ─── Custom Shaders ───────────────────────────────────────────────────────────
const ChromaShader = {
    uniforms: {
        tDiffuse: { value: null },
        strength: { value: 0.003 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float strength;
        varying vec2 vUv;
        void main() {
            vec2 dir = vUv - 0.5;
            float dist = length(dir);
            vec2 offs = normalize(dir) * dist * strength;
            float r = texture2D(tDiffuse, vUv + offs).r;
            float g = texture2D(tDiffuse, vUv).g;
            float b = texture2D(tDiffuse, vUv - offs).b;
            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `
};

const VignetteShader = {
    uniforms: {
        tDiffuse:   { value: null },
        intensity:  { value: 0.5 },
        smoothness: { value: 0.5 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        uniform float smoothness;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            vec2 uv = (vUv - 0.5) * 2.0;
            float vig = 1.0 - smoothstep(1.0 - smoothness, 1.0, length(uv) * intensity);
            gl_FragColor = vec4(color.rgb * vig, color.a);
        }
    `
};

const FilmGrainShader = {
    uniforms: {
        tDiffuse:  { value: null },
        intensity: { value: 0.35 },
        time:      { value: 0.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        uniform float time;
        varying vec2 vUv;
        float rand(vec2 co){ return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453 + time); }
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float noise = rand(vUv) * intensity;
            gl_FragColor = vec4(color.rgb + noise * 0.1 - 0.05, color.a);
        }
    `
};

const ColorGradeShader = {
    uniforms: {
        tDiffuse:   { value: null },
        saturation: { value: 1.0 },
        brightness: { value: 1.0 },
        contrast:   { value: 1.0 },
        hue:        { value: 0.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float saturation, brightness, contrast, hue;
        varying vec2 vUv;
        vec3 rgb2hsv(vec3 c){
            vec4 K=vec4(0,-1./3.,2./3.,-1.);
            vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
            vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
            float d=q.x-min(q.w,q.y); return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)),d/q.x+1e-10,q.x);
        }
        vec3 hsv2rgb(vec3 c){
            vec4 K=vec4(1.,2./3.,1./3.,3.);
            vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
            return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
        }
        void main(){
            vec4 col=texture2D(tDiffuse,vUv);
            vec3 hsv=rgb2hsv(col.rgb);
            hsv.x=fract(hsv.x+hue);
            hsv.y=clamp(hsv.y*saturation,0.,1.);
            vec3 rgb=hsv2rgb(hsv);
            rgb=(rgb-0.5)*contrast+0.5;
            rgb*=brightness;
            gl_FragColor=vec4(clamp(rgb,0.,1.),col.a);
        }
    `
};

// ─── Init Composer ────────────────────────────────────────────────────────────
async function initPostFX() {
    const ok = await loadPostFXDeps();
    if (!ok) return;

    const container = document.getElementById('canvas-container');
    const w = container.clientWidth;
    const h = container.clientHeight;

    composer = new THREE.EffectComposer(renderer);

    renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Bloom
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w, h),
        postfxSettings.bloom.strength,
        postfxSettings.bloom.radius,
        postfxSettings.bloom.threshold
    );
    bloomPass.enabled = postfxSettings.bloom.enabled;
    composer.addPass(bloomPass);

    // Bokeh / DOF
    bokehPass = new THREE.BokehPass(scene, camera, {
        focus:    postfxSettings.dof.focus,
        aperture: postfxSettings.dof.aperture,
        maxblur:  postfxSettings.dof.maxblur,
        width: w, height: h
    });
    bokehPass.enabled = postfxSettings.dof.enabled;
    composer.addPass(bokehPass);

    // Chromatic Aberration
    chromaPass = new THREE.ShaderPass(ChromaShader);
    chromaPass.enabled = postfxSettings.chroma.enabled;
    composer.addPass(chromaPass);

    // Vignette
    vignettePass = new THREE.ShaderPass(VignetteShader);
    vignettePass.enabled = postfxSettings.vignette.enabled;
    composer.addPass(vignettePass);

    // Film Grain
    filmPass = new THREE.ShaderPass(FilmGrainShader);
    filmPass.enabled = postfxSettings.grain.enabled;
    composer.addPass(filmPass);

    // Color Grading
    const cgPass = new THREE.ShaderPass(ColorGradeShader);
    cgPass.renderToScreen = true;
    composer.addPass(cgPass);
    composer._colorGradePass = cgPass;

    // Resize handling
    const ro = new ResizeObserver(() => {
        const W = container.clientWidth, H = container.clientHeight;
        if (composer) composer.setSize(W, H);
        if (bloomPass) bloomPass.resolution.set(W, H);
    });
    ro.observe(container);

    logConsole('Post-FX composer ready. Enable effects in Scene Settings → Post-Processing.', 'info');
    postfxEnabled = true;
    updatePostFXUI();
}

// ─── Render via composer ──────────────────────────────────────────────────────
function renderWithFX() {
    if (!composer || !postfxEnabled || !anyFXEnabled()) {
        renderer.render(scene, camera);
        return;
    }

    // Animate grain
    if (filmPass && filmPass.enabled && postfxSettings.grain.animated) {
        filmPass.uniforms.time.value = performance.now() * 0.001;
    }

    // Update color grade
    if (composer._colorGradePass) {
        const cg = postfxSettings.colorGrade;
        const u = composer._colorGradePass.uniforms;
        u.saturation.value = cg.saturation;
        u.brightness.value = cg.brightness;
        u.contrast.value   = cg.contrast;
        u.hue.value        = cg.hue;
        composer._colorGradePass.enabled = cg.enabled;
    }

    composer.render();
}

function anyFXEnabled() {
    return postfxSettings.bloom.enabled
        || postfxSettings.dof.enabled
        || postfxSettings.chroma.enabled
        || postfxSettings.vignette.enabled
        || postfxSettings.grain.enabled
        || postfxSettings.colorGrade.enabled;
}

// ─── Apply settings helpers ───────────────────────────────────────────────────
function applyBloomSettings() {
    if (!bloomPass) return;
    bloomPass.enabled   = postfxSettings.bloom.enabled;
    bloomPass.strength  = postfxSettings.bloom.strength;
    bloomPass.radius    = postfxSettings.bloom.radius;
    bloomPass.threshold = postfxSettings.bloom.threshold;
}

function applyDOFSettings() {
    if (!bokehPass) return;
    bokehPass.enabled = postfxSettings.dof.enabled;
    bokehPass.uniforms['focus'].value    = postfxSettings.dof.focus;
    bokehPass.uniforms['aperture'].value = postfxSettings.dof.aperture;
    bokehPass.uniforms['maxblur'].value  = postfxSettings.dof.maxblur;
}

function applyChromaSettings() {
    if (!chromaPass) return;
    chromaPass.enabled = postfxSettings.chroma.enabled;
    chromaPass.uniforms.strength.value = postfxSettings.chroma.strength;
}

function applyVignetteSettings() {
    if (!vignettePass) return;
    vignettePass.enabled = postfxSettings.vignette.enabled;
    vignettePass.uniforms.intensity.value  = postfxSettings.vignette.intensity;
    vignettePass.uniforms.smoothness.value = postfxSettings.vignette.smoothness;
}

function applyGrainSettings() {
    if (!filmPass) return;
    filmPass.enabled = postfxSettings.grain.enabled;
    filmPass.uniforms.intensity.value = postfxSettings.grain.intensity;
}

// ─── PostFX Script API ────────────────────────────────────────────────────────
function buildPostFXScriptAPI() {
    return {
        get enabled() { return postfxEnabled; },
        set enabled(v) { postfxEnabled = v; },

        bloom: {
            get enabled()   { return postfxSettings.bloom.enabled; },
            set enabled(v)  { postfxSettings.bloom.enabled = v; applyBloomSettings(); },
            get strength()  { return postfxSettings.bloom.strength; },
            set strength(v) { postfxSettings.bloom.strength = v; applyBloomSettings(); },
            get radius()    { return postfxSettings.bloom.radius; },
            set radius(v)   { postfxSettings.bloom.radius = v; applyBloomSettings(); },
            get threshold() { return postfxSettings.bloom.threshold; },
            set threshold(v){ postfxSettings.bloom.threshold = v; applyBloomSettings(); },
            pulse(speed = 1, min = 0.1, max = 1.5) {
                postfxSettings.bloom.strength = min + (Math.sin(performance.now() * 0.001 * speed) * 0.5 + 0.5) * (max - min);
                applyBloomSettings();
            }
        },

        dof: {
            get enabled()  { return postfxSettings.dof.enabled; },
            set enabled(v) { postfxSettings.dof.enabled = v; applyDOFSettings(); },
            get focus()    { return postfxSettings.dof.focus; },
            set focus(v)   { postfxSettings.dof.focus = v; applyDOFSettings(); },
            get aperture() { return postfxSettings.dof.aperture; },
            set aperture(v){ postfxSettings.dof.aperture = v; applyDOFSettings(); },
            get maxblur()  { return postfxSettings.dof.maxblur; },
            set maxblur(v) { postfxSettings.dof.maxblur = v; applyDOFSettings(); },
        },

        chroma: {
            get enabled()  { return postfxSettings.chroma.enabled; },
            set enabled(v) { postfxSettings.chroma.enabled = v; applyChromaSettings(); },
            get strength() { return postfxSettings.chroma.strength; },
            set strength(v){ postfxSettings.chroma.strength = v; applyChromaSettings(); },
        },

        vignette: {
            get enabled()    { return postfxSettings.vignette.enabled; },
            set enabled(v)   { postfxSettings.vignette.enabled = v; applyVignetteSettings(); },
            get intensity()  { return postfxSettings.vignette.intensity; },
            set intensity(v) { postfxSettings.vignette.intensity = v; applyVignetteSettings(); },
            get smoothness() { return postfxSettings.vignette.smoothness; },
            set smoothness(v){ postfxSettings.vignette.smoothness = v; applyVignetteSettings(); },
        },

        grain: {
            get enabled()   { return postfxSettings.grain.enabled; },
            set enabled(v)  { postfxSettings.grain.enabled = v; applyGrainSettings(); },
            get intensity() { return postfxSettings.grain.intensity; },
            set intensity(v){ postfxSettings.grain.intensity = v; applyGrainSettings(); },
        },

        colorGrade: {
            get enabled()      { return postfxSettings.colorGrade.enabled; },
            set enabled(v)     { postfxSettings.colorGrade.enabled = v; },
            get saturation()   { return postfxSettings.colorGrade.saturation; },
            set saturation(v)  { postfxSettings.colorGrade.saturation = v; },
            get brightness()   { return postfxSettings.colorGrade.brightness; },
            set brightness(v)  { postfxSettings.colorGrade.brightness = v; },
            get contrast()     { return postfxSettings.colorGrade.contrast; },
            set contrast(v)    { postfxSettings.colorGrade.contrast = v; },
            get hue()          { return postfxSettings.colorGrade.hue; },
            set hue(v)         { postfxSettings.colorGrade.hue = v; },
        },

        // Convenience presets
        preset(name) {
            const presets = {
                horror: () => {
                    postfxSettings.grain.enabled    = true;  postfxSettings.grain.intensity = 0.6;
                    postfxSettings.vignette.enabled = true;  postfxSettings.vignette.intensity = 0.9;
                    postfxSettings.colorGrade.enabled = true; postfxSettings.colorGrade.saturation = 0.3;
                    postfxSettings.colorGrade.contrast = 1.4;
                },
                neon: () => {
                    postfxSettings.bloom.enabled    = true;  postfxSettings.bloom.strength = 1.2;
                    postfxSettings.chroma.enabled   = true;  postfxSettings.chroma.strength = 0.006;
                    postfxSettings.colorGrade.enabled = true; postfxSettings.colorGrade.saturation = 1.8;
                },
                cinematic: () => {
                    postfxSettings.dof.enabled      = true;
                    postfxSettings.vignette.enabled = true;  postfxSettings.vignette.intensity = 0.6;
                    postfxSettings.grain.enabled    = true;  postfxSettings.grain.intensity = 0.2;
                    postfxSettings.colorGrade.enabled = true; postfxSettings.colorGrade.contrast = 1.15;
                },
                reset: () => {
                    Object.keys(postfxSettings).forEach(k => { postfxSettings[k].enabled = false; });
                }
            };
            if (presets[name]) {
                presets[name]();
                applyBloomSettings(); applyDOFSettings(); applyChromaSettings();
                applyVignetteSettings(); applyGrainSettings();
            }
        }
    };
}

// ─── UI sync ──────────────────────────────────────────────────────────────────
function updatePostFXUI() {
    const map = {
        'fx-bloom-enabled':    postfxSettings.bloom.enabled,
        'fx-dof-enabled':      postfxSettings.dof.enabled,
        'fx-chroma-enabled':   postfxSettings.chroma.enabled,
        'fx-vignette-enabled': postfxSettings.vignette.enabled,
        'fx-grain-enabled':    postfxSettings.grain.enabled,
        'fx-cg-enabled':       postfxSettings.colorGrade.enabled,
    };
    Object.entries(map).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.checked = val;
    });
}

function onPostFXUIChange() {
    postfxSettings.bloom.enabled    = !!document.getElementById('fx-bloom-enabled')?.checked;
    postfxSettings.bloom.strength   = parseFloat(document.getElementById('fx-bloom-strength')?.value || 0.4);
    postfxSettings.bloom.threshold  = parseFloat(document.getElementById('fx-bloom-threshold')?.value || 0.85);
    postfxSettings.bloom.radius     = parseFloat(document.getElementById('fx-bloom-radius')?.value || 0.4);

    postfxSettings.dof.enabled      = !!document.getElementById('fx-dof-enabled')?.checked;
    postfxSettings.dof.focus        = parseFloat(document.getElementById('fx-dof-focus')?.value || 10);
    postfxSettings.dof.aperture     = parseFloat(document.getElementById('fx-dof-aperture')?.value || 0.00002);
    postfxSettings.dof.maxblur      = parseFloat(document.getElementById('fx-dof-maxblur')?.value || 0.008);

    postfxSettings.chroma.enabled   = !!document.getElementById('fx-chroma-enabled')?.checked;
    postfxSettings.chroma.strength  = parseFloat(document.getElementById('fx-chroma-strength')?.value || 0.003);

    postfxSettings.vignette.enabled    = !!document.getElementById('fx-vignette-enabled')?.checked;
    postfxSettings.vignette.intensity  = parseFloat(document.getElementById('fx-vignette-intensity')?.value || 0.5);
    postfxSettings.vignette.smoothness = parseFloat(document.getElementById('fx-vignette-smoothness')?.value || 0.5);

    postfxSettings.grain.enabled    = !!document.getElementById('fx-grain-enabled')?.checked;
    postfxSettings.grain.intensity  = parseFloat(document.getElementById('fx-grain-intensity')?.value || 0.35);

    postfxSettings.colorGrade.enabled     = !!document.getElementById('fx-cg-enabled')?.checked;
    postfxSettings.colorGrade.saturation  = parseFloat(document.getElementById('fx-cg-saturation')?.value || 1);
    postfxSettings.colorGrade.brightness  = parseFloat(document.getElementById('fx-cg-brightness')?.value || 1);
    postfxSettings.colorGrade.contrast    = parseFloat(document.getElementById('fx-cg-contrast')?.value || 1);
    postfxSettings.colorGrade.hue        = parseFloat(document.getElementById('fx-cg-hue')?.value || 0);

    applyBloomSettings(); applyDOFSettings(); applyChromaSettings();
    applyVignetteSettings(); applyGrainSettings();
}
