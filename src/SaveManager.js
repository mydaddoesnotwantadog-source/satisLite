export class SaveManager {
    constructor(gameLogic, gridSystem) {
        this.gameLogic = gameLogic;
        this.gridSystem = gridSystem;
        this.saveKey = 'satislite_save';
    }

    hasSave() {
        return localStorage.getItem(this.saveKey) !== null;
    }

    saveGame(mapSize, difficulty) {
        try {
            const data = {
                mapSize,
                difficulty,
                inventory: this.gameLogic.inventory,
                timestamp: Date.now(),
                buildings: this.gameLogic.buildings.map(b => ({
                    uuid: b.uuid,
                    id: b.id,
                    type: b.type,
                    x: b.x,
                    z: b.z,
                    rotation: b.rotation,
                    nodeLevel: b.nodeLevel || 1,
                    activeRecipe: b.activeRecipe,
                    inputBuffer: b.inputBuffer,
                    outputBuffer: b.outputBuffer,
                    progress: b.progress,
                    storageFilter: b.storageFilter,
                    inventoryCount: b.inventoryCount,
                    activeBurn: b.activeBurn,
                    burnProgress: b.burnProgress,
                    burnDuration: b.burnDuration
                })),
                drones: this.gameLogic.drones.map(d => ({
                    sourceUuid: d.sourceUuid,
                    targetUuid: d.targetUuid,
                    itemKey: d.itemKey,
                    progress: d.progress,
                    tripDist: d.tripDist
                })),
                brokenTrees: this.gameLogic.brokenTrees || []
            };
            localStorage.setItem(this.saveKey, JSON.stringify(data));
            console.log("Game saved successfully!");
        } catch (e) {
            console.error("Failed to save game:", e);
        }
    }

    loadGame(placementSystem, onComplete = null) {
        try {
            const json = localStorage.getItem(this.saveKey);
            if (!json) {
                if (onComplete) onComplete();
                return null;
            }
            
            const data = JSON.parse(json);
            
            // Restore inventory immediately
            this.gameLogic.inventory = data.inventory;
            this.gameLogic.brokenTrees = data.brokenTrees || [];
            
            // First, animate breaking the trees that were cleared by the player
            let treeIndex = 0;
            const treesToBreak = this.gameLogic.brokenTrees;
            
            const loadNextTree = () => {
                if (treeIndex >= treesToBreak.length) {
                    loadNextBuilding();
                    return;
                }
                const tData = treesToBreak[treeIndex];
                const occupant = placementSystem.gridSystem.getOccupantAt(tData.x, tData.z);
                if (occupant && occupant.type === 'tree') {
                    placementSystem.gridSystem.removeObjectAt(tData.x, tData.z);
                    // We need THREE to compute position. Let's assume placementSystem has gridSystem.tileSize.
                    // Instead of full THREE import, we can rely on fxSystem having what it needs.
                    // Wait, fxSystem.spawnTreeDestruction just takes x,y,z
                    const ts = placementSystem.gridSystem.tileSize;
                    if (placementSystem.fxSystem) placementSystem.fxSystem.spawnTreeDestruction((tData.x + 0.5) * ts, 0, (tData.z + 0.5) * ts);
                    if (this.gameLogic.soundEngine) this.gameLogic.soundEngine.play('destroy');
                }
                treeIndex++;
                setTimeout(loadNextTree, 50); // fast!
            };
            
            // Pop in buildings one by one for an engaging effect
            let bldIndex = 0;
            const loadNextBuilding = () => {
                if (bldIndex >= data.buildings.length) {
                    // Restore drones after all buildings are placed
                    this.gameLogic.drones = (data.drones || [])
                        .filter(d => d.sourceUuid && d.targetUuid)
                        .map(d => ({
                            ...d,
                            progress: d.progress || 0,
                            itemKey: d.itemKey || 'iron'
                        }));
                    if (onComplete) onComplete();
                    return;
                }
                
                const bData = data.buildings[bldIndex];
                
                // Determine node sub-type if it's an extractor
                let nodeSubType = null;
                if (bData.id === 'miner') {
                    nodeSubType = bData.type;
                }

                // Place it physically
                placementSystem.forcePlaceBuilding(bData.id, bData.x, bData.z, bData.rotation, bData.nodeLevel || 1, nodeSubType, bData.uuid);
                
                // The newly placed building should be the last one in gameLogic.buildings
                const newBld = this.gameLogic.buildings[this.gameLogic.buildings.length - 1];
                if (newBld) {
                    newBld.id = bData.id;
                    newBld.rotation = bData.rotation;
                    newBld.activeRecipe = bData.activeRecipe;
                    newBld.inputBuffer = bData.inputBuffer || {};
                    newBld.outputBuffer = bData.outputBuffer || {};
                    newBld.progress = bData.progress || 0;
                    
                    if (bData.storageFilter !== undefined) newBld.storageFilter = bData.storageFilter;
                    if (bData.inventoryCount !== undefined) newBld.inventoryCount = bData.inventoryCount;
                    if (bData.activeBurn !== undefined) newBld.activeBurn = bData.activeBurn;
                    if (bData.burnProgress !== undefined) newBld.burnProgress = bData.burnProgress;
                    if (bData.burnDuration !== undefined) newBld.burnDuration = bData.burnDuration;
                    
                    // Update visual rotation if applicable (bData.rotation is already in radians!)
                    if (newBld.mesh) {
                        newBld.mesh.rotation.y = bData.rotation;
                    }
                }
                
                // Play placement sound and particles
                if (this.gameLogic.soundEngine) {
                    this.gameLogic.soundEngine.play('place');
                }
                
                bldIndex++;
                setTimeout(loadNextBuilding, 150);
            };
            
            // Start the sequence
            loadNextTree();
            console.log("Game loaded successfully!");
            
            return data;
        } catch (e) {
            console.error("Failed to load game:", e);
            return null;
        }
    }
    
    deleteSave() {
        localStorage.removeItem(this.saveKey);
    }
}
