export class GameLogic {
    constructor() {
        this.inventory = {
            confiscatedPhones: 1000, // starting funds
            iron: 0, copper: 0, coal: 0, gold: 0, water: 0, poop: 0,
            ironIngot: 0, copperIngot: 0, ironRod: 0, ironPlate: 0, copperWire: 0, frame: 0, panel: 0
        };

        // Quests
        this.currentQuest = 1;

        // Recipes dictionary
        this.recipes = {
            'ironIngot': { name: 'Iron Ingot', machine: 'smelter', inputs: { iron: 1 }, outputs: { ironIngot: 1 }, time: 1 },
            'copperIngot': { name: 'Copper Ingot', machine: 'smelter', inputs: { copper: 1 }, outputs: { copperIngot: 1 }, time: 1 },
            
            'ironPlate': { name: 'Iron Plate', machine: 'constructor', inputs: { ironIngot: 2 }, outputs: { ironPlate: 1 }, time: 2 },
            'ironRod': { name: 'Iron Rod', machine: 'constructor', inputs: { ironIngot: 1 }, outputs: { ironRod: 1 }, time: 1.5 },
            'copperWire': { name: 'Copper Wire', machine: 'constructor', inputs: { copperIngot: 1 }, outputs: { copperWire: 2 }, time: 1 },
            'frame': { name: 'Frame', machine: 'constructor', inputs: { ironRod: 4 }, outputs: { frame: 1 }, time: 3 },
            'panel': { name: 'Panel', machine: 'bigConstructor', inputs: { frame: 1, ironPlate: 2 }, outputs: { panel: 1 }, time: 5 }
        };
        
        // Exchange rates for Leigh High
        this.phoneExchangeRates = {
            'iron': 0.01, 'copper': 0.01, 'coal': 0.02, 'gold': 0.05, 'water': 0.01, 'poop': 0.05,
            'ironIngot': 0.02, 'copperIngot': 0.02, 'ironPlate': 0.1, 'ironRod': 0.05, 'copperWire': 0.02,
            'frame': 0.5, 'panel': 2.0
        };

        // Data Definitions for UI and Logic
        this.baseRates = { iron: 1, copper: 1, coal: 2, gold: 0.5, water: 5, poop: 1 };
        
        this.otherBuildings = [
            { id: 'miner', name: 'Miner', cost: 15, unlocked: true, size: '1×1', desc: 'Extracts resources from a node' },
            { id: 'smelter', name: 'Smelter', cost: 50, unlocked: true, size: '2×1', desc: 'Forges raw ore into refined ingots' },
            { id: 'constructor', name: 'Constructor', cost: 150, unlocked: false, size: '2×1', desc: 'Shapes and assembles a single material' },
            { id: 'bigConstructor', name: 'Big Constructor', cost: 500, unlocked: false, size: '2×2', desc: 'Heavy-duty fabricator' },
            { id: 'school', name: 'Leigh High', cost: 200, unlocked: true, size: '1×1', desc: 'Where phones go to be confiscated' },
            { id: 'storage', name: 'Storage Box', cost: 20, unlocked: true, size: '1×2', desc: 'Stores up to 2048 of a single item' }
        ];
        
        this.buildings = []; 
        this.drones = [];
        this.brokenTrees = [];
        this.droneSpeed = 8; // units per second
        this.onBurnComplete = null;
    }

    reset() {
        this.inventory = {
            iron: 0, copper: 0, coal: 0, gold: 0,
            water: 0, poop: 0, 
            ironIngot: 0, copperIngot: 0, goldIngot: 0,
            wire: 0, gears: 0, circuitBoard: 0,
            frame: 0, chassis: 0, computer: 0,
            confiscatedPhones: 150
        };
        this.buildings = [];
        this.drones = [];
        this.brokenTrees = [];
    }

    canAfford(toolId) {
        const bld = this.otherBuildings.find(b => b.id === toolId);
        if (!bld) return false;
        return this.inventory.confiscatedPhones >= bld.cost;
    }

    purchaseBuilding(toolId) {
        const bld = this.otherBuildings.find(b => b.id === toolId);
        if (bld && this.inventory.confiscatedPhones >= bld.cost) {
            this.inventory.confiscatedPhones -= bld.cost;
            return true;
        }
        return false;
    }
    
    getBuildingCost(toolId) {
        const bld = this.otherBuildings.find(b => b.id === toolId);
        return bld ? bld.cost : 0;
    }
    
    removeBuilding(uuid) {
        const index = this.buildings.findIndex(b => b.uuid === uuid);
        if (index !== -1) {
            const bld = this.buildings[index];
            this.buildings.splice(index, 1);
            return bld;
        }
        return null;
    }
    
    startBurn(buildingUuid, itemKey, amount, multiplier) {
        const bld = this.buildings.find(b => b.uuid === buildingUuid);
        if (!bld || bld.type !== 'school') return false;
        
        if (bld.burnQueue && bld.burnQueue.length >= 10) return false;
        
        const rate = this.phoneExchangeRates[itemKey] || 0;
        let baseTime = Math.max(1, Math.min(5, rate * 25));
        
        bld.burnQueue.push({ itemKey, amount, baseTime, received: 0 });
        return true;
    }

    cancelBurn(buildingUuid, queueIndex) {
        const bld = this.buildings.find(b => b.uuid === buildingUuid);
        if (!bld || bld.type !== 'school' || !bld.burnQueue) return false;
        
        if (queueIndex >= 0 && queueIndex < bld.burnQueue.length) {
            const q = bld.burnQueue[queueIndex];
            if (q.received > 0) {
                bld.inputBuffer[q.itemKey] = (bld.inputBuffer[q.itemKey] || 0) + q.received;
            }
            bld.burnQueue.splice(queueIndex, 1);
            return true;
        }
        return false;
    }
    
    collectPhones(buildingUuid, qty = null) {
        const bld = this.buildings.find(b => b.uuid === buildingUuid);
        if (!bld || bld.type !== 'school') return 0;
        
        let amount = bld.uncollectedPhones || 0;
        if (qty !== null && qty < amount) amount = qty;
        
        if (amount > 0) {
            this.inventory.confiscatedPhones += amount;
            bld.uncollectedPhones -= amount;
        }
        return amount;
    }

    addBuilding(toolId, gridX, gridZ, nodeLevel = 1, rotation = 0, nodeSubType = null, overrideUuid = null) {
        const uuid = overrideUuid || Math.random().toString(36).substr(2, 9);
        
        let bld = {
            uuid, id: toolId,
            x: gridX, z: gridZ, rotation,
            inputBuffer: {}, outputBuffer: {}, inboundCount: {},
            isWorking: false, progress: 0
        };
        
        if (toolId === 'miner' && nodeSubType) {
            bld.type = nodeSubType;
            const baseRate = this.baseRates[nodeSubType] || 1;
            bld.rate = baseRate * nodeLevel;
            bld.nodeLevel = nodeLevel;
            bld.cycleTime = 1 / bld.rate;
            bld.isExtractor = true;
        } else {
            const ob = this.otherBuildings.find(b => b.id === toolId);
            if (ob) {
                bld.type = ob.id;
                bld.isExtractor = false;
                bld.activeRecipe = null;
                if (bld.type === 'storage') {
                    bld.inventoryCount = 0;
                    bld.storageFilter = null;
                } else if (bld.type === 'school') {
                    bld.burnQueue = [];
                    bld.activeBurn = null;
                    bld.phoneFractions = 0;
                    bld.uncollectedPhones = 0;
                }
            }
        }
        
        if (bld.type) {
            this.buildings.push(bld);
            return uuid;
        }
        return null;
    }
    
    getDist(b1, b2) {
        return Math.sqrt((b1.x - b2.x) ** 2 + (b1.z - b2.z) ** 2);
    }

    update(deltaTime) {
        // Process Drones
        for (let i = this.drones.length - 1; i >= 0; i--) {
            const d = this.drones[i];
            d.progress += (deltaTime * this.droneSpeed);
            if (d.progress >= d.tripDist) {
                const target = this.buildings.find(b => b.uuid === d.targetUuid);
                if (target) {
                    target.inboundCount[d.itemKey] = Math.max(0, (target.inboundCount[d.itemKey] || 0) - 1);
                    if (target.type === 'storage') {
                        target.inventoryCount = (target.inventoryCount || 0) + 1;
                    } else if (target.type === 'school') {
                        const burn = target.burnQueue.find(q => q.itemKey === d.itemKey && q.received < q.amount);
                        if (burn) burn.received++;
                        else target.inputBuffer[d.itemKey] = (target.inputBuffer[d.itemKey] || 0) + 1;
                    } else {
                        target.inputBuffer[d.itemKey] = (target.inputBuffer[d.itemKey] || 0) + 1;
                    }
                }
                this.drones.splice(i, 1);
            }
        }

        // Process Extractors
        for (const b of this.buildings) {
            if (b.isExtractor) {
                const currentOut = b.outputBuffer[b.type] || 0;
                if (currentOut >= 50) {
                    b.isWorking = false;
                } else {
                    b.isWorking = true;
                    b.progress += deltaTime;
                    while (b.progress >= b.cycleTime) {
                        const outNow = b.outputBuffer[b.type] || 0;
                        if (outNow < 50) {
                            b.progress -= b.cycleTime;
                            b.outputBuffer[b.type] = outNow + 1;
                        } else {
                            b.progress = 0;
                            b.isWorking = false;
                            break;
                        }
                    }
                }
            }
        }
        
        // Process Machines
        for (const b of this.buildings) {
            if (!b.isExtractor && b.activeRecipe && b.type !== 'storage' && b.type !== 'school') {
                const recipe = this.recipes[b.activeRecipe];
                
                if (!b.isWorking) {
                    let canAfford = true;
                    for (const [key, val] of Object.entries(recipe.inputs)) {
                        if ((b.inputBuffer[key] || 0) < val) canAfford = false;
                    }
                    if (canAfford) {
                        let outputSpace = true;
                        for (const [key, val] of Object.entries(recipe.outputs)) {
                            if ((b.outputBuffer[key] || 0) + val > 50) outputSpace = false;
                        }
                        if (outputSpace) {
                            for (const [key, val] of Object.entries(recipe.inputs)) {
                                b.inputBuffer[key] -= val;
                            }
                            b.isWorking = true;
                            b.progress = 0;
                        }
                    }
                }
                
                if (b.isWorking) {
                    b.progress += deltaTime;
                    if (b.progress >= recipe.time) {
                        for (const [key, val] of Object.entries(recipe.outputs)) {
                            b.outputBuffer[key] = (b.outputBuffer[key] || 0) + val;
                        }
                        b.isWorking = false;
                        b.progress = 0;
                    }
                }
            }
        }

        // Process Leigh High
        for (const b of this.buildings) {
            if (b.type === 'school') {
                if (!b.activeBurn && b.burnQueue && b.burnQueue.length > 0) {
                    if (b.burnQueue[0].received > 0) {
                        const q = b.burnQueue[0];
                        q.received--;
                        q.amount--;
                        
                        const rate = this.phoneExchangeRates[q.itemKey] || 0;
                        const phonesEarned = rate;
                        
                        b.activeBurn = { itemKey: q.itemKey, amount: 1, phonesEarned: phonesEarned, duration: q.baseTime, progress: 0 };
                        
                        if (q.amount <= 0) b.burnQueue.shift();
                    }
                }
                if (b.activeBurn) {
                    b.activeBurn.progress += deltaTime;
                    if (b.activeBurn.progress >= b.activeBurn.duration) {
                        b.phoneFractions = (b.phoneFractions || 0) + b.activeBurn.phonesEarned;
                        let newlyEarned = 0;
                        while (b.phoneFractions >= 1) {
                            b.phoneFractions -= 1;
                            b.uncollectedPhones = (b.uncollectedPhones || 0) + 1;
                            newlyEarned++;
                        }
                        
                        b.activeBurn = null;
                        if (this.onBurnComplete && newlyEarned > 0) this.onBurnComplete(b.uuid, newlyEarned);
                    }
                }
            }
        }

        // Logistics Dispatch (10 Hz)
        this._droneTimer = (this._droneTimer || 0) + deltaTime;
        if (this._droneTimer > 0.1) {
            this._droneTimer = 0;
            for (const b of this.buildings) {
                let availableOutputs = {};
                if (b.type === 'storage' && b.inventoryCount > 0 && b.storageFilter) {
                    availableOutputs[b.storageFilter] = b.inventoryCount;
                } else {
                    for (const [k, v] of Object.entries(b.outputBuffer || {})) {
                        if (v > 0) availableOutputs[k] = v;
                    }
                }
                
                for (const item of Object.keys(availableOutputs)) {
                    let amountToSend = availableOutputs[item];
                    while (amountToSend > 0) {
                        let bestTarget = null;
                        let bestDist = Infinity;
                        
                        for (const tb of this.buildings) {
                            if (tb === b) continue;
                            const dist = this.getDist(b, tb);
                            
                            // 1. Machine
                            if (tb.activeRecipe && tb.type !== 'school' && tb.type !== 'storage') {
                                if (this.recipes[tb.activeRecipe].inputs[item]) {
                                    if ((tb.inputBuffer[item] || 0) + (tb.inboundCount[item] || 0) < 50) {
                                        if (dist < bestDist) { bestDist = dist; bestTarget = tb; }
                                    }
                                }
                            }
                            // 2. School
                            if (tb.type === 'school' && tb.burnQueue) {
                                let needed = 0;
                                for (const q of tb.burnQueue) if (q.itemKey === item) needed += q.amount;
                                let incoming = (tb.inputBuffer[item] || 0) + (tb.inboundCount[item] || 0);
                                if (incoming < needed) {
                                    if (dist < bestDist) { bestDist = dist; bestTarget = tb; }
                                }
                            }
                        }
                        
                        // 3. Storage (fallback)
                        if (!bestTarget && b.type !== 'storage') {
                            for (const tb of this.buildings) {
                                if (tb.type === 'storage' && tb !== b) {
                                    if (tb.storageFilter === item) {
                                        if ((tb.inventoryCount || 0) + (tb.inboundCount[item] || 0) < 2048) {
                                            const dist = this.getDist(b, tb);
                                            if (dist < bestDist) { bestDist = dist; bestTarget = tb; }
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (bestTarget) {
                            amountToSend--;
                            if (b.type === 'storage') b.inventoryCount--;
                            else b.outputBuffer[item]--;
                            
                            bestTarget.inboundCount[item] = (bestTarget.inboundCount[item] || 0) + 1;
                            
                            this.drones.push({
                                sourceUuid: b.uuid,
                                targetUuid: bestTarget.uuid,
                                sourceX: b.x,
                                sourceZ: b.z,
                                itemKey: item,
                                progress: 0,
                                tripDist: bestDist
                            });
                        } else {
                            break;
                        }
                    }
                }
            }
        }

        this.computeGlobalInventory();
        this.checkQuests();
    }
    
    computeGlobalInventory() {
        for (const k of Object.keys(this.inventory)) {
            if (k !== 'confiscatedPhones') this.inventory[k] = 0;
        }
        for (const b of this.buildings) {
            for (const [k, v] of Object.entries(b.inputBuffer || {})) this.inventory[k] = (this.inventory[k] || 0) + v;
            for (const [k, v] of Object.entries(b.outputBuffer || {})) this.inventory[k] = (this.inventory[k] || 0) + v;
            if (b.type === 'storage' && b.storageFilter) {
                this.inventory[b.storageFilter] = (this.inventory[b.storageFilter] || 0) + (b.inventoryCount || 0);
            }
        }
    }

    checkQuests() {
        // Quest completion is now manual via UI and rocket launch sequence
    }

    isCurrentQuestReady() {
        if (this.currentQuest === 1) {
            return this.inventory.ironIngot >= 100 && this.inventory.copperIngot >= 100;
        } else if (this.currentQuest === 2) {
            return this.inventory.ironPlate >= 25 && this.inventory.ironRod >= 25;
        } else if (this.currentQuest === 3) {
            return this.inventory.panel >= 15;
        }
        return false;
    }

    consumeQuestResources() {
        let requirements = {};
        if (this.currentQuest === 1) {
            requirements = { ironIngot: 100, copperIngot: 100 };
        } else if (this.currentQuest === 2) {
            requirements = { ironPlate: 25, ironRod: 25 };
        } else if (this.currentQuest === 3) {
            requirements = { panel: 15 };
        }

        let consumedLocations = [];

        for (const [item, needed] of Object.entries(requirements)) {
            let remaining = needed;

            for (const b of this.buildings) {
                if (remaining <= 0) break;

                let consumedHere = 0;

                if (b.type === 'storage' && b.storageFilter === item) {
                    if (b.inventoryCount > 0) {
                        const take = Math.min(remaining, b.inventoryCount);
                        b.inventoryCount -= take;
                        remaining -= take;
                        consumedHere += take;
                    }
                } else {
                    if (b.outputBuffer && b.outputBuffer[item] > 0) {
                        const take = Math.min(remaining, b.outputBuffer[item]);
                        b.outputBuffer[item] -= take;
                        remaining -= take;
                        consumedHere += take;
                    }
                    if (remaining > 0 && b.inputBuffer && b.inputBuffer[item] > 0) {
                        const take = Math.min(remaining, b.inputBuffer[item]);
                        b.inputBuffer[item] -= take;
                        remaining -= take;
                        consumedHere += take;
                    }
                }

                if (consumedHere > 0) {
                    consumedLocations.push({ x: b.x, z: b.z, uuid: b.uuid, item: item, amount: consumedHere });
                }
            }
        }

        this.computeGlobalInventory();
        return consumedLocations;
    }

    advanceQuest() {
        if (this.currentQuest === 1) {
            this.currentQuest = 2;
            this.otherBuildings.find(b => b.id === 'constructor').unlocked = true;
            if (this.soundEngine) this.soundEngine.play('fanfare');
        } else if (this.currentQuest === 2) {
            this.currentQuest = 3;
            this.otherBuildings.find(b => b.id === 'bigConstructor').unlocked = true;
            if (this.soundEngine) this.soundEngine.play('fanfare');
        } else if (this.currentQuest === 3) {
            this.currentQuest = 4;
            if (this.soundEngine) this.soundEngine.play('fanfare');
        }
    }
}
