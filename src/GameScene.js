import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CameraController } from './CameraController.js';
import { GridSystem } from './GridSystem.js';
import { PlacementSystem } from './PlacementSystem.js';
import { FXSystem } from './FXSystem.js';
import { SoundEngine } from './SoundEngine.js';

export class GameScene {
    constructor(container, logic, ui) {
        this.container = container;
        this.logic = logic;
        this.ui = ui;
        
        // Setup Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        container.appendChild(this.renderer.domElement);
        
        // Setup Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a10); // Darker background
        this.scene.fog = new THREE.FogExp2(0x0a0a10, 0.015);
        
        // PBR Room Environment
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.roomEnvTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.environment = this.roomEnvTexture;
        
        // Setup Isometric Orthographic Camera
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = 12;
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            1,
            1000
        );
        
        // Position camera for Isometric view
        this.camera.position.set(20, 20, 20);
        this.camera.lookAt(0, 0, 0);
        
        // Lights
        const ambientLight = new THREE.AmbientLight(0xfff0dd, 0.6); // Soft warm ambient
        this.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0); // Slightly reduced to prevent blowout
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 50;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
        this.scene.add(dirLight);
        
        const hemiLight = new THREE.HemisphereLight(0xfcf0d9, 0x1B4A22, 0.5);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);
        
        // Post-Processing
        const renderScene = new RenderPass(this.scene, this.camera);
        
        // Strength: 0.8, Radius: 0.5, Threshold: 0.85 (so only emissive materials > 0.85 glow)
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.5, 0.85);
        
        // Use a RenderTarget with MSAA enabled (samples: 4) for cheap, high-quality anti-aliasing
        const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
            samples: 4,
            type: THREE.HalfFloatType
        });
        
        this.composer = new EffectComposer(this.renderer, renderTarget);
        this.composer.addPass(renderScene);
        this.composer.addPass(bloomPass);
        
        // Subsystems
        this.cameraController = new CameraController(this.camera, this.renderer.domElement);
        this.fxSystem = new FXSystem(this.scene);
        
        // Resize handler
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    initGameScene(mapSize = 50) {
        if (!this.gridSystem) {
            // Clear intro stuff
            for (const child of [...this.scene.children]) {
                if (child.isMesh || child.isLineSegments || child.isGroup) {
                    this.scene.remove(child);
                }
            }
        }
        
        if (this.gridSystem) {
            this.scene.remove(this.gridSystem.group);
            this.gridSystem.dispose();
            
            if (this.placementSystem) {
                // Clear existing building meshes
                for (const child of [...this.scene.children]) {
                    if (child.userData && child.userData.isBuilding) {
                        this.scene.remove(child);
                    }
                }
            }
        }
        
        this.gridSystem = new GridSystem(this.scene, mapSize);
        if (!this.soundEngine) {
            this.soundEngine = new SoundEngine();
        }
        
        if (!this.logic) {
            this.logic = new GameLogic(this.soundEngine);
        } else {
            this.logic.reset();
            this.logic.soundEngine = this.soundEngine;
        }
        
        this.placementSystem = new PlacementSystem(this.scene, this.camera, this.renderer.domElement, this.gridSystem, this.logic, this.ui, this.fxSystem, this.soundEngine);
    }

    onWindowResize() {
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = this.camera.top * 2; // Keep vertical size constant
        
        this.camera.left = frustumSize * aspect / -2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    triggerRocketLaunch(consumedLocations, onComplete) {
        if (!this.rockets) this.rockets = [];
        
        for (const loc of consumedLocations) {
            const bld = this.logic.buildings.find(b => b.uuid === loc.uuid);
            if (!bld || !bld.mesh) continue;
            
            const rocketGroup = new THREE.Group();
            
            // Main body
            const bodyGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.2, 12);
            const bodyMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, metalness: 0.5, roughness: 0.2 });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = 0.6;
            rocketGroup.add(body);
            
            // Nose cone
            const coneGeo = new THREE.ConeGeometry(0.2, 0.5, 12);
            const coneMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.7, roughness: 0.3 });
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.y = 1.45;
            rocketGroup.add(cone);
            
            // Engine nozzle
            const nozzleGeo = new THREE.CylinderGeometry(0.15, 0.25, 0.3, 8);
            const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x34495e, metalness: 0.8, roughness: 0.4 });
            const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
            nozzle.position.y = -0.15;
            rocketGroup.add(nozzle);
            
            // Fins
            const finGeo = new THREE.BoxGeometry(0.05, 0.4, 0.4);
            const finMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c });
            for(let i=0; i<4; i++) {
                const fin = new THREE.Mesh(finGeo, finMat);
                fin.position.y = 0.2;
                fin.rotation.y = (Math.PI / 2) * i;
                fin.translateX(0.3);
                rocketGroup.add(fin);
            }
            
            // Emissive exhaust glow
            const glowGeo = new THREE.SphereGeometry(0.18, 8, 8);
            const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            glow.position.y = -0.3;
            glow.material.color.multiplyScalar(2.0); // push past 1.0 for bloom
            rocketGroup.add(glow);
            
            const startPos = new THREE.Vector3();
            bld.mesh.getWorldPosition(startPos);
            startPos.y += 1.5; 
            
            rocketGroup.position.copy(startPos);
            this.scene.add(rocketGroup);
            
            this.rockets.push({
                mesh: rocketGroup,
                velocity: 0,
                glowMesh: glow,
                life: 0
            });
        }
        
        this.onRocketsComplete = onComplete;
        
        // Failsafe in case no resources were somehow consumed but quest advances
        if (this.rockets.length === 0 && onComplete) {
            onComplete();
            this.onRocketsComplete = null;
        }
    }

    update(deltaTime) {
        this.cameraController.update(deltaTime);
        if (this.gridSystem) this.gridSystem.update(this.camera, deltaTime);
        if (this.placementSystem) this.placementSystem.update(deltaTime);
        this.fxSystem.update(deltaTime);
        
        if (this.rockets && this.rockets.length > 0) {
            let allDone = true;
            for (let i = this.rockets.length - 1; i >= 0; i--) {
                const r = this.rockets[i];
                r.life += deltaTime;
                
                // Exponential acceleration
                r.velocity += 15.0 * deltaTime;
                r.mesh.position.y += r.velocity * deltaTime;
                
                const s = 0.8 + Math.random() * 0.4;
                r.glowMesh.scale.set(s, s, s);
                
                if (r.life > 0.1) {
                    this.fxSystem.spawnRocketPlume(r.mesh.position.x, r.mesh.position.y - 0.4, r.mesh.position.z);
                }
                
                if (r.mesh.position.y < 100) {
                    allDone = false;
                } else {
                    this.scene.remove(r.mesh);
                    this.rockets.splice(i, 1);
                }
            }
            
            if (allDone && this.onRocketsComplete) {
                this.onRocketsComplete();
                this.onRocketsComplete = null;
            }
        }
        
        this.composer.render(deltaTime);
    }
}
