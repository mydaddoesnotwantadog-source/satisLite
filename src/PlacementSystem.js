import * as THREE from 'three';

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
        
        this.ghostRotation = 0; // 0 or Math.PI/2

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
        
        // Drone Instanced Mesh
        const droneGeo = new THREE.BufferGeometry();
        // A simple aerodynamic shape: combining a box and a cone
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
        
        this.bindEvents();
    }
    
    onMouseMove(e) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.screenMouse.x = e.clientX;
        this.screenMouse.y = e.clientY;
    }

    bindEvents() {
        // Always track mouse position globally to prevent cursor drift
        // when mouse moves over UI elements that block domElement events
        this._lastMouseEvent = null;
        
        window.addEventListener('mousemove', (e) => {
            this.onMouseMove(e);
            this._lastMouseEvent = e;
        });
        
        this.domElement.addEventListener('mousemove', (e) => {
            this.updateGhost();
            this.updateTooltip(e);
        });
        
        this.domElement.addEventListener('mousedown', (e) => {
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
                const intersects = this.raycaster.intersectObjects(this.scene.children, true);
                let hitBuilding = false;
                for (const hit of intersects) {
                    let obj = hit.object;
                    while (obj && obj !== this.scene) {
                        if (obj.userData && obj.userData.isBuilding) {
                            hitBuilding = true;
                            break;
                        }
                        obj = obj.parent;
                    }
                    if (hitBuilding) break;
                }
                if (!hitBuilding) {
                    this.ui.closeRecipeUI();
                    this.ui.closeLeighHighUI();
                    const selBtn = document.querySelector('.tool-btn[data-tool="select"]');
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

    getToolFootprint(toolId) {
        if (toolId === 'smelter' || toolId === 'constructor') return { w: 2, h: 1 };
        if (toolId === 'bigConstructor') return { w: 2, h: 2 };
        return { w: 1, h: 1 };
    }
    
    updateGhost() {
        const toolId = this.ui.activeTool;
        
        // Show controls overlay when placing
        const controlsOverlay = document.getElementById('build-controls-overlay');
        if (controlsOverlay) {
            if (toolId !== 'select' && toolId !== 'delete') {
                controlsOverlay.style.display = 'block';
            } else {
                controlsOverlay.style.display = 'none';
            }
        }
        
        if (toolId === 'select' || toolId === 'delete') {
            this.ghostMesh.visible = false;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);
            
            let hovered = null;
            for (const hit of intersects) {
                let obj = hit.object;
                while (obj && obj !== this.scene) {
                    if (obj.userData && obj.userData.isBuilding) {
                        hovered = obj;
                        break;
                    }
                    obj = obj.parent;
                }
                if (hovered) break;
            }
            
            let hoveredTreeId = null;
            if (!hovered && toolId === 'delete') {
                const treeHits = this.raycaster.intersectObjects([this.gridSystem.instancedTrunks, this.gridSystem.instancedLeaves]);
                if (treeHits.length > 0) hoveredTreeId = treeHits[0].instanceId;
            }
            
            if (this.hoveredBuildingMesh && this.hoveredBuildingMesh !== hovered) {
                this.hoveredBuildingMesh.material.emissive.setHex(0x000000);
            }
            if (hovered && this.hoveredBuildingMesh !== hovered) {
                if (toolId === 'delete') {
                    hovered.material.emissive.setHex(0xff0000); // Red for delete
                } else {
                    hovered.material.emissive.setHex(0x333333);
                }
            }
            this.hoveredBuildingMesh = hovered;
            this.hoveredTreeId = hoveredTreeId;
            
            if (hoveredTreeId !== null && toolId === 'delete') {
                for (const [key, occupant] of this.gridSystem.worldRegistry.entries()) {
                    if (occupant.type === 'tree' && occupant.instanceId === hoveredTreeId) {
                        const [x, z] = key.split(',').map(Number);
                        const centerX = (x + 0.5) * this.gridSystem.tileSize;
                        const centerZ = (z + 0.5) * this.gridSystem.tileSize;
                        this.ghostMesh.geometry = this.ghostGeometries['tree'];
                        this.ghostMesh.position.set(centerX, 1.4, centerZ);
                        this.ghostMesh.rotation.y = 0;
                        this.ghostMesh.material = this.ghostMatInvalid;
                        this.ghostMesh.visible = true;
                        break;
                    }
                }
            }
            
            return;
        }
        
        if (this.hoveredBuildingMesh) {
            this.hoveredBuildingMesh.material.emissive.setHex(0x000000);
            this.hoveredBuildingMesh = null;
        }
        
        const fp = this.getToolFootprint(toolId);
        
        // Update geometry based on footprint
        if (fp.w === 2 && fp.h === 2) {
            this.ghostMesh.geometry = this.ghostGeometries['2x2'];
        } else if (fp.w === 2 && fp.h === 1) {
            this.ghostMesh.geometry = this.ghostGeometries['2x1'];
        } else {
            this.ghostMesh.geometry = this.ghostGeometries['1x1'];
        }

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const target = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.plane, target);
        
        if (hit) {
            const gridX = Math.floor(target.x / this.gridSystem.tileSize);
            const gridZ = Math.floor(target.z / this.gridSystem.tileSize);
            
            // Calculate center point based on footprint and rotation
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
            
            if (this.isValidPlacement(gridX, gridZ, toolId, actualW, actualH)) {
                this.ghostMesh.material = this.ghostMatValid;
            } else {
                this.ghostMesh.material = this.ghostMatInvalid;
            }
        } else {
            this.ghostMesh.visible = false;
        }
    }
    
    updateTooltip(e) {
        const tooltip = document.getElementById('world-tooltip');
        const bldTooltip = document.getElementById('building-world-tooltip');
        if (!tooltip || !bldTooltip) return;
        
        // Hide tooltips if mouse is hovering over UI elements instead of the canvas
        if (e.target !== this.domElement) {
            tooltip.style.display = 'none';
            bldTooltip.style.display = 'none';
            this._hoveredBldUuid = null;
            return;
        }
        
        const title = document.getElementById('tooltip-title');
        const desc = document.getElementById('tooltip-desc');
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);
        
        let foundNode = false;
        let foundBuilding = false;
        let bldObj = null;
        
        for (const hit of intersects) {
            let obj = hit.object;
            // Walk up the parent chain to find tagged objects
            while (obj && obj !== this.scene) {
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
            if (bld && bldTooltip) {
                const nameEl = document.getElementById('bwt-name');
                const detailsEl = document.getElementById('bwt-details');
                const progressBar = document.getElementById('bwt-progress-bar');
                const rateEl = document.getElementById('bwt-rate');
                
                if (bld.isExtractor) {
                    const typeName = bld.type.charAt(0).toUpperCase() + bld.type.slice(1);
                    nameEl.textContent = 'Miner';
                    const iconColors = { iron: '#ff3333', copper: '#3498db', coal: '#333333', gold: '#f1c40f', water: '#2ecc71', poop: '#8B4513' };
                    const outBuffer = bld.outputBuffer[bld.type] || 0;
                    detailsEl.innerHTML = `Extracting: <strong style="color:${iconColors[bld.type] || '#fff'}">${typeName}</strong><br>Buffer: <strong>${outBuffer} / 50</strong>`;
                    
                    const occ = this.gridSystem.getOccupantAt(bld.x, bld.z);
                    const level = occ ? occ.level : 1;
                    const baseRate = this.gameLogic.baseRates[bld.type] || 1;
                    const actualRate = baseRate * level;
                    
                    const pct = bld.isWorking ? Math.min(100, (bld.progress / 1.0) * 100) : 0;
                    progressBar.style.width = pct + '%';
                    progressBar.style.background = iconColors[bld.type] || '#2ecc71';
                    
                    rateEl.textContent = bld.isWorking ? `+${actualRate} ${bld.type}/s` : 'Idle';
                    rateEl.style.color = bld.isWorking ? (iconColors[bld.type] || '#5f5') : '#aaa';
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
                bldTooltip.style.display = 'block';
                bldTooltip.style.left = (e.clientX + 15) + 'px';
                bldTooltip.style.top = (e.clientY + 15) + 'px';
            }
            // Hide node tooltip
            tooltip.style.display = 'none';
        } else {
            // Check grid for nodes
            const intersectPt = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(this.plane, intersectPt)) {
                let gridX = Math.floor(intersectPt.x / this.gridSystem.tileSize);
                let gridZ = Math.floor(intersectPt.z / this.gridSystem.tileSize);
                const occupant = this.gridSystem.getOccupantAt(gridX, gridZ);
                
                if (occupant && occupant.type === 'node') {
                    foundNode = true;
                    if (this.ui.activeTool === 'miner') {
                        const extTooltip = document.getElementById('extractor-tooltip');
                        if (extTooltip) {
                            extTooltip.style.display = 'block';
                            extTooltip.style.left = (e.clientX + 15) + 'px';
                            extTooltip.style.top = (e.clientY + 15) + 'px';
                            
                            const subType = occupant.subType;
                            const typeName = subType.charAt(0).toUpperCase() + subType.slice(1);
                            document.getElementById('tt-name').textContent = 'Miner';
                            document.getElementById('tt-node').textContent = typeName;
                            
                            const baseRate = this.gameLogic.baseRates[subType] || 1;
                            const rate = baseRate * occupant.level;
                            document.getElementById('tt-rate').textContent = rate;
                            document.getElementById('tt-cost').textContent = '15';
                        }
                    } else {
                        tooltip.style.display = 'block';
                        tooltip.style.left = (e.clientX + 15) + 'px';
                        tooltip.style.top = (e.clientY + 15) + 'px';
                        
                        const t = occupant.subType;
                        const name = t.charAt(0).toUpperCase() + t.slice(1);
                        title.textContent = name + ' Node';
                        
                        if (t === 'water' || t === 'poop') {
                            desc.textContent = '';
                        } else {
                            desc.textContent = 'Purity Level: ' + occupant.level;
                            if (occupant.level === 1.5) desc.textContent += ' (x1.5)';
                            if (occupant.level === 2) desc.textContent += ' (x2)';
                            if (occupant.level === 3) desc.textContent += ' (x3)';
                        }
                    }
                }
            }
        }
        
        if (!foundBuilding && bldTooltip) {
            bldTooltip.style.display = 'none';
            this._hoveredBldUuid = null;
        }
        if (!foundNode) {
            tooltip.style.display = 'none';
            document.getElementById('extractor-tooltip').style.display = 'none';
        } else if (this.ui.activeTool === 'miner') {
            tooltip.style.display = 'none';
        } else {
            document.getElementById('extractor-tooltip').style.display = 'none';
        }
    }
    
    isValidPlacement(startX, startZ, toolId, w, h) {
        if (!this.gameLogic.canAfford(toolId)) return false;
        
        const isMiner = toolId === 'miner';
        
        for (let x = startX; x < startX + w; x++) {
            for (let z = startZ; z < startZ + h; z++) {
                const occupant = this.gridSystem.getOccupantAt(x, z);
                
                if (isMiner) {
                    // Extractors must be entirely on their target node
                    if (!occupant || occupant.type !== 'node') {
                        return false;
                    }
                } else {
                    // Normal buildings can overwrite trees, but cannot overwrite nodes or other buildings
                    if (occupant && occupant.type !== 'tree') {
                        return false;
                    }
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
            } else if (bld && !bld.isExtractor) {
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
                                    tb.inboundCount[k] = (tb.inboundCount[k] || 0) + amount; // reserve space
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
                // Refund cost 100%
                const cost = this.gameLogic.getBuildingCost(bld.id);
                this.gameLogic.inventory.confiscatedPhones += cost;
                
                // Play crunch sound
                if (this.soundEngine) this.soundEngine.play('destroy');
                
                // Remove from grid and scene
                this.scene.remove(this.hoveredBuildingMesh);
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
                this.ui.updateDisplay();
            }
        } else if (this.hoveredTreeId !== null && this.hoveredTreeId !== undefined) {
            // Delete Tree
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
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const target = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.plane, target);
        const gridX = Math.floor(target.x / this.gridSystem.tileSize);
        const gridZ = Math.floor(target.z / this.gridSystem.tileSize);
        
        const toolId = this.ui.activeTool;
        const fp = this.getToolFootprint(toolId);
        let actualW = fp.w;
        let actualH = fp.h;
        if (this.ghostRotation === Math.PI / 2) {
            actualW = fp.h; actualH = fp.w;
        }
        
        if (this.gameLogic.purchaseBuilding(toolId)) {
            if (this.soundEngine) {
                if (toolId === 'smelter') {
                    this.soundEngine.play('hammer_place');
                } else {
                    this.soundEngine.play('place');
                }
            }
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
            
            // Spawn solid mesh
            const buildingMesh = new THREE.Mesh(this.ghostMesh.geometry, this.buildingMat.clone());
            buildingMesh.position.copy(this.ghostMesh.position);
            buildingMesh.rotation.copy(this.ghostMesh.rotation);
            buildingMesh.castShadow = true;
            buildingMesh.receiveShadow = true;
            buildingMesh.userData = { isBuilding: true, uuid: uuid };
            
            this.buildExtractorTops(buildingMesh, toolId, nodeSubType);
            this.scene.add(buildingMesh);
            
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
            
            this.ui.updateDisplay();
            this.updateGhost();
            
            // Clear hover state to force a recalculation on the next frame so tooltip updates instantly
            this._hoveredBldUuid = null;
        } else {
            if (this.soundEngine) this.soundEngine.play('error');
        }
    }

    forcePlaceBuilding(toolId, gridX, gridZ, rotation, nodeLevel, nodeSubType, savedUuid) {
        // Calculate footprint
        const fp = this.getToolFootprint(toolId);
        let actualW = fp.w;
        let actualH = fp.h;
        if (rotation === Math.PI / 2) {
            actualW = fp.h; actualH = fp.w;
        }

        // Add to logic
        const uuid = this.gameLogic.addBuilding(toolId, gridX, gridZ, nodeLevel, rotation, nodeSubType, savedUuid);

        // Remove trees and notes from grid if necessary (they should already be gone or we just clear them)
        for (let x = gridX; x < gridX + actualW; x++) {
            for (let z = gridZ; z < gridZ + actualH; z++) {
                const occupant = this.gridSystem.getOccupantAt(x, z);
                if (occupant && occupant.type === 'tree') {
                    this.gridSystem.removeObjectAt(x, z);
                }
            }
        }

        // Generate geometry based on tool footprint
        let geo;
        if (fp.w === 2 && fp.h === 2) {
            geo = this.ghostGeometries['2x2'];
        } else if (fp.w === 2 && fp.h === 1) {
            geo = this.ghostGeometries['2x1'];
        } else {
            geo = this.ghostGeometries['1x1'];
        }
        
        // Spawn solid mesh
        const buildingMesh = new THREE.Mesh(geo, this.buildingMat.clone());
        
        // Translation logic exactly like updateGhost
        const centerX = (gridX + actualW / 2) * this.gridSystem.tileSize;
        const centerZ = (gridZ + actualH / 2) * this.gridSystem.tileSize;
        buildingMesh.position.set(centerX, 0.3, centerZ);
        buildingMesh.rotation.y = rotation;
        
        buildingMesh.castShadow = true;
        buildingMesh.receiveShadow = true;
        buildingMesh.userData = { isBuilding: true, uuid: uuid };
        
        this.buildExtractorTops(buildingMesh, toolId, nodeSubType);
        
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
        
        this.scene.add(buildingMesh);
    }
    
    buildExtractorTops(buildingMesh, toolId, nodeSubType) {
        let extMesh;
        // Add tops
            if (toolId === 'miner' && nodeSubType) {
                const iconColors = { iron: '#ff3333', copper: '#3498db', coal: '#333333', gold: '#f1c40f', water: '#2ecc71', poop: '#8B4513' };
                const iconColor = parseInt(iconColors[nodeSubType].replace('#', '0x'));
                
                // Base
                const topGeo = new THREE.BoxGeometry(0.6, 0.4, 0.6);
                const topMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.4, flatShading: true });
                const topMesh = new THREE.Mesh(topGeo, topMat);
                topMesh.position.y = 0.2;
                buildingMesh.add(topMesh);
                
                // Animated Extractor part
                if (nodeSubType === 'poop') {
                    buildingMesh.remove(topMesh); // Remove default base
                    
                    extMesh = new THREE.Group();
                    
                    // Toilet bowl
                    const bowlGeo = new THREE.CylinderGeometry(0.25, 0.2, 0.3, 8);
                    const porcelainMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
                    const bowl = new THREE.Mesh(bowlGeo, porcelainMat);
                    bowl.position.set(0, 0.15, 0.1);
                    bowl.castShadow = true;
                    buildingMesh.add(bowl);
                    
                    // Hide the black box base for the toilet
                    buildingMesh.material.visible = false;
                    
                    // Toilet tank
                    const tankGeo = new THREE.BoxGeometry(0.5, 0.4, 0.2);
                    const tank = new THREE.Mesh(tankGeo, porcelainMat);
                    tank.position.set(0, 0.35, -0.2);
                    tank.castShadow = true;
                    buildingMesh.add(tank);
                    
                    // Robotic Arm Base
                    const armBaseGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
                    const armMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
                    const armBase = new THREE.Mesh(armBaseGeo, armMat);
                    armBase.position.set(0, 0.8, -0.2);
                    armBase.castShadow = true;
                    buildingMesh.add(armBase);
                    
                    // Moving Arm + Plunger
                    const stickGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8);
                    const stickMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
                    const stick = new THREE.Mesh(stickGeo, stickMat);
                    stick.position.set(0, 0.3, 0.1);
                    stick.castShadow = true;
                    extMesh.add(stick);
                    
                    const cupGeo = new THREE.SphereGeometry(0.15, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2);
                    const cupMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, side: THREE.DoubleSide });
                    const cupMesh = new THREE.Mesh(cupGeo, cupMat);
                    cupMesh.position.set(0, 0, 0.1);
                    cupMesh.rotation.x = Math.PI; // Face down
                    cupMesh.castShadow = true;
                    extMesh.add(cupMesh);
                    
                    // Horizontal connector arm
                    const connGeo = new THREE.BoxGeometry(0.05, 0.05, 0.3);
                    const conn = new THREE.Mesh(connGeo, armMat);
                    conn.position.set(0, 0.6, -0.05);
                    conn.castShadow = true;
                    extMesh.add(conn);
                    
                    extMesh.position.y = 0; 
                    buildingMesh.userData.isPlunger = true;
                } else if (nodeSubType === 'water') {
                    buildingMesh.remove(topMesh); // Remove default base
                    
                    extMesh = new THREE.Group();
                    
                    // Main pump pipe
                    const pipeGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
                    const metalMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
                    const pipe = new THREE.Mesh(pipeGeo, metalMat);
                    pipe.position.y = 0.4;
                    buildingMesh.add(pipe);
                    
                    // Spout
                    const spoutGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
                    const spout = new THREE.Mesh(spoutGeo, metalMat);
                    spout.rotation.x = Math.PI / 2;
                    spout.position.set(0, 0.5, 0.25);
                    buildingMesh.add(spout);
                    
                    // Teardrop decal
                    const dropGeo = new THREE.ConeGeometry(0.04, 0.1, 8);
                    const dropMat = new THREE.MeshBasicMaterial({ color: 0x00aaff });
                    const drop = new THREE.Mesh(dropGeo, dropMat);
                    drop.position.set(0.15, 0.5, 0);
                    drop.rotation.z = -Math.PI / 2;
                    buildingMesh.add(drop);
                    
                    // Lever handle
                    const handleGeo = new THREE.BoxGeometry(0.05, 0.05, 0.6);
                    const handleMat = new THREE.MeshStandardMaterial({ color: 0x882222 });
                    const handle = new THREE.Mesh(handleGeo, handleMat);
                    handle.position.set(0, 0, -0.25); // Extend backward
                    extMesh.add(handle);
                    
                    extMesh.position.set(0, 0.8, 0); // pivot point at top
                    buildingMesh.userData.isPump = true;
                } else {
                    extMesh = new THREE.Group();
                    const drillMat = new THREE.MeshStandardMaterial({ color: iconColor, metalness: 0.8, roughness: 0.2, flatShading: true });
                    
                    const step1 = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8);
                    const m1 = new THREE.Mesh(step1, drillMat);
                    m1.position.y = 0.65;
                    extMesh.add(m1);
                    
                    const step2 = new THREE.CylinderGeometry(0.15, 0.15, 0.3, 8);
                    const m2 = new THREE.Mesh(step2, drillMat);
                    m2.position.y = 0.35;
                    extMesh.add(m2);
                    
                    const step3 = new THREE.ConeGeometry(0.1, 0.3, 8);
                    const m3 = new THREE.Mesh(step3, drillMat);
                    m3.position.y = 0.05;
                    m3.rotation.x = Math.PI; // point down
                    extMesh.add(m3);
                    
                    extMesh.position.y = 0.2;
                    buildingMesh.userData.isDrill = true;
                }
                
                buildingMesh.add(extMesh);
                buildingMesh.userData.extMesh = extMesh;
                buildingMesh.userData.nodeType = nodeSubType;
                buildingMesh.userData.extractColor = iconColor;
            } else if (toolId === 'smelter') {
                const topGeo = new THREE.BoxGeometry(0.6, 0.2, 0.6);
                const topMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff4400, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.2, flatShading: true });
                const topMesh = new THREE.Mesh(topGeo, topMat);
                topMesh.position.y = 0.4;
                buildingMesh.add(topMesh);
                
                // Smokestack
                const stackGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6);
                const stackMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2, flatShading: true });
                const stack = new THREE.Mesh(stackGeo, stackMat);
                stack.position.set(0.35, 0.75, 0.0);
                buildingMesh.add(stack);
                buildingMesh.userData.stackOffset = new THREE.Vector3(0.35, 1.0, 0.0);
            } else if (toolId === 'constructor') {
                // Industrial Press
                const pillarGeo = new THREE.BoxGeometry(0.2, 0.8, 0.4);
                const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.8, roughness: 0.2, flatShading: true });
                const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
                leftPillar.position.set(-0.6, 0.6, 0);
                const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
                rightPillar.position.set(0.6, 0.6, 0);
                buildingMesh.add(leftPillar);
                buildingMesh.add(rightPillar);
                
                const headGeo = new THREE.BoxGeometry(1.0, 0.2, 0.4);
                const headMat = new THREE.MeshStandardMaterial({ color: 0x3498db, emissive: 0x3498db, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.2, flatShading: true });
                const pressHead = new THREE.Mesh(headGeo, headMat);
                pressHead.position.set(0, 0.8, 0);
                pressHead.userData.isPress = true;
                buildingMesh.add(pressHead);
                
                // Base glowing stripe
                const stripeGeo = new THREE.BoxGeometry(1.8, 0.05, 0.82);
                const stripeMat = new THREE.MeshStandardMaterial({ color: 0x3498db, emissive: 0x3498db, emissiveIntensity: 1.0 });
                const stripe = new THREE.Mesh(stripeGeo, stripeMat);
                stripe.position.set(0, 0.1, 0);
                buildingMesh.add(stripe);
            } else if (toolId === 'bigConstructor') {
                // Rotary Fabricator
                const mountGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
                const mountMat = new THREE.MeshStandardMaterial({ color: 0x34495e, metalness: 0.8, roughness: 0.2, flatShading: true });
                const mount = new THREE.Mesh(mountGeo, mountMat);
                mount.position.set(0, 0.4, 0);
                buildingMesh.add(mount);
                
                const ringGeo = new THREE.TorusGeometry(0.6, 0.15, 8, 16);
                const ringMat = new THREE.MeshStandardMaterial({ color: 0x9b59b6, emissive: 0x9b59b6, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.2, flatShading: true });
                const spinner = new THREE.Mesh(ringGeo, ringMat);
                spinner.position.set(0, 0.8, 0);
                spinner.rotation.x = Math.PI / 2;
                spinner.userData.isSpinner = true;
                buildingMesh.add(spinner);
            } else if (toolId === 'school') {
                const topGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
                const topMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.2, roughness: 0.8, flatShading: true });
                const topMesh = new THREE.Mesh(topGeo, topMat);
                topMesh.position.y = 0.5;
                buildingMesh.add(topMesh);
            } else if (toolId === 'storage') {
                const topGeo = new THREE.BoxGeometry(0.8, 0.2, 1.8);
                const topMat = new THREE.MeshStandardMaterial({ color: 0x34495e, metalness: 0.8, roughness: 0.2, flatShading: true });
                const topMesh = new THREE.Mesh(topGeo, topMat);
                topMesh.position.y = 0.4;
                buildingMesh.add(topMesh);
                
                const portGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8);
                const portMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, emissive: 0x00ff88, emissiveIntensity: 0.2, metalness: 0.8, roughness: 0.2, flatShading: true });
                const portMesh = new THREE.Mesh(portGeo, portMat);
                portMesh.position.y = 0.55;
                buildingMesh.add(portMesh);
            }
    }
    
    update(deltaTime) {
        this.updateGhost();
        
        // Update tree shader uniforms for see-through leaves
        if (this.gridSystem.treeLeavesMat.userData.shader) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            this.gridSystem.treeLeavesMat.userData.shader.uniforms.uRayOrigin.value.copy(this.raycaster.ray.origin);
            this.gridSystem.treeLeavesMat.userData.shader.uniforms.uRayDir.value.copy(this.raycaster.ray.direction).normalize();
            
            // If the mouse is off-screen (e.g. over UI), we could hide the hole by moving the ray far away,
            // but for now relying on ray distance works perfectly.
        }
        
        // Continuously refresh tooltip with last known mouse position
        // This keeps it alive and synced even when cursor is over UI panels
        if (this._lastMouseEvent) {
            this.updateTooltip(this._lastMouseEvent);
        }
        
        // Live-update the building world tooltip progress bar
        if (this._hoveredBldUuid) {
            const bld = this.gameLogic.buildings.find(b => b.uuid === this._hoveredBldUuid);
            const progressBar = document.getElementById('bwt-progress-bar');
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
            const dummy = new THREE.Object3D();
            const activeDrones = this.gameLogic.drones || [];
            this.droneMesh.count = activeDrones.length;
            
            for (let i = 0; i < activeDrones.length; i++) {
                const d = activeDrones[i];
                const source = this.gameLogic.buildings.find(b => b.uuid === d.sourceUuid);
                const target = this.gameLogic.buildings.find(b => b.uuid === d.targetUuid);
                
                if (source && target) {
                    const t = Math.min(1, d.progress / d.tripDist);
                    const sx = (source.x + 0.5) * this.gridSystem.tileSize;
                    const sz = (source.z + 0.5) * this.gridSystem.tileSize;
                    const tx = (target.x + 0.5) * this.gridSystem.tileSize;
                    const tz = (target.z + 0.5) * this.gridSystem.tileSize;
                    
                    const x = sx + (tx - sx) * t;
                    const z = sz + (tz - sz) * t;
                    
                    const y = 2.0 + Math.sin(t * Math.PI) * 2.0;
                    
                    dummy.position.set(x, y, z);
                    dummy.lookAt(tx, y, tz);
                    dummy.updateMatrix();
                    this.droneMesh.setMatrixAt(i, dummy.matrix);
                    
                    // Spawn glowing trail
                    if (this.fxSystem) {
                        this.fxSystem.spawnTrail(x, y, z);
                    }
                }
            }
            this.droneMesh.instanceMatrix.needsUpdate = true;
        }
        
        // Render simple smoke or animation
        const dt = Math.min(deltaTime, 0.1); // Cap deltaTime to 100ms for animations
        
        for (const bld of this.gameLogic.buildings) {
            if (!bld.mesh) continue;
            
            const occupantMesh = bld.mesh;
            
            if (!bld._fxTimer) bld._fxTimer = 0;
            bld._fxTimer += dt;

            if (bld.isExtractor) {
                if (bld.isWorking) {
                    // Animate based on extraction progress
                    if (bld.extMesh) {
                        const prog = bld.progress / bld.cycleTime; // 0 to 1
                        
                        if (occupantMesh.userData.isDrill) {
                            bld.extMesh.rotation.y -= dt * 10;
                            bld.extMesh.position.y = 0.2 + prog * 0.4; // Lifts up, snaps down at 0
                        } else if (occupantMesh.userData.isPlunger) {
                            bld.extMesh.position.y = prog * 0.4; // Lifts up, snaps down
                        } else if (occupantMesh.userData.isPump) {
                            bld.extMesh.rotation.x = -prog * (Math.PI / 3); // Handle pushes down
                        }
                    }
                    
                    // Particles
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
                    // Robotic arm swing
                    occupantMesh.children[0].rotation.y = Math.sin(Date.now() / 50) * 0.1;
                } else if (bld.type === 'constructor') {
                    // Press moving up and down
                    const pressHead = occupantMesh.children.find(c => c.userData && c.userData.isPress);
                    if (pressHead) {
                        // Fast snap down, slow pull up motion
                        const time = (Date.now() / 1000) * Math.PI * 4; // 2 presses per second
                        pressHead.position.y = 0.55 + Math.abs(Math.sin(time)) * 0.25;
                    }
                } else if (bld.type === 'bigConstructor') {
                    // Rotary gear spinning continuously
                    const spinner = occupantMesh.children.find(c => c.userData && c.userData.isSpinner);
                    if (spinner) {
                        spinner.rotation.z -= dt * 4;
                    }
                }
                
                // Timer-based smoke emission (one puff every ~0.4s)
                if (this.fxSystem && bld._fxTimer >= 0.4) {
                    bld._fxTimer -= 0.4;
                    
                    // Compute smoke origin from smokestack if present
                    let sx = occupantMesh.position.x;
                    let sy = occupantMesh.position.y + 0.6;
                    let sz = occupantMesh.position.z;
                    
                    if (occupantMesh.userData.stackOffset) {
                        const offset = occupantMesh.userData.stackOffset.clone();
                        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), occupantMesh.rotation.y);
                        sx = occupantMesh.position.x + offset.x;
                        sy = occupantMesh.position.y + offset.y;
                        sz = occupantMesh.position.z + offset.z;
                    }
                    
                    this.fxSystem.spawnSmoke(sx, sy, sz);
                }
            } else if (!bld.isWorking && !bld.isExtractor) {
                // Reset transforms when not working
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
