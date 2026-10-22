import * as THREE from 'three';

export class FXSystem {
    constructor(scene) {
        this.scene = scene;
        
        // Reusable dummy transform helper
        this._dummy = new THREE.Object3D();
        this._tempColor = new THREE.Color();
        this._zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

        // 1. Drone Trail System
        this.maxTrails = 1500;
        this.trailGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        this.trailMat = new THREE.MeshStandardMaterial({ 
            color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2.0, 
            transparent: true, opacity: 0.8 
        });
        this.trailMesh = new THREE.InstancedMesh(this.trailGeo, this.trailMat, this.maxTrails);
        this.trailMesh.count = 0;
        this.trailMesh.frustumCulled = false;
        this.scene.add(this.trailMesh);
        
        this.trailData = new Array(this.maxTrails);
        this.trailHead = 0;
        for (let i = 0; i < this.maxTrails; i++) {
            this.trailData[i] = { active: false, life: 0, maxLife: 0.5, x: 0, y: 0, z: 0 };
        }

        // 2. Instanced Smoke & Rocket Plume System (Consolidated single draw call)
        this.maxSmoke = 350;
        this.smokeGeo = new THREE.DodecahedronGeometry(0.14, 0);
        this.smokeMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, roughness: 0.9, metalness: 0.1, 
            transparent: true, opacity: 0.75, flatShading: true 
        });
        this.smokeMesh = new THREE.InstancedMesh(this.smokeGeo, this.smokeMat, this.maxSmoke);
        this.smokeMesh.count = this.maxSmoke;
        this.smokeMesh.frustumCulled = false;
        this.smokeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxSmoke * 3), 3);
        for (let i = 0; i < this.maxSmoke; i++) {
            this.smokeMesh.setMatrixAt(i, this._zeroMatrix);
        }
        this.smokeMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(this.smokeMesh);

        this.smokeData = new Array(this.maxSmoke);
        this.smokeHead = 0;
        for (let i = 0; i < this.maxSmoke; i++) {
            this.smokeData[i] = {
                active: false,
                x: 0, y: 0, z: 0,
                vx: 0, vy: 0, vz: 0,
                life: 0, maxLife: 1.0,
                baseScale: 1.0,
                isPlume: false, isCore: false,
                r: 0.9, g: 0.9, b: 0.9
            };
        }

        // 3. Instanced Debris & Sparks System (Trees, miners, destruction)
        this.maxDebris = 350;
        this.debrisGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        this.debrisMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, roughness: 0.8, metalness: 0.2, flatShading: true 
        });
        this.debrisMesh = new THREE.InstancedMesh(this.debrisGeo, this.debrisMat, this.maxDebris);
        this.debrisMesh.count = this.maxDebris;
        this.debrisMesh.frustumCulled = false;
        this.debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxDebris * 3), 3);
        for (let i = 0; i < this.maxDebris; i++) {
            this.debrisMesh.setMatrixAt(i, this._zeroMatrix);
        }
        this.debrisMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(this.debrisMesh);

        this.debrisData = new Array(this.maxDebris);
        this.debrisHead = 0;
        for (let i = 0; i < this.maxDebris; i++) {
            this.debrisData[i] = {
                active: false,
                x: 0, y: 0, z: 0,
                vx: 0, vy: 0, vz: 0,
                life: 0, maxLife: 1.0,
                scale: 1.0,
                r: 0.5, g: 0.5, b: 0.5
            };
        }
    }

    spawnTrail(x, y, z) {
        const idx = this.trailHead;
        this.trailData[idx] = { active: true, life: 0.5, maxLife: 0.5, x, y, z };
        
        this._dummy.position.set(x, y, z);
        this._dummy.scale.set(1, 1, 1);
        this._dummy.updateMatrix();
        this.trailMesh.setMatrixAt(idx, this._dummy.matrix);
        
        this.trailHead = (this.trailHead + 1) % this.maxTrails;
        if (this.trailMesh.count < this.maxTrails) this.trailMesh.count++;
        this.trailMesh.instanceMatrix.needsUpdate = true;
    }

    spawnSmoke(x, y, z) {
        const idx = this.smokeHead;
        const p = this.smokeData[idx];
        const maxLife = 1.2 + Math.random() * 0.4;
        
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 0.08;
        p.y = y;
        p.z = z + (Math.random() - 0.5) * 0.08;
        p.vx = (Math.random() - 0.5) * 0.15;
        p.vy = 0.4 + Math.random() * 0.3;
        p.vz = (Math.random() - 0.5) * 0.15;
        p.life = maxLife;
        p.maxLife = maxLife;
        p.baseScale = 0.6 + Math.random() * 0.4;
        p.isPlume = false;
        p.isCore = false;
        p.r = 0.9; p.g = 0.9; p.b = 0.9;
        
        this._tempColor.setRGB(p.r, p.g, p.b);
        this.smokeMesh.setColorAt(idx, this._tempColor);
        
        this.smokeHead = (this.smokeHead + 1) % this.maxSmoke;
    }

    spawnRocketPlume(x, y, z) {
        const idx = this.smokeHead;
        const p = this.smokeData[idx];
        const maxLife = 0.9 + Math.random() * 0.4;
        const isCore = Math.random() > 0.6;
        
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 0.2;
        p.y = y + (Math.random() - 0.5) * 0.2;
        p.z = z + (Math.random() - 0.5) * 0.2;
        p.vx = (Math.random() - 0.5) * 0.3;
        p.vy = -2.5 - Math.random() * 1.5;
        p.vz = (Math.random() - 0.5) * 0.3;
        p.life = maxLife;
        p.maxLife = maxLife;
        p.baseScale = (0.5 + Math.random() * 0.3) * (isCore ? 0.8 : 1.0);
        p.isPlume = true;
        p.isCore = isCore;
        
        if (isCore) {
            p.r = 1.0; p.g = 0.66; p.b = 0.0;
        } else {
            p.r = 0.4; p.g = 0.4; p.b = 0.4;
        }
        
        this._tempColor.setRGB(p.r, p.g, p.b);
        this.smokeMesh.setColorAt(idx, this._tempColor);
        
        this.smokeHead = (this.smokeHead + 1) % this.maxSmoke;
    }

    spawnTreeDestruction(x, y, z) {
        for (let i = 0; i < 15; i++) {
            const idx = this.debrisHead;
            const p = this.debrisData[idx];
            const isLeaf = Math.random() > 0.3;
            
            p.active = true;
            p.x = x + (Math.random() - 0.5) * 0.5;
            p.y = y + 0.5 + Math.random() * 0.5;
            p.z = z + (Math.random() - 0.5) * 0.5;
            p.vx = (Math.random() - 0.5) * 4;
            p.vy = Math.random() * 4 + 2;
            p.vz = (Math.random() - 0.5) * 4;
            p.life = 0.9;
            p.maxLife = 0.9;
            p.scale = 1.0;
            
            if (isLeaf) {
                p.r = 0.13; p.g = 0.55; p.b = 0.13; // Forest green
            } else {
                p.r = 0.36; p.g = 0.25; p.b = 0.20; // Wood brown
            }
            
            this._tempColor.setRGB(p.r, p.g, p.b);
            this.debrisMesh.setColorAt(idx, this._tempColor);
            
            this.debrisHead = (this.debrisHead + 1) % this.maxDebris;
        }
    }

    spawnMinerParticles(x, y, z, colorHex) {
        const count = Math.random() > 0.5 ? 2 : 1;
        this._tempColor.setHex(colorHex || 0xffffff);
        
        for (let i = 0; i < count; i++) {
            const idx = this.debrisHead;
            const p = this.debrisData[idx];
            
            p.active = true;
            p.x = x + (Math.random() - 0.5) * 0.4;
            p.y = y + 0.2 + Math.random() * 0.3;
            p.z = z + (Math.random() - 0.5) * 0.4;
            p.vx = (Math.random() - 0.5) * 2;
            p.vy = Math.random() * 2 + 1;
            p.vz = (Math.random() - 0.5) * 2;
            p.life = 0.5;
            p.maxLife = 0.5;
            p.scale = 0.8;
            p.r = this._tempColor.r;
            p.g = this._tempColor.g;
            p.b = this._tempColor.b;
            
            this.debrisMesh.setColorAt(idx, this._tempColor);
            this.debrisHead = (this.debrisHead + 1) % this.maxDebris;
        }
    }

    update(deltaTime) {
        const dt = Math.min(deltaTime, 0.1);
        
        // 1. Update Smoke & Plumes
        let smokeNeedsUpdate = false;
        let smokeColorNeedsUpdate = false;
        
        for (let i = 0; i < this.maxSmoke; i++) {
            const p = this.smokeData[i];
            if (!p.active) continue;
            
            p.life -= dt;
            if (p.life <= 0) {
                p.active = false;
                this.smokeMesh.setMatrixAt(i, this._zeroMatrix);
                smokeNeedsUpdate = true;
                continue;
            }
            
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            
            const t = p.life / p.maxLife; // 1 down to 0
            const age = 1 - t;
            let currentScale;
            
            if (p.isPlume) {
                currentScale = p.baseScale * (1.0 + age * 6.0);
                if (p.isCore && age > 0.3) {
                    p.r = Math.max(0.2, p.r - dt * 2.0);
                    p.g = Math.max(0.2, p.g - dt * 2.0);
                    p.b = Math.max(0.2, p.b - dt * 2.0);
                    this._tempColor.setRGB(p.r, p.g, p.b);
                    this.smokeMesh.setColorAt(i, this._tempColor);
                    smokeColorNeedsUpdate = true;
                }
            } else {
                currentScale = p.baseScale * (1.0 + (1.0 - t) * 1.5) * t;
            }
            
            this._dummy.position.set(p.x, p.y, p.z);
            this._dummy.scale.set(currentScale, currentScale, currentScale);
            this._dummy.updateMatrix();
            this.smokeMesh.setMatrixAt(i, this._dummy.matrix);
            smokeNeedsUpdate = true;
        }
        
        if (smokeNeedsUpdate) this.smokeMesh.instanceMatrix.needsUpdate = true;
        if (smokeColorNeedsUpdate && this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;

        // 2. Update Debris & Sparks
        let debrisNeedsUpdate = false;
        for (let i = 0; i < this.maxDebris; i++) {
            const p = this.debrisData[i];
            if (!p.active) continue;
            
            p.life -= dt;
            if (p.life <= 0) {
                p.active = false;
                this.debrisMesh.setMatrixAt(i, this._zeroMatrix);
                debrisNeedsUpdate = true;
                continue;
            }
            
            p.vy -= 9.8 * dt; // Gravity
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            
            if (p.y < 0.05) {
                p.y = 0.05;
                p.vy *= -0.3; // Bounce
                p.vx *= 0.5;  // Ground friction
                p.vz *= 0.5;
            }
            
            const scale = p.scale * (p.life / p.maxLife);
            this._dummy.position.set(p.x, p.y, p.z);
            this._dummy.scale.set(scale, scale, scale);
            this._dummy.updateMatrix();
            this.debrisMesh.setMatrixAt(i, this._dummy.matrix);
            debrisNeedsUpdate = true;
        }
        
        if (debrisNeedsUpdate) {
            this.debrisMesh.instanceMatrix.needsUpdate = true;
            if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
        }

        // 3. Update Drone Trails
        if (this.trailMesh && this.trailMesh.count > 0) {
            let trailNeedsUpdate = false;
            for (let i = 0; i < this.trailMesh.count; i++) {
                const t = this.trailData[i];
                if (t.active) {
                    t.life -= dt;
                    if (t.life <= 0) {
                        t.active = false;
                        this._dummy.scale.set(0, 0, 0);
                    } else {
                        const prog = t.life / t.maxLife;
                        const scale = prog * prog;
                        this._dummy.position.set(t.x, t.y, t.z);
                        this._dummy.scale.set(scale, scale, scale);
                    }
                    this._dummy.updateMatrix();
                    this.trailMesh.setMatrixAt(i, this._dummy.matrix);
                    trailNeedsUpdate = true;
                }
            }
            if (trailNeedsUpdate) this.trailMesh.instanceMatrix.needsUpdate = true;
        }
    }
}
