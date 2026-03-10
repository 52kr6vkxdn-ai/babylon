/**
 * physics.js — Rapier WASM physics integration
 *
 * RULES:
 *  - Physics world is CREATED and STEPPED only during Play mode
 *  - On Play: snapshots all object transforms, creates rigid bodies
 *  - On Stop: destroys world, RESTORES all transforms to pre-play state
 *  - Editor is always physics-free / transform manipulation is manual
 *
 * Per-object physics config stored in entry.physics:
 *   { enabled, bodyType, mass, restitution, friction, linearDamping,
 *     angularDamping, gravityScale, isTrigger, shape }
 */

// ─── State ────────────────────────────────────────────────────────────────────
let RAPIER = null;           // Rapier module once loaded
let physicsWorld = null;     // Active world (only during play)
let physicsEventQueue = null;
const physicsBodies = {};    // objectId -> { rigidBody, collider }
let   prePlaySnapshots = {}; // objectId -> {pos, rot} captured before play
let   physicsReady = false;

const PHYSICS_STEP = 1 / 60;
let   physicsAccum = 0;

// Default per-object physics config
function defaultPhysicsConfig() {
    return {
        enabled:        false,
        bodyType:       'dynamic',   // 'dynamic' | 'kinematic' | 'static'
        mass:           1.0,
        restitution:    0.3,
        friction:       0.5,
        linearDamping:  0.1,
        angularDamping: 0.1,
        gravityScale:   1.0,
        isTrigger:      false,
        shape:          'auto',      // 'auto' | 'box' | 'sphere' | 'capsule'
    };
}

// ─── Load Rapier ─────────────────────────────────────────────────────────────
async function loadRapier() {
    if (RAPIER) return true;
    try {
        // Load Rapier via CDN using the UMD bundle
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.11.2/rapier.umd.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
        await window.RAPIER.init();
        RAPIER = window.RAPIER;
        physicsReady = true;
        logConsole('✓ Rapier physics loaded.', 'success');
        return true;
    } catch (e) {
        logConsole(`✗ Rapier failed to load: ${e.message}. Physics disabled.`, 'error');
        physicsReady = false;
        return false;
    }
}

// ─── Snapshot all transforms before play ─────────────────────────────────────
function snapshotTransforms() {
    prePlaySnapshots = {};
    engineObjects.forEach(entry => {
        const o = entry.object;
        prePlaySnapshots[entry.id] = {
            px: o.position.x, py: o.position.y, pz: o.position.z,
            rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z,
            sx: o.scale.x,    sy: o.scale.y,    sz: o.scale.z,
        };
    });
}

// ─── Restore all transforms after stop ───────────────────────────────────────
function restoreTransforms() {
    engineObjects.forEach(entry => {
        const snap = prePlaySnapshots[entry.id];
        if (!snap) return;
        entry.object.position.set(snap.px, snap.py, snap.pz);
        entry.object.rotation.set(snap.rx, snap.ry, snap.rz);
        entry.object.scale.set(snap.sx, snap.sy, snap.sz);
    });
    if (selectedObject) updateInspectorFromObject();
    logConsole('Transforms restored to pre-play state.', 'info');
}

// ─── Create physics world & bodies for play ───────────────────────────────────
async function startPhysics() {
    if (!physicsReady) {
        const ok = await loadRapier();
        if (!ok) return;
    }

    snapshotTransforms();
    physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    physicsEventQueue = new RAPIER.EventQueue(true);

    let bodyCount = 0;
    engineObjects.forEach(entry => {
        const phys = entry.physics;
        if (!phys || !phys.enabled) return;
        const body = createRigidBody(entry);
        if (body) bodyCount++;
    });

    physicsAccum = 0;
    logConsole(`⚙ Physics world started. ${bodyCount} bodies active.`, 'success');
}

// ─── Create a single rigid body from an engine object ────────────────────────
function createRigidBody(entry) {
    if (!physicsWorld || !RAPIER) return null;
    const phys = entry.physics;
    const obj  = entry.object;
    if (!phys || !phys.enabled) return null;

    // Rigid body descriptor
    let rbDesc;
    switch (phys.bodyType) {
        case 'static':     rbDesc = RAPIER.RigidBodyDesc.fixed(); break;
        case 'kinematic':  rbDesc = RAPIER.RigidBodyDesc.kinematicPositionBased(); break;
        default:           rbDesc = RAPIER.RigidBodyDesc.dynamic(); break;
    }

    // World position
    const worldPos = new THREE.Vector3();
    obj.getWorldPosition(worldPos);
    const worldQuat = new THREE.Quaternion();
    obj.getWorldQuaternion(worldQuat);

    rbDesc.setTranslation(worldPos.x, worldPos.y, worldPos.z);
    rbDesc.setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w });

    if (phys.bodyType === 'dynamic') {
        rbDesc.setLinearDamping(phys.linearDamping ?? 0.1);
        rbDesc.setAngularDamping(phys.angularDamping ?? 0.1);
        rbDesc.setGravityScale(phys.gravityScale ?? 1.0);
        rbDesc.setAdditionalMass(phys.mass ?? 1.0);
    }

    const rigidBody = physicsWorld.createRigidBody(rbDesc);

    // Collider
    const collider = buildCollider(entry, rigidBody);

    physicsBodies[entry.id] = { rigidBody, collider };
    return rigidBody;
}

function buildCollider(entry, rigidBody) {
    if (!physicsWorld || !RAPIER) return null;
    const phys = entry.physics;
    const obj  = entry.object;

    // Determine shape
    let shapeType = phys.shape || 'auto';
    if (shapeType === 'auto') {
        const typeMap = {
            Sphere: 'sphere', Cube: 'box', Plane: 'box',
            Cylinder: 'cylinder', Cone: 'box', Torus: 'box',
            Icosphere: 'sphere', Ring: 'box',
        };
        shapeType = typeMap[entry.type] || 'box';
    }

    const scale = new THREE.Vector3();
    obj.getWorldScale(scale);

    let colDesc;
    try {
        switch (shapeType) {
            case 'sphere':
                colDesc = RAPIER.ColliderDesc.ball(Math.max(scale.x, scale.y, scale.z) * 0.5);
                break;
            case 'cylinder':
                colDesc = RAPIER.ColliderDesc.cylinder(scale.y * 0.5, scale.x * 0.5);
                break;
            case 'capsule':
                colDesc = RAPIER.ColliderDesc.capsule(scale.y * 0.4, scale.x * 0.3);
                break;
            default:
                colDesc = RAPIER.ColliderDesc.cuboid(scale.x * 0.5, scale.y * 0.5, scale.z * 0.5);
        }
    } catch(e) {
        colDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    }

    colDesc.setRestitution(phys.restitution ?? 0.3);
    colDesc.setFriction(phys.friction ?? 0.5);
    if (phys.isTrigger) colDesc.setSensor(true);

    return physicsWorld.createCollider(colDesc, rigidBody);
}

// ─── Stop physics & restore transforms ───────────────────────────────────────
function stopPhysics() {
    Object.values(physicsBodies).forEach(({ rigidBody, collider }) => {
        try {
            if (collider && physicsWorld) physicsWorld.removeCollider(collider, false);
            if (rigidBody && physicsWorld) physicsWorld.removeRigidBody(rigidBody);
        } catch(e) {}
    });
    Object.keys(physicsBodies).forEach(k => delete physicsBodies[k]);

    if (physicsWorld) {
        physicsWorld.free();
        physicsWorld = null;
    }
    physicsEventQueue = null;
    restoreTransforms();
}

// ─── Step physics world — called from animate() when isPlaying ───────────────
function stepPhysics(dt) {
    if (!isPlaying || !physicsWorld || !physicsReady) return;

    physicsAccum += dt;
    while (physicsAccum >= PHYSICS_STEP) {
        physicsWorld.step(physicsEventQueue);
        physicsAccum -= PHYSICS_STEP;
    }

    // Sync Three.js objects from Rapier bodies
    Object.entries(physicsBodies).forEach(([id, { rigidBody }]) => {
        if (!rigidBody || rigidBody.isSleeping()) return;
        const entry = engineObjects.find(o => o.id === id);
        if (!entry) return;

        const t = rigidBody.translation();
        const r = rigidBody.rotation();
        const obj = entry.object;

        obj.position.set(t.x, t.y, t.z);
        obj.quaternion.set(r.x, r.y, r.z, r.w);
    });

    // Handle events (collisions as triggers)
    if (physicsEventQueue) {
        physicsEventQueue.drainCollisionEvents((h1, h2, started) => {
            const entry1 = findEntryByColliderHandle(h1);
            const entry2 = findEntryByColliderHandle(h2);
            if (entry1 && entry2) {
                const evtName = started ? 'onCollisionEnter' : 'onCollisionExit';
                scriptEventBus.emit(evtName, { other: entry2.name, otherId: entry2.id }, entry1.id);
                scriptEventBus.emit(evtName, { other: entry1.name, otherId: entry1.id }, entry2.id);
            }
        });
    }
}

function findEntryByColliderHandle(handle) {
    for (const [id, data] of Object.entries(physicsBodies)) {
        if (data.collider && data.collider.handle === handle) {
            return engineObjects.find(o => o.id === id);
        }
    }
    return null;
}

// ─── Physics Script API ───────────────────────────────────────────────────────
function buildPhysicsAPI(entry) {
    return {
        get enabled() { return !!(entry.physics && entry.physics.enabled); },

        applyForce(x, y, z) {
            const body = physicsBodies[entry.id]?.rigidBody;
            if (body && isPlaying) body.applyForce({ x, y, z }, true);
        },
        applyImpulse(x, y, z) {
            const body = physicsBodies[entry.id]?.rigidBody;
            if (body && isPlaying) body.applyImpulse({ x, y, z }, true);
        },
        applyTorque(x, y, z) {
            const body = physicsBodies[entry.id]?.rigidBody;
            if (body && isPlaying) body.applyTorqueImpulse({ x, y, z }, true);
        },
        setVelocity(x, y, z) {
            const body = physicsBodies[entry.id]?.rigidBody;
            if (body && isPlaying) body.setLinvel({ x, y, z }, true);
        },
        getVelocity() {
            const body = physicsBodies[entry.id]?.rigidBody;
            if (!body) return { x:0, y:0, z:0 };
            const v = body.linvel();
            return { x: v.x, y: v.y, z: v.z };
        },
        setAngularVelocity(x, y, z) {
            const body = physicsBodies[entry.id]?.rigidBody;
            if (body && isPlaying) body.setAngvel({ x, y, z }, true);
        },
        setGravityScale(s) {
            const body = physicsBodies[entry.id]?.rigidBody;
            if (body && isPlaying) body.setGravityScale(s, true);
            if (entry.physics) entry.physics.gravityScale = s;
        },
        get isSleeping() {
            const body = physicsBodies[entry.id]?.rigidBody;
            return body ? body.isSleeping() : true;
        },
        wakeUp() {
            const body = physicsBodies[entry.id]?.rigidBody;
            if (body) body.wakeUp();
        },
        onCollision(fn) {
            scriptEventBus.on('onCollisionEnter', (data, senderId) => {
                if (senderId === entry.id) fn(data.other, data.otherId, true);
            }, entry.id);
            scriptEventBus.on('onCollisionExit', (data, senderId) => {
                if (senderId === entry.id) fn(data.other, data.otherId, false);
            }, entry.id);
        },
        addForceField(radius = 5, strength = 10) {
            // Store force field for tick
            entry.physics._forceField = { radius, strength };
        },
        get bodyType() { return entry.physics?.bodyType || 'none'; },
    };
}
