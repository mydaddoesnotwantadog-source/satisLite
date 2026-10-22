// Centralized game configuration and constant definitions

export const RESOURCES = {
    iron: { name: 'Iron', type: 'iron', color: 0xBDC3C7, hex: '#ff3333', prob: 0.35, baseRate: 1, exchangeRate: 0.01 },
    copper: { name: 'Copper', type: 'copper', color: 0xE67E22, hex: '#3498db', prob: 0.35, baseRate: 1, exchangeRate: 0.01 },
    coal: { name: 'Coal', type: 'coal', color: 0x34495E, hex: '#333333', prob: 0.25, baseRate: 2, exchangeRate: 0.02 },
    gold: { name: 'Gold', type: 'gold', color: 0xFFD700, hex: '#f1c40f', prob: 0.05, baseRate: 0.5, exchangeRate: 0.05 },
    water: { name: 'Water', type: 'water', color: 0x1FB0E8, hex: '#2ecc71', prob: 0, baseRate: 5, exchangeRate: 0.01 },
    poop: { name: 'Biomass', type: 'poop', color: 0x9E6036, hex: '#8B4513', prob: 0.01, baseRate: 1, exchangeRate: 0.05 }
};

export const CRAFTED_ITEMS = {
    ironIngot: { name: 'Iron Ingot', machine: 'smelter', inputs: { iron: 1 }, outputs: { ironIngot: 1 }, time: 1, exchangeRate: 0.02 },
    copperIngot: { name: 'Copper Ingot', machine: 'smelter', inputs: { copper: 1 }, outputs: { copperIngot: 1 }, time: 1, exchangeRate: 0.02 },
    ironPlate: { name: 'Iron Plate', machine: 'constructor', inputs: { ironIngot: 2 }, outputs: { ironPlate: 1 }, time: 2, exchangeRate: 0.1 },
    ironRod: { name: 'Iron Rod', machine: 'constructor', inputs: { ironIngot: 1 }, outputs: { ironRod: 1 }, time: 1.5, exchangeRate: 0.05 },
    copperWire: { name: 'Copper Wire', machine: 'constructor', inputs: { copperIngot: 1 }, outputs: { copperWire: 2 }, time: 1, exchangeRate: 0.02 },
    frame: { name: 'Frame', machine: 'constructor', inputs: { ironRod: 4 }, outputs: { frame: 1 }, time: 3, exchangeRate: 0.5 },
    panel: { name: 'Panel', machine: 'bigConstructor', inputs: { frame: 1, ironPlate: 2 }, outputs: { panel: 1 }, time: 5, exchangeRate: 2.0 }
};

export const ALL_ITEM_KEYS = [
    'phones', 'iron', 'copper', 'coal', 'gold', 'water', 'poop',
    'ironIngot', 'copperIngot', 'ironPlate', 'ironRod', 'copperWire', 'frame', 'panel'
];

export const BUILDING_DEFINITIONS = [
    { id: 'miner', name: 'Miner', cost: 15, unlocked: true, size: '1×1', desc: 'Extracts resources from a node' },
    { id: 'smelter', name: 'Smelter', cost: 50, unlocked: true, size: '2×1', desc: 'Forges raw ore into refined ingots' },
    { id: 'constructor', name: 'Constructor', cost: 150, unlocked: false, size: '2×1', desc: 'Shapes and assembles a single material' },
    { id: 'bigConstructor', name: 'Big Constructor', cost: 500, unlocked: false, size: '2×2', desc: 'Heavy-duty fabricator' },
    { id: 'school', name: 'Leigh High', cost: 200, unlocked: true, size: '1×1', desc: 'Where phones go to be confiscated' },
    { id: 'storage', name: 'Storage Box', cost: 20, unlocked: true, size: '1×2', desc: 'Stores up to 2048 of a single item' }
];

export function getItemDisplayName(key) {
    if (RESOURCES[key]) return RESOURCES[key].name;
    if (CRAFTED_ITEMS[key]) return CRAFTED_ITEMS[key].name;
    if (key === 'phones' || key === 'confiscatedPhones') return 'Confiscated Phones';
    let name = key.replace(/([A-Z])/g, ' $1');
    return name.charAt(0).toUpperCase() + name.slice(1);
}

export function getItemColorHex(key) {
    if (RESOURCES[key]) return RESOURCES[key].hex;
    return '#ffffff';
}
