import type { Recipe, ResourceItem } from './types';

export const ITEMS: Record<string, ResourceItem> = Object.fromEntries(([
  { id: 'walking_cane', name: 'Willow cane', description: 'A kindly walking stick. A sharp swing persuades an Aristobat to keep its distance.', kind: 'tool', color: '#bfa67a', icon: 'cane' },
  { id: 'willow_axe', name: 'Willow axe', description: 'Cuts timber, brush, and curly willow. Aim at a tree and swing.', kind: 'tool', color: '#8fb8a1', icon: 'axe' },
  { id: 'stone_pick', name: 'Stone pick', description: 'Breaks boulders and ore. Sometimes a stone is keeping a small amount of time.', kind: 'tool', color: '#a7b3bc', icon: 'pick' },
  { id: 'fishing_rod', name: 'Fishing rod', description: 'Cast toward water. When the float dips, press the action button to reel in.', kind: 'tool', color: '#d9c285', icon: 'rod' },
  { id: 'lantern', name: 'Pocket lantern', description: 'Places a warm light in the world. Lanterns make the dark seem less official.', kind: 'placeable', color: '#f3d28b', icon: 'lantern' },
  { id: 'soup', name: 'Shanty soup', description: 'Restores 38 health and all stamina. Simmer fish and herbs at a campfire.', kind: 'food', color: '#e3af79', icon: 'soup' },
  { id: 'time_coupon', name: 'Borrowed-time coupon', description: 'Her face blows a kiss, then dissolves. Adds three minutes of borrowed time.', kind: 'time', color: '#e7cd86', icon: 'coupon' },
  { id: 'sapling', name: 'Willow sapling', description: 'Plant it on grass. A small piece of tomorrow, rooting itself in today.', kind: 'placeable', color: '#92b678', icon: 'sapling' },
  { id: 'campfire', name: 'Campfire', description: 'Place a campfire to cook. Rest beside it to regain your breath.', kind: 'placeable', color: '#eead64', icon: 'campfire' },
  { id: 'bench', name: 'Common bench', description: 'Build somewhere to sit. There is no permit for being tired.', kind: 'placeable', color: '#bfa076', icon: 'bench' },
  { id: 'workbench', name: 'Work table', description: 'A portable place to make more complicated things.', kind: 'placeable', color: '#c6a47a', icon: 'workbench' },
  { id: 'wood', name: 'Timber', description: 'Wood from trees and discarded crates. The grain still remembers the wind.', kind: 'resource', color: '#aa7957', icon: 'wood' },
  { id: 'stone', name: 'Stone', description: 'Useful for tools, hearths, and very small monuments.', kind: 'resource', color: '#b6b6ad', icon: 'stone' },
  { id: 'ore', name: 'Quiet iron', description: 'Iron mined from seams that refuse to make a fuss.', kind: 'resource', color: '#afb6c0', icon: 'ore' },
  { id: 'herb', name: 'Pillowwort', description: 'A fragrant herb for soup and restorative tea.', kind: 'resource', color: '#9aba82', icon: 'herb' },
  { id: 'fish', name: 'Tasteful fish', description: 'Small, respectable, and insufficiently informed about permits.', kind: 'resource', color: '#83bec2', icon: 'fish' },
  { id: 'willow_fibre', name: 'Curly willow fibre', description: 'Curling fibres that hold their shape. Lady Supine is extraordinarily fond of them.', kind: 'resource', color: '#acb986', icon: 'willow' },
  { id: 'timeglass', name: 'Timeglass', description: 'A bright grain left by an Aristobat. Borrowed time, before the face is stamped on it.', kind: 'resource', color: '#dcc8ee', icon: 'timeglass' },
  { id: 'tea', name: 'Pillowwort tea', description: 'Restores 20 health and all stamina. A modest little luxury.', kind: 'food', color: '#c1c88c', icon: 'tea' },
  { id: 'carrot', name: 'Appropriate carrot', description: 'Restores 12 health. A vegetable of officially acceptable ambitions.', kind: 'food', color: '#e7a56a', icon: 'carrot' },
] satisfies ResourceItem[]).map((item) => [item.id, item]));

export const ITEM_DEFS = ITEMS;

export const RECIPES: Recipe[] = [
  { id: 'make_campfire', name: 'A common fire', description: 'A warm hearth, shared freely.', ingredients: { wood: 4, stone: 3 }, result: 'campfire', amount: 1 },
  { id: 'make_lantern', name: 'Pocket lantern', description: 'A light for the late hours.', ingredients: { wood: 2, ore: 1 }, result: 'lantern', amount: 1 },
  { id: 'make_bench', name: 'Common bench', description: 'Give a tired person somewhere to sit.', ingredients: { wood: 5, stone: 1 }, result: 'bench', amount: 1 },
  { id: 'make_workbench', name: 'Work table', description: 'A place where your hands can think.', ingredients: { wood: 8, stone: 4 }, result: 'workbench', amount: 1 },
  { id: 'make_sapling', name: 'Willow sapling', description: 'Propagate a piece of curly willow.', ingredients: { willow_fibre: 2, herb: 1 }, result: 'sapling', amount: 1 },
  { id: 'make_soup', name: 'Shanty soup', description: 'Fish, herbs, and a freely given minute of care.', ingredients: { fish: 1, herb: 2 }, result: 'soup', amount: 1, station: 'campfire' },
  { id: 'make_tea', name: 'Pillowwort tea', description: 'A restorative cup beside the fire.', ingredients: { herb: 3 }, result: 'tea', amount: 1, station: 'campfire' },
  { id: 'make_coupon', name: 'Unstamped tomorrow', description: 'Condense three minutes of time. Her face is unnecessary.', ingredients: { timeglass: 3, willow_fibre: 1 }, result: 'time_coupon', amount: 1, station: 'workbench' },
];
