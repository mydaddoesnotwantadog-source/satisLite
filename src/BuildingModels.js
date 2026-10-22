import * as THREE from 'three';
import { RESOURCES } from './Config.js';

// Shared cached materials to avoid re-allocation and shader re-compilation
const materials = {
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.4, flatShading: true }),
    porcelain: new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4 }),
    robotArm: new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.3 }),
    woodPlunger: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.8 }),
    redRubber: new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.5 }),
    pipeMetal: new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 }),
    waterDrop: new THREE.MeshBasicMaterial({ color: 0x00aaff }),
    pumpHandle: new THREE.MeshStandardMaterial({ color: 0x882222, metalness: 0.7, roughness: 0.3 }),
    smelterTop: new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff4400, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.2, flatShading: true }),
    smokestack: new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2, flatShading: true }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.8, roughness: 0.2, flatShading: true }),
    constructorHead: new THREE.MeshStandardMaterial({ color: 0x3498db, emissive: 0x3498db, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.2, flatShading: true }),
    constructorStripe: new THREE.MeshStandardMaterial({ color: 0x3498db, emissive: 0x3498db, emissiveIntensity: 1.0 }),
    rotaryMount: new THREE.MeshStandardMaterial({ color: 0x34495e, metalness: 0.8, roughness: 0.2, flatShading: true }),
    rotarySpinner: new THREE.MeshStandardMaterial({ color: 0x9b59b6, emissive: 0x9b59b6, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.2, flatShading: true }),
    schoolRoof: new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.2, roughness: 0.8, flatShading: true }),
    storageTop: new THREE.MeshStandardMaterial({ color: 0x34495e, metalness: 0.8, roughness: 0.2, flatShading: true }),
    storagePort: new THREE.MeshStandardMaterial({ color: 0x95a5a6, emissive: 0x00ff88, emissiveIntensity: 0.2, metalness: 0.8, roughness: 0.2, flatShading: true }),
    poleMat: new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.2 })
};

// Cached drill materials by node color
const drillMaterials = {};
function getDrillMaterial(colorHex) {
    if (!drillMaterials[colorHex]) {
        drillMaterials[colorHex] = new THREE.MeshStandardMaterial({ 
            color: colorHex, metalness: 0.8, roughness: 0.2, flatShading: true 
        });
    }
    return drillMaterials[colorHex];
}

// Reusable geometries
const geometries = {
    minerBase: new THREE.BoxGeometry(0.6, 0.4, 0.6),
    toiletBowl: new THREE.CylinderGeometry(0.25, 0.2, 0.3, 8),
    toiletTank: new THREE.BoxGeometry(0.5, 0.4, 0.2),
    armBase: new THREE.BoxGeometry(0.1, 0.5, 0.1),
    stick: new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8),
    cup: new THREE.CylinderGeometry(0.05, 0.15, 0.15, 8),
    connector: new THREE.BoxGeometry(0.05, 0.05, 0.3),
    pumpPipe: new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8),
    pumpSpout: new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8),
    drop: new THREE.ConeGeometry(0.04, 0.1, 8),
    pumpHandle: new THREE.BoxGeometry(0.05, 0.05, 0.6),
    drillStep1: new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8),
    drillStep2: new THREE.CylinderGeometry(0.15, 0.15, 0.3, 8),
    drillStep3: new THREE.ConeGeometry(0.1, 0.3, 8),
    smelterTop: new THREE.BoxGeometry(0.6, 0.2, 0.6),
    smokestack: new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6),
    pillar: new THREE.BoxGeometry(0.2, 0.8, 0.4),
    constructorHead: new THREE.BoxGeometry(1.0, 0.2, 0.4),
    constructorStripe: new THREE.BoxGeometry(1.8, 0.05, 0.82),
    rotaryMount: new THREE.BoxGeometry(0.8, 0.4, 0.8),
    rotarySpinner: new THREE.TorusGeometry(0.6, 0.15, 8, 16),
    schoolTop: new THREE.BoxGeometry(0.8, 0.4, 0.8),
    storageTop: new THREE.BoxGeometry(0.8, 0.2, 1.8),
    storagePort: new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8),
    pole: new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8),
    light: new THREE.SphereGeometry(0.06, 8, 8)
};

export function buildBuildingVisuals(buildingMesh, toolId, nodeSubType) {
    if (toolId === 'miner' && nodeSubType) {
        buildMinerVisuals(buildingMesh, nodeSubType);
    } else if (toolId === 'smelter') {
        buildSmelterVisuals(buildingMesh);
    } else if (toolId === 'constructor') {
        buildConstructorVisuals(buildingMesh);
    } else if (toolId === 'bigConstructor') {
        buildBigConstructorVisuals(buildingMesh);
    } else if (toolId === 'school') {
        buildSchoolVisuals(buildingMesh);
    } else if (toolId === 'storage') {
        buildStorageVisuals(buildingMesh);
    }
    
    // Attach power light indicator
    addPowerLight(buildingMesh);
}

function buildMinerVisuals(buildingMesh, nodeSubType) {
    const resData = RESOURCES[nodeSubType];
    const iconColor = resData ? parseInt(resData.hex.replace('#', '0x')) : 0xcccccc;
    
    if (nodeSubType === 'poop') {
        const extMesh = new THREE.Group();
        
        const bowl = new THREE.Mesh(geometries.toiletBowl, materials.porcelain);
        bowl.position.set(0, 0.15, 0.1);
        bowl.castShadow = true;
        buildingMesh.add(bowl);
        
        buildingMesh.material.visible = false;
        
        const tank = new THREE.Mesh(geometries.toiletTank, materials.porcelain);
        tank.position.set(0, 0.35, -0.2);
        tank.castShadow = true;
        buildingMesh.add(tank);
        
        const armBase = new THREE.Mesh(geometries.armBase, materials.robotArm);
        armBase.position.set(0, 0.8, -0.2);
        armBase.castShadow = true;
        buildingMesh.add(armBase);
        
        const stick = new THREE.Mesh(geometries.stick, materials.woodPlunger);
        stick.position.set(0, 0.3, 0.1);
        stick.castShadow = true;
        extMesh.add(stick);
        
        const cup = new THREE.Mesh(geometries.cup, materials.redRubber);
        cup.position.set(0, 0, 0.1);
        cup.castShadow = true;
        extMesh.add(cup);
        
        const conn = new THREE.Mesh(geometries.connector, materials.robotArm);
        conn.position.set(0, 0.6, -0.05);
        conn.castShadow = true;
        extMesh.add(conn);
        
        extMesh.position.y = 0;
        buildingMesh.userData.isPlunger = true;
        buildingMesh.add(extMesh);
        buildingMesh.userData.extMesh = extMesh;
    } else if (nodeSubType === 'water') {
        const extMesh = new THREE.Group();
        
        const pipe = new THREE.Mesh(geometries.pumpPipe, materials.pipeMetal);
        pipe.position.y = 0.4;
        buildingMesh.add(pipe);
        
        const spout = new THREE.Mesh(geometries.pumpSpout, materials.pipeMetal);
        spout.rotation.x = Math.PI / 2;
        spout.position.set(0, 0.5, 0.25);
        buildingMesh.add(spout);
        
        const drop = new THREE.Mesh(geometries.drop, materials.waterDrop);
        drop.position.set(0.15, 0.5, 0);
        drop.rotation.z = -Math.PI / 2;
        buildingMesh.add(drop);
        
        const handle = new THREE.Mesh(geometries.pumpHandle, materials.pumpHandle);
        handle.position.set(0, 0, -0.25);
        extMesh.add(handle);
        
        extMesh.position.set(0, 0.8, 0);
        buildingMesh.userData.isPump = true;
        buildingMesh.add(extMesh);
        buildingMesh.userData.extMesh = extMesh;
    } else {
        const topMesh = new THREE.Mesh(geometries.minerBase, materials.darkMetal);
        topMesh.position.y = 0.2;
        buildingMesh.add(topMesh);
        
        const extMesh = new THREE.Group();
        const drillMat = getDrillMaterial(iconColor);
        
        const m1 = new THREE.Mesh(geometries.drillStep1, drillMat);
        m1.position.y = 0.65;
        extMesh.add(m1);
        
        const m2 = new THREE.Mesh(geometries.drillStep2, drillMat);
        m2.position.y = 0.35;
        extMesh.add(m2);
        
        const m3 = new THREE.Mesh(geometries.drillStep3, drillMat);
        m3.position.y = 0.05;
        m3.rotation.x = Math.PI;
        extMesh.add(m3);
        
        extMesh.position.y = 0.2;
        buildingMesh.userData.isDrill = true;
        buildingMesh.add(extMesh);
        buildingMesh.userData.extMesh = extMesh;
    }
    
    buildingMesh.userData.nodeType = nodeSubType;
    buildingMesh.userData.extractColor = iconColor;
}

function buildSmelterVisuals(buildingMesh) {
    const topMesh = new THREE.Mesh(geometries.smelterTop, materials.smelterTop);
    topMesh.position.y = 0.4;
    buildingMesh.add(topMesh);
    
    const stack = new THREE.Mesh(geometries.smokestack, materials.smokestack);
    stack.position.set(0.35, 0.75, 0.0);
    buildingMesh.add(stack);
    buildingMesh.userData.stackOffset = new THREE.Vector3(0.35, 1.0, 0.0);
}

function buildConstructorVisuals(buildingMesh) {
    const leftPillar = new THREE.Mesh(geometries.pillar, materials.pillar);
    leftPillar.position.set(-0.6, 0.6, 0);
    const rightPillar = new THREE.Mesh(geometries.pillar, materials.pillar);
    rightPillar.position.set(0.6, 0.6, 0);
    buildingMesh.add(leftPillar);
    buildingMesh.add(rightPillar);
    
    const pressHead = new THREE.Mesh(geometries.constructorHead, materials.constructorHead);
    pressHead.position.set(0, 0.8, 0);
    pressHead.userData.isPress = true;
    buildingMesh.add(pressHead);
    
    const stripe = new THREE.Mesh(geometries.constructorStripe, materials.constructorStripe);
    stripe.position.set(0, 0.1, 0);
    buildingMesh.add(stripe);
}

function buildBigConstructorVisuals(buildingMesh) {
    const mount = new THREE.Mesh(geometries.rotaryMount, materials.rotaryMount);
    mount.position.set(0, 0.4, 0);
    buildingMesh.add(mount);
    
    const spinner = new THREE.Mesh(geometries.rotarySpinner, materials.rotarySpinner);
    spinner.position.set(0, 0.8, 0);
    spinner.rotation.x = Math.PI / 2;
    spinner.userData.isSpinner = true;
    buildingMesh.add(spinner);
}

function buildSchoolVisuals(buildingMesh) {
    const topMesh = new THREE.Mesh(geometries.schoolTop, materials.schoolRoof);
    topMesh.position.y = 0.5;
    buildingMesh.add(topMesh);
}

function buildStorageVisuals(buildingMesh) {
    const topMesh = new THREE.Mesh(geometries.storageTop, materials.storageTop);
    topMesh.position.y = 0.4;
    buildingMesh.add(topMesh);
    
    const portMesh = new THREE.Mesh(geometries.storagePort, materials.storagePort);
    portMesh.position.y = 0.55;
    buildingMesh.add(portMesh);
}

function addPowerLight(buildingMesh) {
    const stickLightGroup = new THREE.Group();
    const poleMesh = new THREE.Mesh(geometries.pole, materials.poleMat);
    poleMesh.position.y = 0.2;
    stickLightGroup.add(poleMesh);
    
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 1.0 });
    const lightMesh = new THREE.Mesh(geometries.light, lightMat);
    lightMesh.position.y = 0.4;
    stickLightGroup.add(lightMesh);
    
    stickLightGroup.position.set(0.35, 0.3, 0.35);
    buildingMesh.add(stickLightGroup);
    buildingMesh.userData.powerLightMat = lightMat;
}
