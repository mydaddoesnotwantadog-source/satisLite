import * as THREE from 'three';

export class GridSystem {
    constructor(scene, mapSize = 50) {
        this.scene = scene;
        this.mapSize = mapSize;
        this.tileSize = 1.0;
        
        // Materials
        this.gridMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x32CD32, // Specific grass color
            metalness: 0.05,
            roughness: 0.95,
            flatShading: true
        });
        
        // Emissive neon grid lines
        this.gridLineMaterial = new THREE.LineBasicMaterial({ color: 0xA2D884, transparent: true, opacity: 0.4 });
        
        // Spatial Registry mapping "x,z" to { type, mesh }
        this.worldRegistry = new Map();
        
        // Resource node definitions
        this.resourceTypes = [
            { type: 'iron', color: 0xBDC3C7, prob: 0.35 },
            { type: 'copper', color: 0xE67E22, prob: 0.35 },
            { type: 'coal', color: 0x34495E, prob: 0.25 },
            { type: 'gold', color: 0xFFD700, prob: 0.05 }
        ];
        
        // Tree Geometries -> Redesigned as dominating lush trees
        this.treeTrunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 1.5, 6);
        this.treeLeavesGeo = new THREE.DodecahedronGeometry(1.2, 1);
        this.treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.9, flatShading: true }); // Rich warm wood
        this.treeLeavesMat = new THREE.MeshStandardMaterial({ color: 0x45B36B, roughness: 0.8, flatShading: true }); // Saturated vibrant canopy
        
        // Custom shader for seeing through leaves around the mouse ray
        this.treeLeavesMat.onBeforeCompile = (shader) => {
            shader.uniforms.uRayOrigin = { value: new THREE.Vector3(0,0,0) };
            shader.uniforms.uRayDir = { value: new THREE.Vector3(0,-1,0) };
            shader.uniforms.uRadius = { value: 2.5 };
            
            shader.vertexShader = `
                varying vec3 vMyWorldPos;
                ${shader.vertexShader}
            `.replace(
                `#include <worldpos_vertex>`,
                `
                #include <worldpos_vertex>
                #ifdef USE_INSTANCING
                    vMyWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
                #else
                    vMyWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
                #endif
                `
            );
            
            shader.fragmentShader = `
                uniform vec3 uRayOrigin;
                uniform vec3 uRayDir;
                uniform float uRadius;
                varying vec3 vMyWorldPos;
                ${shader.fragmentShader}
            `.replace(
                `#include <alphatest_fragment>`,
                `
                #include <alphatest_fragment>
                float distToRay = length(cross(uRayDir, vMyWorldPos - uRayOrigin));
                if (distToRay < uRadius) discard;
                `
            );
            
            this.treeLeavesMat.userData.shader = shader;
        };
        
        this.generateMap();
    }

    hash(x, z) {
        let n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453123;
        return n - Math.floor(n);
    }
    
    noise(x, z) {
        const x0 = Math.floor(x);
        const z0 = Math.floor(z);
        const sx = x - x0;
        const sz = z - z0;
        
        const n00 = this.hash(x0, z0);
        const n10 = this.hash(x0 + 1, z0);
        const n01 = this.hash(x0, z0 + 1);
        const n11 = this.hash(x0 + 1, z0 + 1);
        
        const nx0 = n00 * (1 - sx) + n10 * sx;
        const nx1 = n01 * (1 - sx) + n11 * sx;
        
        return nx0 * (1 - sz) + nx1 * sz;
    }
    
    noise2(x, z) {
        return this.noise(x + 50.5, z + 70.3); // Offset for different pattern
    }
    
    getResourceType(rand) {
        let acc = 0;
        for (let r of this.resourceTypes) {
            acc += r.prob;
            if (rand <= acc) return r;
        }
        return this.resourceTypes[0];
    }
    
    createResourceNode(level, colorHex, hashVal) {
        const isGold = colorHex === 0xF4D03F;
        const isCoal = colorHex === 0x34495E;
        const isCopper = colorHex === 0xE67E22;
        const isIron = colorHex === 0xBDC3C7;
        
        let metalness = 0.5;
        let roughness = 0.5;
        let emissiveInt = 0.05;
        
        if (isGold) { metalness = 1.0; roughness = 0.1; emissiveInt = 0.05; } // Pure shiny gold
        else if (isCoal) { metalness = 0.8; roughness = 0.2; emissiveInt = 0.0; } // Shiny glossy obsidian
        else if (isCopper) { metalness = 0.9; roughness = 0.3; emissiveInt = 0.02; } // Vibrant shiny bronze
        else if (isIron) { metalness = 0.8; roughness = 0.4; emissiveInt = 0.02; } // Raw metallic silver
        
        const group = new THREE.Group();
        const chunkMat = new THREE.MeshStandardMaterial({ 
            color: colorHex, 
            emissive: colorHex,
            emissiveIntensity: emissiveInt,
            metalness: metalness,
            roughness: roughness,
            flatShading: true
        });
        
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5D6D7E, metalness: 0.1, roughness: 0.9, flatShading: true }); // Cool dark slate
        
        if (level >= 4) {
            const stoneBox = new THREE.BoxGeometry(0.8, 0.2, 0.8);
            const stone = new THREE.Mesh(stoneBox, stoneMat);
            stone.position.y = 0.1;
            group.add(stone);
            
            const boxGeo = new THREE.BoxGeometry(0.6, 0.4, 0.6);
            const box = new THREE.Mesh(boxGeo, chunkMat);
            box.position.y = 0.4;
            group.add(box);
        } else {
            const stoneSize = (level === 3) ? 0.7 : (level === 2 ? 0.6 : 0.4);
            const stoneBox = new THREE.BoxGeometry(stoneSize, 0.15, stoneSize);
            const stone = new THREE.Mesh(stoneBox, stoneMat);
            stone.position.y = 0.075;
            group.add(stone);
            
            const count = (level === 3) ? 14 : (level === 2 ? 8 : 4);
            const chunkGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
            for (let i = 0; i < count; i++) {
                const chunk = new THREE.Mesh(chunkGeo, chunkMat);
                chunk.position.set(
                    (this.hash(hashVal + i, 0) - 0.5) * (stoneSize - 0.1),
                    0.15 + this.hash(hashVal, i) * 0.2,
                    (this.hash(0, hashVal + i) - 0.5) * (stoneSize - 0.1)
                );
                group.add(chunk);
            }
        }
        return group;
    }
    
    // Helper to get chunk data instead of creating meshes
    getChunkData(level, colorHex, hashVal, px, py, pz) {
        const isGold = colorHex === 0xF4D03F;
        const isCoal = colorHex === 0x34495E;
        const isCopper = colorHex === 0xE67E22;
        const isIron = colorHex === 0xBDC3C7;
        
        let type = 'iron';
        if (isGold) type = 'gold';
        else if (isCoal) type = 'coal';
        else if (isCopper) type = 'copper';
        
        const chunks = [];
        let stone = null;
        
        if (level >= 4) {
            stone = { size: 0.8, x: px, y: py + 0.1, z: pz };
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const h = this.hash(hashVal + i, j);
                    chunks.push({
                        type: type,
                        x: px + (i - 1) * 0.3 + (h - 0.5) * 0.1,
                        y: py + 0.2 + h * 0.3,
                        z: pz + (j - 1) * 0.3 + (this.hash(j, hashVal + i) - 0.5) * 0.1,
                        scale: 1.0 + h * 0.5
                    });
                }
            }
        } else {
            const stoneSize = (level === 3) ? 0.7 : (level === 2 ? 0.6 : 0.4);
            stone = { size: stoneSize, x: px, y: py + 0.075, z: pz };
            
            const count = (level === 3) ? 14 : (level === 2 ? 8 : 4);
            for (let i = 0; i < count; i++) {
                chunks.push({
                    type: type,
                    x: px + (this.hash(hashVal + i, 0) - 0.5) * (stoneSize - 0.1),
                    y: py + 0.15 + this.hash(hashVal, i) * 0.2,
                    z: pz + (this.hash(0, hashVal + i) - 0.5) * (stoneSize - 0.1),
                    scale: 1.0
                });
            }
        }
        
        return { stone, chunks };
    }
    
    createPoopNode() {
        const group = new THREE.Group();
        // Lighter, more defined brown with high roughness for texture
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x9E6036, 
            roughness: 0.9,
            metalness: 0.0,
            flatShading: true 
        }); 
        const geo1 = new THREE.TorusGeometry(0.3, 0.15, 6, 16);
        geo1.rotateX(Math.PI/2);
        const ring1 = new THREE.Mesh(geo1, mat);
        ring1.position.y = 0.1; 
        group.add(ring1);
        const geo2 = new THREE.TorusGeometry(0.18, 0.12, 6, 16);
        geo2.rotateX(Math.PI/2);
        const ring2 = new THREE.Mesh(geo2, mat);
        ring2.position.y = 0.25;
        group.add(ring2);
        const geo3 = new THREE.ConeGeometry(0.18, 0.25, 8);
        const top = new THREE.Mesh(geo3, mat);
        top.position.y = 0.42;
        group.add(top);
        return group;
    }

    generateMap() {
        const mapGroup = new THREE.Group();
        const halfSize = this.mapSize / 2;
        
        this.mapData = new Map();
        for (let x = -halfSize; x < halfSize; x++) {
            for (let z = -halfSize; z < halfSize; z++) {
                // Sharp rivers
                const waterVal = Math.abs(this.noise(x * 0.1, z * 0.1) - 0.5);
                if (waterVal < 0.05) {
                    this.mapData.set(`${x},${z}`, { type: 'water' });
                    continue;
                }
                if (this.hash(x, z) < 0.01) {
                    this.mapData.set(`${x},${z}`, { type: 'poop' });
                    continue;
                }
                const density = this.noise(x * 0.5, z * 0.5);
                // Ores rarer
                if (density > 0.75) {
                    const rt = this.getResourceType(this.hash(x, z));
                    this.mapData.set(`${x},${z}`, { type: rt.type, color: rt.color });
                }
            }
        }
        
        const planeGeo = new THREE.PlaneGeometry(this.mapSize, this.mapSize);
        planeGeo.rotateX(-Math.PI / 2);
        const plane = new THREE.Mesh(planeGeo, this.gridMaterial);
        plane.receiveShadow = true;
        mapGroup.add(plane);
        
        const lineGeo = new THREE.BufferGeometry();
        const points = [];
        for (let i = -halfSize; i <= halfSize; i++) {
            points.push(i, 0.01, -halfSize, i, 0.01, halfSize);
            points.push(-halfSize, 0.01, i, halfSize, 0.01, i);
        }
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        const lines = new THREE.LineSegments(lineGeo, this.gridLineMaterial);
        mapGroup.add(lines);
        
        this.treeGrid = new Set();
        let treeCount = 0;
        for (let x = -halfSize; x < halfSize; x++) {
            for (let z = -halfSize; z < halfSize; z++) {
                if (!this.mapData.get(`${x},${z}`)) {
                    const clusterNoise = this.noise(x * 0.08, z * 0.08); // Low frequency for clusters
                    const isCluster = clusterNoise > 0.65;
                    const rand = this.hash(x + 100, z + 100);
                    
                    let shouldSpawn = false;
                    if (isCluster && rand < 0.3) shouldSpawn = true;
                    else if (!isCluster && rand < 0.015) shouldSpawn = true;
                    
                    if (shouldSpawn) {
                        // Check neighbors to prevent canopy overlap (minimum 2 tiles apart)
                        let overlap = false;
                        for (let dx = -2; dx <= 2; dx++) {
                            for (let dz = -2; dz <= 2; dz++) {
                                if (this.treeGrid.has(`${x+dx},${z+dz}`)) overlap = true;
                            }
                        }
                        if (!overlap) {
                            this.treeGrid.add(`${x},${z}`);
                            treeCount++;
                        }
                    }
                }
            }
        }
        
        this.instancedTrunks = new THREE.InstancedMesh(this.treeTrunkGeo, this.treeTrunkMat, treeCount);
        this.instancedTrunks.castShadow = true;
        this.instancedTrunks.receiveShadow = true;
        this.instancedTrunks.frustumCulled = false;
        
        this.instancedLeaves = new THREE.InstancedMesh(this.treeLeavesGeo, this.treeLeavesMat, treeCount);
        this.instancedLeaves.frustumCulled = false;
        this.instancedLeaves.castShadow = true;
        this.instancedLeaves.receiveShadow = true;
        
        mapGroup.add(this.instancedTrunks);
        mapGroup.add(this.instancedLeaves);
        
        const dummy = new THREE.Object3D();
        let treeIndex = 0;
        
        for (let x = -halfSize; x < halfSize; x++) {
            for (let z = -halfSize; z < halfSize; z++) {
                const data = this.mapData.get(`${x},${z}`);
                
                if (!data) {
                    if (this.treeGrid.has(`${x},${z}`)) {
                        const offsetX = (this.hash(x + 200, z + 200) - 0.5) * 0.4;
                        const offsetZ = (this.hash(x + 300, z + 300) - 0.5) * 0.4;
                        const rotY = this.hash(x + 400, z + 400) * Math.PI * 2;
                        const wX = (x + 0.5) * this.tileSize + offsetX;
                        const wZ = (z + 0.5) * this.tileSize + offsetZ;
                        dummy.position.set(wX, 0.75, wZ); // Trunk center
                        dummy.rotation.set(0, rotY, 0);
                        dummy.scale.set(1, 1, 1);
                        dummy.updateMatrix();
                        this.instancedTrunks.setMatrixAt(treeIndex, dummy.matrix);
                        
                        dummy.position.set(wX, 1.8, wZ); // Leaves center (on top of trunk)
                        // Add some random scaling to leaves for natural look
                        const leafScale = 0.8 + this.hash(x + 500, z + 500) * 0.6;
                        dummy.scale.set(leafScale, leafScale, leafScale);
                        dummy.updateMatrix();
                        this.instancedLeaves.setMatrixAt(treeIndex, dummy.matrix);
                        this.worldRegistry.set(`${x},${z}`, { type: 'tree', isInstanced: true, instanceId: treeIndex });
                        treeIndex++;
                    }
                    continue;
                }
                
                let nodeMesh;
                let finalLevel = 1;
                
                if (data.type === 'poop') {
                    nodeMesh = this.createPoopNode();
                    nodeMesh.position.set((x + 0.5) * this.tileSize, 0, (z + 0.5) * this.tileSize);
                    nodeMesh.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
                    nodeMesh.userData = { isNode: true, type: data.type, level: 1 };
                    mapGroup.add(nodeMesh);
                    this.worldRegistry.set(`${x},${z}`, { type: 'node', subType: data.type, level: 1, mesh: nodeMesh });
                } else if (data.type !== 'water') {
                    // Minable Ore
                    let adjacentCount = 0;
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dz = -1; dz <= 1; dz++) {
                            if (dx === 0 && dz === 0) continue;
                            const neighbor = this.mapData.get(`${x+dx},${z+dz}`);
                            if (neighbor && neighbor.type === data.type) adjacentCount++;
                        }
                    }
                    
                    let multiplier = 1.0;
                    let visualLevel = 1;
                    if (adjacentCount === 1) { multiplier = 1.5; visualLevel = 2; }
                    else if (adjacentCount === 2) { multiplier = 2.0; visualLevel = 3; }
                    else if (adjacentCount >= 3) { multiplier = 3.0; visualLevel = 4; }
                    
                    data.level = multiplier;
                    finalLevel = multiplier;
                    
                    const hashVal = this.hash(x, z);
                    const px = (x + 0.5) * this.tileSize;
                    const py = 0;
                    const pz = (z + 0.5) * this.tileSize;
                    
                    const chunkData = this.getChunkData(visualLevel, data.color, hashVal, px, py, pz);
                    data.chunkData = chunkData; // Store for second pass
                    
                    this.worldRegistry.set(`${x},${z}`, { type: 'node', subType: data.type, level: finalLevel, chunkData: chunkData });
                } else {
                    this.worldRegistry.set(`${x},${z}`, { type: 'node', subType: 'water', level: 1 });
                }
            }
        }

        // Second pass: Create InstancedMeshes
        const chunkCounts = { iron: 0, copper: 0, coal: 0, gold: 0 };
        let stoneCount = 0;
        let waterCount = 0;
        
        for (const data of this.mapData.values()) {
            if (data.type === 'water') waterCount++;
            if (data.chunkData) {
                stoneCount++;
                for (const c of data.chunkData.chunks) {
                    if (chunkCounts[c.type] !== undefined) chunkCounts[c.type]++;
                }
            }
        }
        
        // Setup InstancedMeshes
        const stoneBoxGeo = new THREE.BoxGeometry(1, 0.15, 1);
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5D6D7E, metalness: 0.1, roughness: 0.9, flatShading: true });
        this.instancedStones = new THREE.InstancedMesh(stoneBoxGeo, stoneMat, stoneCount);
        this.instancedStones.castShadow = true;
        this.instancedStones.receiveShadow = true;
        this.instancedStones.frustumCulled = false;
        mapGroup.add(this.instancedStones);
        
        const chunkGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        this.instancedChunks = {};
        for (const rt of this.resourceTypes) {
            let metalness = 0.5, roughness = 0.5, emissiveInt = 0.05;
            if (rt.type === 'gold') { metalness = 1.0; roughness = 0.1; emissiveInt = 0.05; }
            else if (rt.type === 'coal') { metalness = 0.8; roughness = 0.2; emissiveInt = 0.0; }
            else if (rt.type === 'copper') { metalness = 0.9; roughness = 0.3; emissiveInt = 0.02; }
            else if (rt.type === 'iron') { metalness = 0.8; roughness = 0.4; emissiveInt = 0.02; }
            
            const mat = new THREE.MeshStandardMaterial({ 
                color: rt.color, emissive: rt.color, emissiveIntensity: emissiveInt,
                metalness, roughness, flatShading: true
            });
            const imesh = new THREE.InstancedMesh(chunkGeo, mat, chunkCounts[rt.type] || 0);
            imesh.castShadow = true;
            imesh.receiveShadow = true;
            imesh.frustumCulled = false;
            this.instancedChunks[rt.type] = imesh;
            mapGroup.add(imesh);
        }
        
        const puddleGeo = new THREE.PlaneGeometry(1.02, 1.02); // Slightly larger to overlap seams
        puddleGeo.rotateX(-Math.PI/2);
        const waterMat = new THREE.MeshStandardMaterial({ 
            color: 0x1FB0E8, transparent: false, opacity: 1.0, 
            roughness: 0.1, metalness: 0.1, flatShading: true, depthWrite: true
        });
        this.instancedWater = new THREE.InstancedMesh(puddleGeo, waterMat, waterCount);
        this.instancedWater.receiveShadow = true;
        this.instancedWater.frustumCulled = false;
        mapGroup.add(this.instancedWater);
        
        // Populate instances
        let stoneIdx = 0;
        const chunkIdx = { iron: 0, copper: 0, coal: 0, gold: 0 };
        let waterIdx = 0;
        
        const tempMat = new THREE.Matrix4();
        const tempPos = new THREE.Vector3();
        const tempQuat = new THREE.Quaternion();
        const tempScale = new THREE.Vector3();
        
        for (let x = -halfSize; x < halfSize; x++) {
            for (let z = -halfSize; z < halfSize; z++) {
                const data = this.mapData.get(`${x},${z}`);
                if (!data) continue;
                
                const reg = this.worldRegistry.get(`${x},${z}`);
                
                if (data.type === 'water') {
                    tempPos.set((x + 0.5) * this.tileSize, 0.02, (z + 0.5) * this.tileSize);
                    tempQuat.identity(); // Reset rotation for water
                    tempMat.compose(tempPos, tempQuat, new THREE.Vector3(1,1,1));
                    this.instancedWater.setMatrixAt(waterIdx, tempMat);
                    if (reg) { reg.isInstanced = true; reg.instanceType = 'water'; reg.instanceId = waterIdx; }
                    waterIdx++;
                } else if (data.chunkData) {
                    const cData = data.chunkData;
                    
                    tempPos.set(cData.stone.x, cData.stone.y, cData.stone.z);
                    tempScale.set(cData.stone.size, 1, cData.stone.size);
                    tempQuat.identity(); // Reset rotation for stone base
                    tempMat.compose(tempPos, tempQuat, tempScale);
                    this.instancedStones.setMatrixAt(stoneIdx, tempMat);
                    
                    if (reg) { 
                        reg.isInstanced = true; 
                        reg.instanceType = 'ore'; 
                        reg.stoneId = stoneIdx; 
                        reg.chunkIds = [];
                        reg.chunkType = data.type;
                    }
                    stoneIdx++;
                    
                    for (const c of cData.chunks) {
                        tempPos.set(c.x, c.y, c.z);
                        tempScale.set(c.scale, c.scale, c.scale);
                        
                        // Add some random rotation to chunks based on position
                        tempQuat.setFromEuler(new THREE.Euler(
                            (c.x % 1) * 0.4, 
                            (c.x * c.z % 1) * Math.PI, 
                            (c.z % 1) * 0.4
                        ));
                        
                        tempMat.compose(tempPos, tempQuat, tempScale);
                        const iMesh = this.instancedChunks[c.type];
                        const idx = chunkIdx[c.type];
                        iMesh.setMatrixAt(idx, tempMat);
                        
                        if (reg) reg.chunkIds.push(idx);
                        chunkIdx[c.type]++;
                    }
                }
            }
        }

        this.scene.add(mapGroup);
    }
    
    // API for Placement System
    getOccupantAt(x, z) {
        return this.worldRegistry.get(`${x},${z}`);
    }
    
    removeObjectAt(x, z) {
        const key = `${x},${z}`;
        const obj = this.worldRegistry.get(key);
        if (obj) {
            const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
            
            if (obj.isInstanced) {
                if (obj.type === 'tree') {
                    this.instancedTrunks.setMatrixAt(obj.instanceId, zeroMatrix);
                    this.instancedLeaves.setMatrixAt(obj.instanceId, zeroMatrix);
                    this.instancedTrunks.instanceMatrix.needsUpdate = true;
                    this.instancedLeaves.instanceMatrix.needsUpdate = true;
                } else if (obj.instanceType === 'water') {
                    this.instancedWater.setMatrixAt(obj.instanceId, zeroMatrix);
                    this.instancedWater.instanceMatrix.needsUpdate = true;
                } else if (obj.instanceType === 'ore') {
                    this.instancedStones.setMatrixAt(obj.stoneId, zeroMatrix);
                    this.instancedStones.instanceMatrix.needsUpdate = true;
                    
                    if (obj.chunkType && this.instancedChunks[obj.chunkType]) {
                        const imesh = this.instancedChunks[obj.chunkType];
                        for (const cid of obj.chunkIds) {
                            imesh.setMatrixAt(cid, zeroMatrix);
                        }
                        imesh.instanceMatrix.needsUpdate = true;
                    }
                }
            } else if (obj.mesh && obj.mesh.parent) {
                obj.mesh.parent.remove(obj.mesh);
            }
            this.worldRegistry.delete(key);
        }
    }

    update(camera, deltaTime) {
        // No-op for static map, removed uTime to fix crash
    }
}
