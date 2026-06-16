import * as THREE from 'three';

export class FXSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        
        // Reusable particle geometries and materials
        this.particleGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        this.matBrown = new THREE.MeshLambertMaterial({ color: 0x5c4033, flatShading: true });
        this.matGreen = new THREE.MeshLambertMaterial({ color: 0x228b22, flatShading: true });
        
        this.smokeGeo = new THREE.SphereGeometry(0.12, 5, 4);
        this.smokeBaseMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.7, flatShading: true });
        
        // Drone Trail System
        this.maxTrails = 2000;
        this.trailGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        this.trailMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 2.0, transparent: true, opacity: 0.8 });
        this.trailMesh = new THREE.InstancedMesh(this.trailGeo, this.trailMat, this.maxTrails);
        this.trailMesh.count = 0;
        this.trailMesh.frustumCulled = false;
        this.scene.add(this.trailMesh);
        
        this.trailData = new Array(this.maxTrails);
        this.trailHead = 0;
        for (let i = 0; i < this.maxTrails; i++) {
            this.trailData[i] = { active: false, life: 0, maxLife: 0.5, x: 0, y: 0, z: 0 };
        }
    }
    
    spawnTreeDestruction(x, y, z) {
        // Spawn 15 particles
        for(let i=0; i<15; i++) {
            const isLeaf = Math.random() > 0.3;
            const mesh = new THREE.Mesh(this.particleGeo, isLeaf ? this.matGreen : this.matBrown);
            
            // Random start position within the tree volume
            mesh.position.set(
                x + (Math.random() - 0.5) * 0.5,
                y + 0.5 + Math.random() * 0.5,
                z + (Math.random() - 0.5) * 0.5
            );
            
            // Random velocity outward and upward
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                Math.random() * 4 + 2,
                (Math.random() - 0.5) * 4
            );
            
            this.scene.add(mesh);
            
            this.particles.push({
                mesh: mesh,
                velocity: velocity,
                life: 1.0, // 1 second lifetime
                maxLife: 1.0,
                type: 'debris'
            });
        }
    }
    
    spawnTrail(x, y, z) {
        const idx = this.trailHead;
        this.trailData[idx] = { active: true, life: 0.5, maxLife: 0.5, x, y, z };
        
        const dummy = new THREE.Object3D();
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        this.trailMesh.setMatrixAt(idx, dummy.matrix);
        
        this.trailHead = (this.trailHead + 1) % this.maxTrails;
        if (this.trailMesh.count < this.maxTrails) this.trailMesh.count++;
        this.trailMesh.instanceMatrix.needsUpdate = true;
    }
    
    spawnSmoke(x, y, z) {
        // Spawn a single small puff with its own material clone
        const mat = this.smokeBaseMat.clone();
        const mesh = new THREE.Mesh(this.smokeGeo, mat);
        mesh.position.set(
            x + (Math.random() - 0.5) * 0.06,
            y,
            z + (Math.random() - 0.5) * 0.06
        );
        const startScale = 0.6 + Math.random() * 0.4;
        mesh.scale.set(startScale, startScale, startScale);
        this.scene.add(mesh);
        
        const maxLife = 1.5 + Math.random() * 0.5;
        this.particles.push({
            mesh: mesh,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.15,
                0.4 + Math.random() * 0.3,
                (Math.random() - 0.5) * 0.15
            ),
            life: maxLife,
            maxLife: maxLife,
            type: 'smoke'
        });
    }

    spawnRocketPlume(x, y, z) {
        // Spawn a thick but computationally light plume using an expanding smoke particle
        // We only spawn 1 per frame instead of 3, but it grows larger
        const mat = this.smokeBaseMat.clone();
        
        let startScale = 0.5 + Math.random() * 0.3;
        const isCore = Math.random() > 0.6;
        
        if (isCore) {
            mat.color.setHex(0xffaa00);
            mat.opacity = 1.0;
            startScale *= 0.8; // fire core is smaller
        }
        
        const mesh = new THREE.Mesh(this.smokeGeo, mat);
        mesh.position.set(
            x + (Math.random() - 0.5) * 0.2,
            y + (Math.random() - 0.5) * 0.2,
            z + (Math.random() - 0.5) * 0.2
        );
        mesh.scale.set(startScale, startScale, startScale);
        this.scene.add(mesh);
        
        const maxLife = 1.0 + Math.random() * 0.5;
        this.particles.push({
            mesh: mesh,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                -2.5 - Math.random() * 1.5, // thrust downwards
                (Math.random() - 0.5) * 0.3
            ),
            life: maxLife,
            maxLife: maxLife,
            type: 'rocketPlume', // specialized type
            isCore: isCore,
            baseScale: startScale
        });
    }
    
    spawnMinerParticles(x, y, z, colorHex) {
        // Spawn 1 or 2 tiny particles
        const count = Math.random() > 0.5 ? 2 : 1;
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true });
            const mesh = new THREE.Mesh(this.particleGeo, mat);
            
            // Start at the base of the miner
            mesh.position.set(
                x + (Math.random() - 0.5) * 0.2,
                y + 0.1,
                z + (Math.random() - 0.5) * 0.2
            );
            mesh.scale.set(0.5, 0.5, 0.5); // ultra small
            
            // Small pop upward and outward
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 1.5,
                1.5 + Math.random() * 1.0,
                (Math.random() - 0.5) * 1.5
            );
            
            this.scene.add(mesh);
            
            this.particles.push({
                mesh: mesh,
                velocity: velocity,
                life: 0.5, // super short life
                maxLife: 0.5,
                type: 'debris' // reuse debris physics (gravity + bounce)
            });
        }
    }
    
    update(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            // Physics
            if (p.type === 'debris') {
                p.velocity.y -= 9.8 * deltaTime; // Gravity
                p.mesh.position.addScaledVector(p.velocity, deltaTime);
                
                // Ground collision
                if (p.mesh.position.y < 0.05) {
                    p.mesh.position.y = 0.05;
                    p.velocity.y *= -0.3; // Bounce
                    p.velocity.x *= 0.5; // Friction
                    p.velocity.z *= 0.5;
                }
                
                // Spin
                p.mesh.rotation.x += p.velocity.x * deltaTime;
                p.mesh.rotation.y += p.velocity.y * deltaTime;
            } else if (p.type === 'smoke') {
                p.mesh.position.addScaledVector(p.velocity, deltaTime);
                
                // Smooth fade out
                const t = p.life / p.maxLife;
                p.mesh.material.opacity = t * 0.7;
                
                // Gentle growth as puff rises and dissipates
                const growScale = 1.0 + (1.0 - t) * 1.5;
                p.mesh.scale.set(growScale, growScale, growScale);
            } else if (p.type === 'rocketPlume') {
                p.mesh.position.addScaledVector(p.velocity, deltaTime);
                
                const t = p.life / p.maxLife; // 1.0 down to 0.0
                const age = 1.0 - t;
                
                // Grow drastically over lifetime
                const currentScale = p.baseScale * (1.0 + age * 8.0);
                p.mesh.scale.set(currentScale, currentScale, currentScale);
                
                // Opacity fades out
                p.mesh.material.opacity = t * (p.isCore ? 1.0 : 0.8);
                
                // Color shifting from core (yellow/orange) to dark grey smoke
                if (p.isCore && age > 0.3) {
                    // transition to dark smoke as it expands
                    p.mesh.material.color.lerp(new THREE.Color(0x333333), deltaTime * 4);
                }
            }
            
            // Lifetime
            p.life -= deltaTime;
            
            // Shrink as it dies for non-smoke/non-plume
            if (p.type !== 'smoke' && p.type !== 'rocketPlume') {
                const scale = p.life / p.maxLife;
                p.mesh.scale.set(scale, scale, scale);
            }
            
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                // Dispose cloned smoke materials to avoid leaks
                if (p.type === 'smoke' || p.type === 'rocketPlume') {
                    p.mesh.material.dispose();
                }
                this.particles.splice(i, 1);
            }
        }
        
        // Update trails
        if (this.trailMesh && this.trailMesh.count > 0) {
            const dummy = new THREE.Object3D();
            for (let i = 0; i < this.trailMesh.count; i++) {
                const t = this.trailData[i];
                if (t.active) {
                    t.life -= deltaTime;
                    if (t.life <= 0) {
                        t.active = false;
                        dummy.scale.set(0, 0, 0);
                    } else {
                        const prog = t.life / t.maxLife;
                        const scale = Math.pow(prog, 2); // Sharper taper
                        dummy.position.set(t.x, t.y, t.z);
                        dummy.scale.set(scale, scale, scale);
                    }
                    dummy.updateMatrix();
                    this.trailMesh.setMatrixAt(i, dummy.matrix);
                }
            }
            this.trailMesh.instanceMatrix.needsUpdate = true;
        }
    }
}
