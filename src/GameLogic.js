import { RESOURCES, CRAFTED_ITEMS, BUILDING_DEFINITIONS } from './Config.js';

export class GameLogic {
    constructor() {
        this.inventory = {
            confiscatedPhones: 1000,
            iron: 0, copper: 0, coal: 0, gold: 0, water: 0, poop: 0,
            ironIngot: 0, copperIngot: 0, ironRod: 0, ironPlate: 0, copperWire: 0, frame: 0, panel: 0
        };

        // Quests
        this.currentQuest = 1;

        // Recipes dictionary from Config
        this.recipes = CRAFTED_ITEMS;
        
        // Exchange rates for Leigh High from Config
        this.phoneExchangeRates = {};
        for (const [k, v] of Object.entries(RESOURCES)) this.phoneExchangeRates[k] = v.exchangeRate;
        for (const [k, v] of Object.entries(CRAFTED_ITEMS)) this.phoneExchangeRates[k] = v.exchangeRate;

        // Base rates from Config
        this.baseRates = {};
        for (const [k, v] of Object.entries(RESOURCES)) this.baseRates[k] = v.baseRate;
        
        this.otherBuildings = BUILDING_DEFINITIONS.map(b => ({ ...b }));
        
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
            ironRod: 0, ironPlate: 0, copperWire: 0,
            wire: 0, gears: 0, circuitBoard: 0,
            frame: 0, panel: 0, chassis: 0, computer: 0,
            confiscatedPhones: 150
        };
        this.currentQuest = 1;
        this.otherBuildings = BUILDING_DEFINITIONS.map(b => ({ ...b }));
        this.buildings = [];
        this.drones = [];
        this.brokenTrees = [];
    }

    setQuestLevel(questLevel) {
        this.currentQuest = Math.max(1, questLevel || 1);
        const constructorBld = this.otherBuildings.find(b => b.id === 'constructor');
        const bigConstructorBld = this.otherBuildings.find(b => b.id === 'bigConstructor');
        if (constructorBld) constructorBld.unlocked = this.currentQuest >= 2;
        if (bigConstructorBld) bigConstructorBld.unlocked = this.currentQuest >= 3;
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
            isWorking: false, progress: 0, isEnabled: true
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

    getDistSq(b1, b2) {
        const dx = b1.x - b2.x;
        const dz = b1.z - b2.z;
        return dx * dx + dz * dz;
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
            if (b.isEnabled === false) {
                b.isWorking = false;
                continue;
            }
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
            if (b.isEnabled === false) {
                b.isWorking = false;
                continue;
            }
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
            if (b.isEnabled === false) continue;
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
            
            for (let bi = 0; bi < this.buildings.length; bi++) {
                const b = this.buildings[bi];
                if (b.isEnabled === false) continue;
                
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
                        let bestDistSq = Infinity;
                        let maxAccepted = 0;
                        
                        // 1. Check Machines & School
                        for (let tbi = 0; tbi < this.buildings.length; tbi++) {
                            const tb = this.buildings[tbi];
                            if (tb === b || tb.isEnabled === false) continue;
                            const distSq = this.getDistSq(b, tb);
                            
                            // Machine
                            if (tb.activeRecipe && tb.type !== 'school' && tb.type !== 'storage') {
                                if (this.recipes[tb.activeRecipe] && this.recipes[tb.activeRecipe].inputs[item]) {
                                    const space = 50 - ((tb.inputBuffer[item] || 0) + (tb.inboundCount[item] || 0));
                                    if (space > 0 && distSq < bestDistSq) {
                                        bestDistSq = distSq;
                                        bestTarget = tb;
                                        maxAccepted = space;
                                    }
                                }
                            }
                            // School
                            else if (tb.type === 'school' && tb.burnQueue) {
                                let needed = 0;
                                for (const q of tb.burnQueue) if (q.itemKey === item) needed += q.amount;
                                const incoming = (tb.inputBuffer[item] || 0) + (tb.inboundCount[item] || 0);
                                const space = needed - incoming;
                                if (space > 0 && distSq < bestDistSq) {
                                    bestDistSq = distSq;
                                    bestTarget = tb;
                                    maxAccepted = space;
                                }
                            }
                        }
                        
                        // 2. Storage fallback
                        if (!bestTarget && b.type !== 'storage') {
                            for (let tbi = 0; tbi < this.buildings.length; tbi++) {
                                const tb = this.buildings[tbi];
                                if (tb === b || tb.type !== 'storage' || tb.isEnabled === false) continue;
                                if (tb.storageFilter === item) {
                                    const space = 2048 - ((tb.inventoryCount || 0) + (tb.inboundCount[item] || 0));
                                    if (space > 0) {
                                        const distSq = this.getDistSq(b, tb);
                                        if (distSq < bestDistSq) {
                                            bestDistSq = distSq;
                                            bestTarget = tb;
                                            maxAccepted = space;
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (bestTarget && maxAccepted > 0) {
                            const batchCount = Math.min(amountToSend, maxAccepted);
                            amountToSend -= batchCount;
                            
                            if (b.type === 'storage') b.inventoryCount -= batchCount;
                            else b.outputBuffer[item] -= batchCount;
                            
                            bestTarget.inboundCount[item] = (bestTarget.inboundCount[item] || 0) + batchCount;
                            
                            const realDist = Math.sqrt(bestDistSq);
                            for (let d = 0; d < batchCount; d++) {
                                this.drones.push({
                                    sourceUuid: b.uuid,
                                    targetUuid: bestTarget.uuid,
                                    sourceX: b.x,
                                    sourceZ: b.z,
                                    itemKey: item,
                                    progress: 0,
                                    tripDist: realDist
                                });
                            }
                        } else {
                            break;
                        }
                    }
                }
            }
            
            this.computeGlobalInventory();
        }

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
