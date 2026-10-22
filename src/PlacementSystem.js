import * as THREE from 'three';
import { buildBuildingVisuals } from './BuildingModels.js';
import { RESOURCES } from './Config.js';

export class PlacementSystem {
    constructor(scene, camera, domElement, gridSystem, gameLogic, ui, fxSystem, soundEngine) {
        this.scene = scene;
        this.camera = camera;
        this.domElement = domElement;
        this.gridSystem = gridSystem;
        this.gameLogic = gameLogic;
        this.ui = ui;
        this.fxSystem = fxSystem;
        this.soundEngine = soundEngine;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.screenMouse = { x: 0, y: 0 };
        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        
        // Reusable scratch vectors to avoid allocations
        this._tempPlaneTarget = new THREE.Vector3();
        this._droneDummy = new THREE.Object3D();
        this._tempVec = new THREE.Vector3();
        
        this.ghostRotation = 0; // 0 or Math.PI/2

        // Dedicated group for fast targeted raycasting (avoids full scene recursive traversal)
        this.buildingsGroup = new THREE.Group();
        this.scene.add(this.buildingsGroup);

        // Ghost meshes cache for different sizes
        this.ghostGeometries = {
            '1x1': new THREE.BoxGeometry(0.8, 0.6, 0.8),
            '2x1': new THREE.BoxGeometry(1.8, 0.6, 0.8),
            '2x2': new THREE.BoxGeometry(1.8, 0.6, 1.8),
            'tree': new THREE.BoxGeometry(1.2, 2.8, 1.2)
        };
        
        this.ghostMatValid = new THREE.MeshLambertMaterial({ 
            color: 0x00ff00, transparent: true, opacity: 0.5, flatShading: true
        });
        this.ghostMatInvalid = new THREE.MeshLambertMaterial({ 
            color: 0xff0000, transparent: true, opacity: 0.5, flatShading: true
        });
        
        // Single ghost mesh we will swap geometry on
        this.ghostMesh = new THREE.Mesh(this.ghostGeometries['1x1'], this.ghostMatValid);
        this.ghostMesh.visible = false;
        this.scene.add(this.ghostMesh);
        
        this.buildingMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.2, flatShading: true });
        this.buildingSelectMat = new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x333333, metalness: 0.8, roughness: 0.2, flatShading: true });
        this.buildingDeleteMat = new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0xff0000, metalness: 0.8, roughness: 0.2, flatShading: true });
        
        // Drone Instanced Mesh
        const bodyGeo = new THREE.CylinderGeometry(0.05, 0.15, 0.4, 4);
        bodyGeo.rotateX(Math.PI / 2);
        
        const droneMat = new THREE.MeshStandardMaterial({ 
            color: 0x222222, 
            emissive: 0x00aaff, 
            emissiveIntensity: 0.8,
            metalness: 0.8, 
            roughness: 0.2,
            flatShading: true
        });
        this.droneMesh = new THREE.InstancedMesh(bodyGeo, droneMat, 2000);
        this.droneMesh.count = 0;
        this.droneMesh.frustumCulled = false;
        this.scene.add(this.droneMesh);
        
        // Tooltip DOM element caches
        this._cachedTooltipEls = null;
        this._lastHoveredKey = null;

        this.bindEvents();
    }
    
    _getTooltipEls() {
        if (!this._cachedTooltipEls) {
            this._cachedTooltipEls = {
                worldTooltip: document.getElementById('world-tooltip'),
                bldTooltip: document.getElementById('building-world-tooltip'),
                tooltipTitle: document.getElementById('tooltip-title'),
                tooltipDesc: document.getElementById('tooltip-desc'),
                extTooltip: document.getElementById('extractor-tooltip'),
                bwtName: document.getElementById('bwt-name'),
                bwtDetails: document.getElementById('bwt-details'),
                bwtProgressBar: document.getElementById('bwt-progress-bar'),
                bwtRate: document.getElementById('bwt-rate'),
                ttName: document.getElementById('tt-name'),
                ttNode: document.getElementById('tt-node'),
                ttRate: document.getElementById('tt-rate'),
                ttCost: document.getElementById('tt-cost'),
                controlsOverlay: document.getElementById('build-controls-overlay')
            };
        }
        return this._cachedTooltipEls;
    }

    onMouseMove(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.screenMouse.x = e.clientX;
        this.screenMouse.y = e.clientY;
    }

    findNearestNodeTile(worldX, worldZ, maxRadiusTiles = 2.0) {
        const ts = this.gridSystem.tileSize;
        const baseX = Math.floor(worldX / ts);
        const baseZ = Math.floor(worldZ / ts);
        const searchR = Math.ceil(maxRadiusTiles);
        let bestTile = null;
        let bestDistSq = (maxRadiusTiles * ts) * (maxRadiusTiles * ts);

        for (let dx = -searchR; dx <= searchR; dx++) {
            for (let dz = -searchR; dz <= searchR; dz++) {
                const nx = baseX + dx;
                const nz = baseZ + dz;
                const occ = this.gridSystem.getOccupantAt(nx, nz);
                if (occ && occ.type === 'node') {
                    const cx = (nx + 0.5) * ts;
                    const cz = (nz + 0.5) * ts;
                    const distSq = (worldX - cx) * (worldX - cx) + (worldZ - cz) * (worldZ - cz);
                    if (distSq <= bestDistSq) {
                        bestDistSq = distSq;
                        bestTile = { x: nx, z: nz };
                    }
                }
            }
        }
        return bestTile;
    }

    resolveMobileGridFromRay(maxMinerSnapRadius = 1.9) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hit = this.raycaster.ray.intersectPlane(this.plane, this._tempPlaneTarget);
        if (!hit) return null;

        const ts = this.gridSystem.tileSize;
        let gridX = Math.floor(this._tempPlaneTarget.x / ts);
        let gridZ = Math.floor(this._tempPlaneTarget.z / ts);

        if (this.ui && this.ui.activeTool === 'miner') {
            const snapped = this.findNearestNodeTile(this._tempPlaneTarget.x, this._tempPlaneTarget.z, maxMinerSnapRadius);
            if (snapped) {
                gridX = snapped.x;
                gridZ = snapped.z;
            }
        }
        return { x: gridX, z: gridZ };
    }

    isTouchOnGhost(clientX, clientY, radiusPx = 58) {
        if (!this.ghostMesh || !this.ghostMesh.visible) return false;
        this._tempVec.copy(this.ghostMesh.position).project(this.camera);
        const sx = (this._tempVec.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-this._tempVec.y * 0.5 + 0.5) * window.innerHeight;
        return Math.hypot(clientX - sx, clientY - sy) <= radiusPx;
    }

    moveGhostFromTouch(clientX, clientY) {
        this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
        this.screenMouse.x = clientX;
        this.screenMouse.y = clientY;

        const resolved = this.resolveMobileGridFromRay(1.9);
        if (resolved) {
            const changed = !this.mobileLockedTile || this.mobileLockedTile.x !== resolved.x || this.mobileLockedTile.y !== resolved.z;
            this.mobileLockedTile = { x: resolved.x, z: resolved.z };
            this.updateGhost();
        }
    }

    centerGhostOnScreen() {
        this.mouse.set(0, 0);
        this.screenMouse.x = window.innerWidth * 0.5;
        this.screenMouse.y = window.innerHeight * 0.5;
        const resolved = this.resolveMobileGridFromRay(5.0);
        if (resolved) {
            this.mobileLockedTile = { x: resolved.x, z: resolved.z };
        }
        this.updateGhost();
    }

    bindEvents() {
        this._lastMouseEvent = null;
        
        window.addEventListener('mousemove', (e) => {
            if (window.isMobile) return;
            this.onMouseMove(e);
            this._lastMouseEvent = e;
        });
        
        this.domElement.addEventListener('mousemove', (e) => {
            if (!window.isMobile) {
                this.updateGhost();
                this.updateTooltip(e);
            }
        });
        
        this.domElement.addEventListener('mousedown', (e) => {
            if (window.isMobile) return;
            
            if (e.button === 0) { // Left click
                if (this.ui.activeTool === 'select') {
                    this.trySelectBuilding();
                } else if (this.ui.activeTool === 'delete') {
                    this.tryDeleteBuilding();
                } else {
                    this.tryPlaceBuilding();
                }
            }
        });

        this.domElement.addEventListener('dblclick', (e) => {
            if (e.button === 0) {
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(this.buildingsGroup.children, true);
                if (intersects.length === 0) {
                    this.ui.closeRecipeUI();
                    this.ui.closeLeighHighUI();
                    const selBtn = document.querySelector('.switch-btn[data-tool="select"], .tool-btn[data-tool="select"]');
                    if (selBtn && !selBtn.classList.contains('active')) selBtn.click();
                }
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'r' && this.ui.activeTool !== 'select') {
                this.ghostRotation = (this.ghostRotation === 0) ? Math.PI / 2 : 0;
                this.updateGhost();
            }
        });
    }

    executeTap() {
        if (this.ui.activeTool === 'select') {
            this.updateGhost(true);
            this.trySelectBuilding();
        } else if (this.ui.activeTool === 'delete') {
            const prevBld = this.hoveredBuildingMesh;
            const prevTree = this.hoveredTreeId;
            this.updateGhost(true);
            
            const hasTarget = this.hoveredBuildingMesh || this.hoveredTreeId !== null;
            
            if (hasTarget && this.hoveredBuildingMesh === prevBld && this.hoveredTreeId === prevTree) {
                this.tryDeleteBuilding();
            } else if (this.soundEngine && hasTarget) {
                this.soundEngine.play('click');
            }
        } else {
            // Build mode on mobile:
            // 1. If tapping directly on/near the currently visible hologram, place immediately!
            const tappedExistingGhost = this.isTouchOnGhost(this.screenMouse.x, this.screenMouse.y, 52);
            const prevX = this.hoveredX;
            const prevZ = this.hoveredZ;

            const resolved = this.resolveMobileGridFromRay(1.9);
            if (tappedExistingGhost && this.ghostMesh.visible && this.ghostMesh.material === this.ghostMatValid) {
                this.tryPlaceBuilding();
                return;
            }

            if (resolved) {
                this.mobileLockedTile = { x: resolved.x, z: resolved.z };
            }
            this.updateGhost(true);
            
            if (this.hoveredX === prevX && this.hoveredZ === prevZ && this.ghostMesh.visible) {
                this.tryPlaceBuilding();
            } else if (this.soundEngine && this.ghostMesh.visible) {
                this.soundEngine.play('click');
            }
        }
    }

    getToolFootprint(toolId) {
        if (toolId === 'smelter' || toolId === 'constructor') return { w: 2, h: 1 };
        if (toolId === 'bigConstructor') return { w: 2, h: 2 };
        return { w: 1, h: 1 };
    }
    
    updateGhost(fromTap = false) {
        const toolId = this.ui.activeTool;
        const els = this._getTooltipEls();
        
        if (els.controlsOverlay) {
            els.controlsOverlay.style.display = (toolId !== 'select' && toolId !== 'delete') ? 'block' : 'none';
        }
        
        if (toolId === 'select' || toolId === 'delete') {
            // If switching between select and delete on mobile, clear previous target highlight
            if (this._lastGhostToolId !== toolId) {
                if (this.hoveredBuildingMesh) {
                    this.hoveredBuildingMesh.material = this.buildingMat;
                    this.hoveredBuildingMesh = null;
                }
                this.hoveredTreeId = null;
                this.ghostMesh.visible = false;
                this._lastGhostToolId = toolId;
            }

            // On mobile, keep the tapped delete/select target locked in world space while panning
            if (window.isMobile && !fromTap) {
                return;
            }

            this.ghostMesh.visible = false;
            this.ghostMesh.scale.set(1, 1, 1);
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            // Targeted raycast against only placed buildings instead of full scene
            const intersects = this.raycaster.intersectObjects(this.buildingsGroup.children, true);
            
            let hovered = null;
            for (const hit of intersects) {
                let obj = hit.object;
                while (obj && obj !== this.buildingsGroup) {
                    if (obj.userData && obj.userData.isBuilding) {
                        hovered = obj;
                        break;
                    }
                    obj = obj.parent;
                }
                if (hovered) break;
            }
            
            let hoveredTreeId = null;
            if (!hovered && toolId === 'delete' && this.gridSystem.instancedTrunks) {
                const treeHits = this.raycaster.intersectObjects([this.gridSystem.instancedTrunks, this.gridSystem.instancedLeaves]);
                if (treeHits.length > 0) hoveredTreeId = treeHits[0].instanceId;
            }
            
            if (this.hoveredBuildingMesh && this.hoveredBuildingMesh !== hovered) {
                this.hoveredBuildingMesh.material = this.buildingMat;
            }
            if (hovered) {
                hovered.material = toolId === 'delete' ? this.buildingDeleteMat : this.buildingSelectMat;
            }
            this.hoveredBuildingMesh = hovered;
            this.hoveredTreeId = hoveredTreeId;
            
            if (hovered && toolId === 'delete') {
                this.ghostMesh.geometry = hovered.geometry;
                this.ghostMesh.position.copy(hovered.position);
                this.ghostMesh.rotation.y = hovered.rotation.y;
                this.ghostMesh.scale.set(1.06, 1.06, 1.06);
                this.ghostMesh.material = this.ghostMatInvalid;
                this.ghostMesh.visible = true;
            } else if (hoveredTreeId !== null && toolId === 'delete') {
                for (const [key, occupant] of this.gridSystem.worldRegistry.entries()) {
                    if (occupant.type === 'tree' && occupant.instanceId === hoveredTreeId) {
                        const [x, z] = key.split(',').map(Number);
                        const centerX = (x + 0.5) * this.gridSystem.tileSize;
                        const centerZ = (z + 0.5) * this.gridSystem.tileSize;
                        this.ghostMesh.geometry = this.ghostGeometries['tree'];
                        this.ghostMesh.position.set(centerX, 1.4, centerZ);
                        this.ghostMesh.rotation.y = 0;
                        this.ghostMesh.scale.set(1, 1, 1);
                        this.ghostMesh.material = this.ghostMatInvalid;
                        this.ghostMesh.visible = true;
                        break;
                    }
                }
            }
            return;
        }
        
        this._lastGhostToolId = toolId;
        this.ghostMesh.scale.set(1, 1, 1);
        if (this.hoveredBuildingMesh) {
            this.hoveredBuildingMesh.material = this.buildingMat;
            this.hoveredBuildingMesh = null;
        }
        
        const fp = this.getToolFootprint(toolId);
        
        if (fp.w === 2 && fp.h === 2) {
            this.ghostMesh.geometry = this.ghostGeometries['2x2'];
        } else if (fp.w === 2 && fp.h === 1) {
            this.ghostMesh.geometry = this.ghostGeometries['2x1'];
        } else {
            this.ghostMesh.geometry = this.ghostGeometries['1x1'];
        }

        let gridX = null;
        let gridZ = null;

        if (window.isMobile && this.mobileLockedTile) {
            gridX = this.mobileLockedTile.x;
            gridZ = this.mobileLockedTile.z;
        } else {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const hit = this.raycaster.ray.intersectPlane(this.plane, this._tempPlaneTarget);
            if (hit) {
                gridX = Math.floor(this._tempPlaneTarget.x / this.gridSystem.tileSize);
                gridZ = Math.floor(this._tempPlaneTarget.z / this.gridSystem.tileSize);
            }
        }
        
        if (gridX !== null && gridZ !== null) {
            this.hoveredX = gridX;
            this.hoveredZ = gridZ;
            
            let centerX = (gridX + 0.5) * this.gridSystem.tileSize;
            let centerZ = (gridZ + 0.5) * this.gridSystem.tileSize;

            let actualW = fp.w;
            let actualH = fp.h;

            if (this.ghostRotation === Math.PI / 2) {
                actualW = fp.h;
                actualH = fp.w;
            }

            if (actualW === 2) centerX += 0.5 * this.gridSystem.tileSize;
            if (actualH === 2) centerZ += 0.5 * this.gridSystem.tileSize;

            this.ghostMesh.position.set(centerX, 0.3, centerZ);
            this.ghostMesh.rotation.y = this.ghostRotation;
            this.ghostMesh.visible = true;
            
            this.ghostMesh.material = this.isValidPlacement(gridX, gridZ, toolId, actualW, actualH)
                ? this.ghostMatValid
                : this.ghostMatInvalid;
        } else {
            this.ghostMesh.visible = false;
        }
    }
    
    updateTooltip(e) {
        const els = this._getTooltipEls();
        if (!els.worldTooltip || !els.bldTooltip) return;
        
        // Hide tooltips if mouse is hovering over UI elements
        if (e.target !== this.domElement) {
            els.worldTooltip.style.display = 'none';
            els.bldTooltip.style.display = 'none';
            if (els.extTooltip) els.extTooltip.style.display = 'none';
            this._hoveredBldUuid = null;
            return;
        }
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        // Fast targeted raycast against buildings only
        const intersects = this.raycaster.intersectObjects(this.buildingsGroup.children, true);
        
        let foundBuilding = false;
        let bldObj = null;
        
        for (const hit of intersects) {
            let obj = hit.object;
            while (obj && obj !== this.buildingsGroup) {
                if (obj.userData && obj.userData.isBuilding) {
                    foundBuilding = true;
                    bldObj = obj;
                    break;
                }
                obj = obj.parent;
            }
            if (foundBuilding) break;
        }

        if (foundBuilding && bldObj) {
            const bld = this.gameLogic.buildings.find(b => b.uuid === bldObj.userData.uuid);
            this._hoveredBldUuid = bld ? bld.uuid : null;
            if (bld && els.bldTooltip) {
                const nameEl = els.bwtName;
                const detailsEl = els.bwtDetails;
                const progressBar = els.bwtProgressBar;
                const rateEl = els.bwtRate;
                
                if (bld.isExtractor) {
                    const typeName = bld.type.charAt(0).toUpperCase() + bld.type.slice(1);
                    nameEl.textContent = 'Miner';
                    const iconColor = RESOURCES[bld.type] ? RESOURCES[bld.type].hex : '#fff';
                    const outBuffer = bld.outputBuffer[bld.type] || 0;
                    detailsEl.innerHTML = `Extracting: <strong style="color:${iconColor}">${typeName}</strong><br>Buffer: <strong>${outBuffer} / 50</strong>`;
                    
                    const level = bld.nodeLevel || 1;
                    const baseRate = this.gameLogic.baseRates[bld.type] || 1;
                    const actualRate = baseRate * level;
                    
                    const pct = bld.isWorking ? Math.min(100, (bld.progress / 1.0) * 100) : 0;
                    progressBar.style.width = pct + '%';
                    progressBar.style.background = iconColor;
                    
                    rateEl.textContent = bld.isWorking ? `+${actualRate} ${bld.type}/s` : 'Idle';
                    rateEl.style.color = bld.isWorking ? iconColor : '#aaa';
                } else if (bld.type === 'school') {
                    nameEl.textContent = 'Leigh High School';
                    if (bld.activeBurn) {
                        const pct = Math.min(100, (bld.burnProgress / bld.burnDuration) * 100);
                        progressBar.style.width = pct + '%';
                        progressBar.style.background = '#ffd700';
                        detailsEl.innerHTML = 'Status: <strong style="color:#ffd700">Educating...</strong>';
                        rateEl.textContent = 'Burning resources';
                        rateEl.style.color = '#ffd700';
                    } else {
                        detailsEl.innerHTML = 'Status: Idle';
                        progressBar.style.width = '0%';
                        rateEl.textContent = 'Idle';
                        rateEl.style.color = '#aaa';
                    }
                } else if (bld.type === 'storage') {
                    nameEl.textContent = 'Storage Box';
                    const filterName = bld.storageFilter ? bld.storageFilter : 'Any (Auto)';
                    detailsEl.innerHTML = `Filter: <strong>${filterName}</strong><br>Inventory: <strong>${bld.inventoryCount || 0} / 2048</strong>`;
                    const pct = Math.min(100, ((bld.inventoryCount || 0) / 2048) * 100);
                    progressBar.style.width = pct + '%';
                    progressBar.style.background = '#3498db';
                    rateEl.textContent = 'Storing';
                    rateEl.style.color = '#3498db';
                } else {
                    const mac = this.gameLogic.otherBuildings.find(m => m.id === bld.type);
                    nameEl.textContent = mac ? mac.name : bld.type;
                    
                    if (bld.activeRecipe) {
                        const recipe = this.gameLogic.recipes[bld.activeRecipe];
                        let stallText = "";
                        let outSpace = true;
                        for (const [k, v] of Object.entries(recipe.outputs)) if ((bld.outputBuffer[k] || 0) + v > 50) outSpace = false;
                        if (!outSpace) stallText = " <span style='color:red;'>(Output Full)</span>";
                        
                        const statusText = bld.isWorking ? 'Working...' : ('Waiting' + stallText);
                        let inBufTxt = Object.entries(recipe.inputs).map(([k,v]) => `${k}:${bld.inputBuffer[k]||0}`).join(', ');
                        let outBufTxt = Object.entries(recipe.outputs).map(([k,v]) => `${k}:${bld.outputBuffer[k]||0}`).join(', ');
                        
                        detailsEl.innerHTML = `Recipe: <strong>${recipe.name}</strong><br>In: ${inBufTxt} | Out: ${outBufTxt}<br>Status: ${statusText}`;
                        const pct = bld.isWorking ? Math.min(100, (bld.progress / recipe.time) * 100) : 0;
                        progressBar.style.width = pct + '%';
                        progressBar.style.background = '#2ecc71';
                        
                        const outText = Object.entries(recipe.outputs).map(([k, v]) => `+${v} ${k}`).join(', ');
                        rateEl.textContent = bld.isWorking ? outText + ` / ${recipe.time}s` : 'Idle';
                        rateEl.style.color = bld.isWorking ? '#5f5' : '#aaa';
                    } else {
                        detailsEl.innerHTML = 'No recipe selected';
                        progressBar.style.width = '0%';
                        rateEl.textContent = 'Idle';
                        rateEl.style.color = '#aaa';
                    }
                }
                els.bldTooltip.style.display = 'block';
                els.bldTooltip.style.left = (e.clientX + 15) + 'px';
                els.bldTooltip.style.top = (e.clientY + 15) + 'px';
            }
            els.worldTooltip.style.display = 'none';
            if (els.extTooltip) els.extTooltip.style.display = 'none';
        } else {
            // Check grid for nodes via fast O(1) mathematical plane intersection
            if (this.raycaster.ray.intersectPlane(this.plane, this._tempPlaneTarget)) {
                const gridX = Math.floor(this._tempPlaneTarget.x / this.gridSystem.tileSize);
                const gridZ = Math.floor(this._tempPlaneTarget.z / this.gridSystem.tileSize);
                const occupant = this.gridSystem.getOccupantAt(gridX, gridZ);
                
                if (occupant && occupant.type === 'node') {
                    if (this.ui.activeTool === 'miner' && els.extTooltip) {
                        els.extTooltip.style.display = 'block';
                        els.extTooltip.style.left = (e.clientX + 15) + 'px';
                        els.extTooltip.style.top = (e.clientY + 15) + 'px';
                        
                        const subType = occupant.subType;
                        const typeName = subType.charAt(0).toUpperCase() + subType.slice(1);
                        els.ttName.textContent = 'Miner';
                        els.ttNode.textContent = typeName;
                        
                        const baseRate = this.gameLogic.baseRates[subType] || 1;
                        const rate = baseRate * occupant.level;
                        els.ttRate.textContent = rate;
                        els.ttCost.textContent = '15';
                        els.worldTooltip.style.display = 'none';
                    } else {
                        els.worldTooltip.style.display = 'block';
                        els.worldTooltip.style.left = (e.clientX + 15) + 'px';
                        els.worldTooltip.style.top = (e.clientY + 15) + 'px';
                        
                        const t = occupant.subType;
                        const name = t.charAt(0).toUpperCase() + t.slice(1);
                        els.tooltipTitle.textContent = name + ' Node';
                        
                        if (t === 'water' || t === 'poop') {
                            els.tooltipDesc.textContent = '';
                        } else {
                            els.tooltipDesc.textContent = 'Purity Level: ' + occupant.level;
                            if (occupant.level === 1.5) els.tooltipDesc.textContent += ' (x1.5)';
                            if (occupant.level === 2) els.tooltipDesc.textContent += ' (x2)';
                            if (occupant.level === 3) els.tooltipDesc.textContent += ' (x3)';
                        }
                        if (els.extTooltip) els.extTooltip.style.display = 'none';
                    }
                    if (els.bldTooltip) els.bldTooltip.style.display = 'none';
                    return;
                }
            }
            if (els.bldTooltip) els.bldTooltip.style.display = 'none';
            els.worldTooltip.style.display = 'none';
            if (els.extTooltip) els.extTooltip.style.display = 'none';
            this._hoveredBldUuid = null;
        }
    }
    
    isValidPlacement(startX, startZ, toolId, w, h) {
        if (!this.gameLogic.canAfford(toolId)) return false;
        
        const isMiner = toolId === 'miner';
        
        for (let x = startX; x < startX + w; x++) {
            for (let z = startZ; z < startZ + h; z++) {
                const occupant = this.gridSystem.getOccupantAt(x, z);
                
                if (isMiner) {
                    if (!occupant || occupant.type !== 'node') return false;
                } else {
                    if (occupant && occupant.type !== 'tree') return false;
                }
            }
        }
        return true;
    }
    
    trySelectBuilding() {
        if (this.hoveredBuildingMesh) {
            const bldId = this.hoveredBuildingMesh.userData.uuid;
            const bld = this.gameLogic.buildings.find(b => b.uuid === bldId);
            if (bld && bld.type === 'school') {
                this.ui.closeRecipeUI();
                this.ui.openLeighHighUI(bld);
            } else if (bld) {
                this.ui.openRecipeUI(bld);
            } else {
                this.ui.closeRecipeUI();
            }
        } else {
            this.ui.closeRecipeUI();
        }
    }

    tryDeleteBuilding() {
        if (this.hoveredBuildingMesh) {
            const bldId = this.hoveredBuildingMesh.userData.uuid;
            const bldInfo = this.gameLogic.buildings.find(b => b.uuid === bldId);
            
            if (bldInfo) {
                let toRefund = {};
                if (bldInfo.type === 'storage' && bldInfo.inventoryCount > 0) {
                    toRefund[bldInfo.storageFilter] = bldInfo.inventoryCount;
                } else if (bldInfo.type === 'school') {
                    if (bldInfo.burnQueue) {
                        for (const q of bldInfo.burnQueue) {
                            if (q.received > 0) toRefund[q.itemKey] = (toRefund[q.itemKey] || 0) + q.received;
                        }
                    }
                    if (bldInfo.activeBurn) {
                        toRefund[bldInfo.activeBurn.itemKey] = (toRefund[bldInfo.activeBurn.itemKey] || 0) + 1;
                    }
                } else {
                    for (const [k, v] of Object.entries(bldInfo.inputBuffer || {})) {
                        if (v > 0) toRefund[k] = (toRefund[k] || 0) + v;
                    }
                    for (const [k, v] of Object.entries(bldInfo.outputBuffer || {})) {
                        if (v > 0) toRefund[k] = (toRefund[k] || 0) + v;
                    }
                }

                let totalItems = 0;
                for (const v of Object.values(toRefund)) totalItems += v;

                if (totalItems > 0) {
                    let destinations = [];
                    let unmet = 0;
                    for (const [k, v] of Object.entries(toRefund)) {
                        let remaining = v;
                        for (const tb of this.gameLogic.buildings) {
                            if (tb.uuid === bldId) continue;
                            if (tb.type === 'storage' && tb.storageFilter === k) {
                                const space = 2048 - (tb.inventoryCount || 0) - (tb.inboundCount[k] || 0);
                                if (space > 0) {
                                    const amount = Math.min(remaining, space);
                                    destinations.push({ target: tb, item: k, amount });
                                    tb.inboundCount[k] = (tb.inboundCount[k] || 0) + amount;
                                    remaining -= amount;
                                    if (remaining <= 0) break;
                                }
                            }
                        }
                        if (remaining > 0) unmet += remaining;
                    }

                    if (unmet > 0) {
                        const confirmDelete = window.confirm(`There is no Storage Box space available for ${unmet} buffered resources with nowhere to go. Are you sure you want to delete this building and destroy them?`);
                        if (!confirmDelete) {
                            for (const d of destinations) d.target.inboundCount[d.item] -= d.amount;
                            return;
                        }
                    }

                    for (const d of destinations) {
                        for (let i = 0; i < d.amount; i++) {
                            const dx = bldInfo.x - d.target.x;
                            const dz = bldInfo.z - d.target.z;
                            const dist = Math.sqrt(dx * dx + dz * dz) * this.gridSystem.tileSize;
                            this.gameLogic.drones.push({
                                sourceUuid: 'deleted',
                                targetUuid: d.target.uuid,
                                sourceX: bldInfo.x,
                                sourceZ: bldInfo.z,
                                itemKey: d.item,
                                progress: 0,
                                tripDist: dist
                            });
                        }
                    }
                }
            }
            
            const bld = this.gameLogic.removeBuilding(bldId);
            
            if (bld) {
                const cost = this.gameLogic.getBuildingCost(bld.id);
                this.gameLogic.inventory.confiscatedPhones += cost;
                
                if (this.soundEngine) this.soundEngine.play('destroy');
                
                this.buildingsGroup.remove(this.hoveredBuildingMesh);
                if (this.hoveredBuildingMesh.parent) this.hoveredBuildingMesh.parent.remove(this.hoveredBuildingMesh);
                
                for (const [key, occupant] of this.gridSystem.worldRegistry.entries()) {
                    if (occupant.uuid === bldId) {
                        if (occupant.underlyingNode) {
                            this.gridSystem.worldRegistry.set(key, occupant.underlyingNode);
                        } else {
                            this.gridSystem.worldRegistry.delete(key);
                        }
                    }
                }
                
                this.hoveredBuildingMesh = null;
                this.ghostMesh.visible = false;
                this.ghostMesh.scale.set(1, 1, 1);
                this.ui.updateDisplay();
            }
        } else if (this.hoveredTreeId !== null && this.hoveredTreeId !== undefined) {
            for (const [key, occupant] of this.gridSystem.worldRegistry.entries()) {
                if (occupant.type === 'tree' && occupant.instanceId === this.hoveredTreeId) {
                    const [x, z] = key.split(',').map(Number);
                    this.gridSystem.removeObjectAt(x, z);
                    if (!this.gameLogic.brokenTrees.some(t => t.x === x && t.z === z)) {
                        this.gameLogic.brokenTrees.push({ x, z });
                    }
                    
                    const treePos = new THREE.Vector3((x + 0.5) * this.gridSystem.tileSize, 0, (z + 0.5) * this.gridSystem.tileSize);
                    if (this.fxSystem) this.fxSystem.spawnTreeDestruction(treePos.x, treePos.y, treePos.z);
                    if (this.soundEngine) this.soundEngine.play('destroy');
                    
                    this.hoveredTreeId = null;
                    this.ghostMesh.visible = false;
                    break;
                }
            }
        }
    }

    tryPlaceBuilding() {
        if (!this.ghostMesh.visible || this.ghostMesh.material === this.ghostMatInvalid) return;
        
        const gridX = this.hoveredX;
        const gridZ = this.hoveredZ;
        if (gridX === undefined || gridZ === undefined || gridX === null || gridZ === null) return;
        
        const toolId = this.ui.activeTool;
        const fp = this.getToolFootprint(toolId);
        let actualW = fp.w;
        let actualH = fp.h;
        if (this.ghostRotation === Math.PI / 2) {
            actualW = fp.h; actualH = fp.w;
        }
        
        if (this.gameLogic.purchaseBuilding(toolId)) {
            if (this.soundEngine) this.soundEngine.play('place');
            
            let nodeLevel = 1;
            let nodeSubType = null;
            for (let x = gridX; x < gridX + actualW; x++) {
                for (let z = gridZ; z < gridZ + actualH; z++) {
                    const occupant = this.gridSystem.getOccupantAt(x, z);
                    if (occupant) {
                        if (occupant.type === 'tree') {
                            const treePos = new THREE.Vector3((x + 0.5) * this.gridSystem.tileSize, 0, (z + 0.5) * this.gridSystem.tileSize);
                            this.gridSystem.removeObjectAt(x, z);
                            if (!this.gameLogic.brokenTrees.some(t => t.x === x && t.z === z)) {
                                this.gameLogic.brokenTrees.push({ x, z });
                            }
                            if (this.fxSystem) this.fxSystem.spawnTreeDestruction(treePos.x, treePos.y, treePos.z);
                        } else if (occupant.type === 'node') {
                            nodeLevel = occupant.level || 1;
                            nodeSubType = occupant.subType;
                        }
                    }
                }
            }
            
            const uuid = this.gameLogic.addBuilding(toolId, gridX, gridZ, nodeLevel, this.ghostRotation, nodeSubType);
            
            // Spawn solid mesh with shared material
            const buildingMesh = new THREE.Mesh(this.ghostMesh.geometry, this.buildingMat);
            buildingMesh.position.copy(this.ghostMesh.position);
            buildingMesh.rotation.copy(this.ghostMesh.rotation);
            buildingMesh.castShadow = true;
            buildingMesh.receiveShadow = true;
            buildingMesh.userData = { isBuilding: true, uuid: uuid };
            
            // Build visual models modularly
            buildBuildingVisuals(buildingMesh, toolId, nodeSubType);
            this.buildingsGroup.add(buildingMesh);
            
            const bld = this.gameLogic.buildings.find(b => b.uuid === uuid);
            if (bld) {
                bld.mesh = buildingMesh;
                if (buildingMesh.userData.extMesh) bld.extMesh = buildingMesh.userData.extMesh;
            }
            
            // Register in grid for all occupied tiles
            for (let x = gridX; x < gridX + actualW; x++) {
                for (let z = gridZ; z < gridZ + actualH; z++) {
                    const occupant = this.gridSystem.getOccupantAt(x, z);
                    let underlyingNode = null;
                    if (occupant && occupant.type === 'node') {
                        underlyingNode = occupant;
                    }
                    this.gridSystem.worldRegistry.set(`${x},${z}`, { 
                        type: 'building', 
                        mesh: buildingMesh, 
                        toolId,
                        uuid: uuid,
                        underlyingNode: underlyingNode
                    });
                }
            }
            
            if (window.isMobile && toolId === 'miner') {
                const ts = this.gridSystem.tileSize;
                const nextNode = this.findNearestNodeTile((gridX + 0.5) * ts, (gridZ + 0.5) * ts, 3.5);
                if (nextNode) {
                    this.mobileLockedTile = { x: nextNode.x, z: nextNode.z };
                }
            }

            this.ui.updateDisplay();
            this.updateGhost();
            this._hoveredBldUuid = null;
        } else {
            if (this.soundEngine) this.soundEngine.play('error');
        }
    }

    forcePlaceBuilding(toolId, gridX, gridZ, rotation, nodeLevel, nodeSubType, savedUuid) {
        const fp = this.getToolFootprint(toolId);
        let actualW = fp.w;
        let actualH = fp.h;
        if (rotation === Math.PI / 2) {
            actualW = fp.h; actualH = fp.w;
        }

        const uuid = this.gameLogic.addBuilding(toolId, gridX, gridZ, nodeLevel, rotation, nodeSubType, savedUuid);

        for (let x = gridX; x < gridX + actualW; x++) {
            for (let z = gridZ; z < gridZ + actualH; z++) {
                const occupant = this.gridSystem.getOccupantAt(x, z);
                if (occupant && occupant.type === 'tree') {
                    this.gridSystem.removeObjectAt(x, z);
                }
            }
        }

        let geo;
        if (fp.w === 2 && fp.h === 2) {
            geo = this.ghostGeometries['2x2'];
        } else if (fp.w === 2 && fp.h === 1) {
            geo = this.ghostGeometries['2x1'];
        } else {
            geo = this.ghostGeometries['1x1'];
        }
        
        const buildingMesh = new THREE.Mesh(geo, this.buildingMat);
        const centerX = (gridX + actualW / 2) * this.gridSystem.tileSize;
        const centerZ = (gridZ + actualH / 2) * this.gridSystem.tileSize;
        buildingMesh.position.set(centerX, 0.3, centerZ);
        buildingMesh.rotation.y = rotation;
        buildingMesh.castShadow = true;
        buildingMesh.receiveShadow = true;
        buildingMesh.userData = { isBuilding: true, uuid: uuid };
        
        buildBuildingVisuals(buildingMesh, toolId, nodeSubType);
        
        const bld = this.gameLogic.buildings.find(b => b.uuid === uuid);
        if (bld) {
            bld.mesh = buildingMesh;
            if (buildingMesh.userData.extMesh) bld.extMesh = buildingMesh.userData.extMesh;
        }
        
        for (let x = gridX; x < gridX + actualW; x++) {
            for (let z = gridZ; z < gridZ + actualH; z++) {
                const occupant = this.gridSystem.getOccupantAt(x, z);
                let underlyingNode = null;
                if (occupant && occupant.type === 'node') {
                    underlyingNode = occupant;
                }
                this.gridSystem.worldRegistry.set(`${x},${z}`, { 
                    type: 'building', 
                    mesh: buildingMesh, 
                    toolId,
                    uuid: uuid,
                    underlyingNode: underlyingNode
                });
            }
        }
        
        this.buildingsGroup.add(buildingMesh);
    }
    
    update(deltaTime) {
        this.updateGhost();
        
        // Tree shader uniforms for see-through leaves
        if (!window.isMobile && this.gridSystem.treeLeavesMat && this.gridSystem.treeLeavesMat.userData.shader) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            this.gridSystem.treeLeavesMat.userData.shader.uniforms.uRayOrigin.value.copy(this.raycaster.ray.origin);
            this.gridSystem.treeLeavesMat.userData.shader.uniforms.uRayDir.value.copy(this.raycaster.ray.direction).normalize();
        }
        
        if (this._lastMouseEvent) {
            this.updateTooltip(this._lastMouseEvent);
        }
        
        // Live-update the building world tooltip progress bar
        if (this._hoveredBldUuid) {
            const bld = this.gameLogic.buildings.find(b => b.uuid === this._hoveredBldUuid);
            const els = this._getTooltipEls();
            const progressBar = els.bwtProgressBar;
            if (bld && progressBar) {
                if (bld.isExtractor) {
                    const pct = Math.min(100, (bld.progress / bld.cycleTime) * 100);
                    progressBar.style.width = pct + '%';
                } else if (bld.type === 'school') {
                    if (bld.activeBurn) {
                        const pct = Math.min(100, (bld.activeBurn.progress / bld.activeBurn.duration) * 100);
                        progressBar.style.width = pct + '%';
                    }
                } else if (bld.activeRecipe && bld.isWorking) {
                    const recipe = this.gameLogic.recipes[bld.activeRecipe];
                    const pct = Math.min(100, (bld.progress / recipe.time) * 100);
                    progressBar.style.width = pct + '%';
                }
            }
        }
        
        // Update drone mesh instances
        if (this.droneMesh) {
            const activeDrones = this.gameLogic.drones || [];
            this.droneMesh.count = activeDrones.length;
            const ts = this.gridSystem.tileSize;
            
            for (let i = 0; i < activeDrones.length; i++) {
                const d = activeDrones[i];
                const source = this.gameLogic.buildings.find(b => b.uuid === d.sourceUuid);
                const target = this.gameLogic.buildings.find(b => b.uuid === d.targetUuid);
                
                if (source && target) {
                    const t = Math.min(1, d.progress / d.tripDist);
                    const sx = (source.x + 0.5) * ts;
                    const sz = (source.z + 0.5) * ts;
                    const tx = (target.x + 0.5) * ts;
                    const tz = (target.z + 0.5) * ts;
                    
                    const x = sx + (tx - sx) * t;
                    const z = sz + (tz - sz) * t;
                    const y = 2.0 + Math.sin(t * Math.PI) * 2.0;
                    
                    this._droneDummy.position.set(x, y, z);
                    this._droneDummy.lookAt(tx, y, tz);
                    this._droneDummy.updateMatrix();
                    this.droneMesh.setMatrixAt(i, this._droneDummy.matrix);
                    
                    if (this.fxSystem) {
                        this.fxSystem.spawnTrail(x, y, z);
                    }
                }
            }
            this.droneMesh.instanceMatrix.needsUpdate = true;
        }
        
        // Machine animations
        const dt = Math.min(deltaTime, 0.1);
        
        for (const bld of this.gameLogic.buildings) {
            if (!bld.mesh) continue;
            
            const occupantMesh = bld.mesh;
            if (!bld._fxTimer) bld._fxTimer = 0;
            bld._fxTimer += dt;

            if (bld.isExtractor) {
                if (bld.isWorking) {
                    if (bld.extMesh) {
                        const prog = bld.progress / bld.cycleTime;
                        if (occupantMesh.userData.isDrill) {
                            bld.extMesh.rotation.y -= dt * 10;
                            bld.extMesh.position.y = 0.2 + prog * 0.4;
                        } else if (occupantMesh.userData.isPlunger) {
                            bld.extMesh.position.y = Math.sin(prog * Math.PI) * 0.4;
                        } else if (occupantMesh.userData.isPump) {
                            bld.extMesh.rotation.x = -prog * (Math.PI / 3);
                        }
                    }
                    
                    if (this.fxSystem && bld._fxTimer >= 0.5) {
                        bld._fxTimer -= 0.5;
                        this.fxSystem.spawnMinerParticles(
                            occupantMesh.position.x, 
                            occupantMesh.position.y, 
                            occupantMesh.position.z, 
                            occupantMesh.userData.extractColor
                        );
                    }
                }
            } else if (bld.isWorking) {
                if (bld.type === 'smelter' && occupantMesh.children[0]) {
                    occupantMesh.children[0].rotation.y = Math.sin(Date.now() / 50) * 0.1;
                } else if (bld.type === 'constructor') {
                    const pressHead = occupantMesh.children.find(c => c.userData && c.userData.isPress);
                    if (pressHead) {
                        const time = (Date.now() / 1000) * Math.PI * 4;
                        pressHead.position.y = 0.55 + Math.abs(Math.sin(time)) * 0.25;
                    }
                } else if (bld.type === 'bigConstructor') {
                    const spinner = occupantMesh.children.find(c => c.userData && c.userData.isSpinner);
                    if (spinner) {
                        spinner.rotation.z -= dt * 4;
                    }
                }
                
                if (this.fxSystem && bld._fxTimer >= 0.4) {
                    bld._fxTimer -= 0.4;
                    let sx = occupantMesh.position.x;
                    let sy = occupantMesh.position.y + 0.6;
                    let sz = occupantMesh.position.z;
                    
                    if (occupantMesh.userData.stackOffset) {
                        this._tempVec.copy(occupantMesh.userData.stackOffset);
                        this._tempVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), occupantMesh.rotation.y);
                        sx = occupantMesh.position.x + this._tempVec.x;
                        sy = occupantMesh.position.y + this._tempVec.y;
                        sz = occupantMesh.position.z + this._tempVec.z;
                    }
                    
                    this.fxSystem.spawnSmoke(sx, sy, sz);
                }
            } else if (!bld.isWorking && !bld.isExtractor) {
                if (bld.type === 'smelter' && occupantMesh.children[0]) {
                    occupantMesh.children[0].rotation.y = 0;
                } else if (bld.type === 'constructor') {
                    const pressHead = occupantMesh.children.find(c => c.userData && c.userData.isPress);
                    if (pressHead) pressHead.position.y = 0.8;
                }
            }
        }
    }
}
