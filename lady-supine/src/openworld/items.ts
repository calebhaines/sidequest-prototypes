import type { Recipe, ResourceItem } from './types';

export const ITEMS: Record<string, ResourceItem> = Object.fromEntries(([
  { id: 'walking_cane', name: 'Willow cane', description: 'The grip has been wrapped in strips of an old coat. A sharp swing drives an Aristobat back.', kind: 'tool', color: '#a28766', icon: 'cane' },
  { id: 'willow_axe', name: 'Willow axe', description: 'A loose head wired to a replacement handle. Aim and swing to cut timber, brush, or curly willow.', kind: 'tool', color: '#757a78', icon: 'axe' },
  { id: 'stone_pick', name: 'Stone pick', description: 'Breaks boulders and ore. A little uncollected time sometimes survives inside the stone.', kind: 'tool', color: '#708a8c', icon: 'pick' },
  { id: 'fishing_rod', name: 'Fishing rod', description: 'Mended line on a bent rod. Cast toward water; press the action button when the float dips.', kind: 'tool', color: '#a28766', icon: 'rod' },
  { id: 'lantern', name: 'Pocket lantern', description: 'Places a weak light in the world. Its cracked glass has been joined with wire.', kind: 'placeable', color: '#c1ad87', icon: 'lantern' },
  { id: 'soup', name: 'Shanty soup', description: 'Fish stretched with herbs and water. Restores 38 health and all stamina. Cook at a campfire.', kind: 'food', color: '#a28766', icon: 'soup' },
  { id: 'time_coupon', name: 'Borrowed-time coupon', description: 'Supine’s printed face blows a kiss, then dissolves into you. Adds three minutes. It will not remember you afterward.', kind: 'time', color: '#9da59e', icon: 'coupon' },
  { id: 'sapling', name: 'Willow sapling', description: 'A cutting kept alive in a discarded tin. Plant on grass. Someone will have to stay to tend it.', kind: 'placeable', color: '#757a78', icon: 'sapling' },
  { id: 'campfire', name: 'Campfire', description: 'Place a fire of scraps to cook. Rest beside it to regain your breath before the road.', kind: 'placeable', color: '#a28766', icon: 'campfire' },
  { id: 'bench', name: 'Common bench', description: 'Boards and one stone foot. Somewhere to sit when standing has become too much.', kind: 'placeable', color: '#a28766', icon: 'bench' },
  { id: 'workbench', name: 'Work table', description: 'A salvaged surface on uneven legs. Required for more complicated repairs.', kind: 'placeable', color: '#a28766', icon: 'workbench' },
  { id: 'wood', name: 'Timber', description: 'Cut branches and dismantled crates. Check for nails before you put your weight on it.', kind: 'resource', color: '#78634a', icon: 'wood' },
  { id: 'stone', name: 'Stone', description: 'For tools, fire rings, and supporting a wall after its foundations have failed.', kind: 'resource', color: '#8e9b71', icon: 'stone' },
  { id: 'ore', name: 'Quiet iron', description: 'A little iron to join something broken. There is never enough to replace the whole thing.', kind: 'resource', color: '#708a8c', icon: 'ore' },
  { id: 'herb', name: 'Pillowwort', description: 'A bitter herb for soup or restorative tea. It grows where the ground has been disturbed.', kind: 'resource', color: '#757a78', icon: 'herb' },
  { id: 'fish', name: 'Tasteful fish', description: 'A small catch from a lake whose scarcity is officially appropriate. Enough to put in a thin soup.', kind: 'resource', color: '#708a8c', icon: 'fish' },
  { id: 'willow_fibre', name: 'Curly willow fibre', description: 'Curling strands that will not straighten. The Lady keeps what others use to bind their repairs.', kind: 'resource', color: '#757a78', icon: 'willow' },
  { id: 'timeglass', name: 'Timeglass', description: 'Grains recovered from an Aristobat. Somebody’s minutes before the Lady’s face is stamped onto them.', kind: 'resource', color: '#9da59e', icon: 'timeglass' },
  { id: 'tea', name: 'Pillowwort tea', description: 'A bitter cup that can be made to last. Restores 20 health and all stamina.', kind: 'food', color: '#8e9b71', icon: 'tea' },
  { id: 'carrot', name: 'Appropriate carrot', description: 'One vegetable of the authorised size. Restores 12 health; keep the peel if you need more.', kind: 'food', color: '#a28766', icon: 'carrot' },
] satisfies ResourceItem[]).map((item) => [item.id, item]));

export const ITEM_DEFS = ITEMS;

export const RECIPES: Recipe[] = [
  { id: 'make_campfire', name: 'A common fire', description: 'Gather the scraps somewhere the wind cannot reach.', ingredients: { wood: 4, stone: 3 }, result: 'campfire', amount: 1 },
  { id: 'make_lantern', name: 'Pocket lantern', description: 'Wire a little light into something you can carry.', ingredients: { wood: 2, ore: 1 }, result: 'lantern', amount: 1 },
  { id: 'make_bench', name: 'Common bench', description: 'Use what is left to take somebody’s weight.', ingredients: { wood: 5, stone: 1 }, result: 'bench', amount: 1 },
  { id: 'make_workbench', name: 'Work table', description: 'Salvage a surface for the repairs that cannot wait.', ingredients: { wood: 8, stone: 4 }, result: 'workbench', amount: 1 },
  { id: 'make_sapling', name: 'Willow sapling', description: 'Keep one cutting alive through the move.', ingredients: { willow_fibre: 2, herb: 1 }, result: 'sapling', amount: 1 },
  { id: 'make_soup', name: 'Shanty soup', description: 'Make one fish and a few leaves reach the bottom of a pot.', ingredients: { fish: 1, herb: 2 }, result: 'soup', amount: 1, station: 'campfire' },
  { id: 'make_tea', name: 'Pillowwort tea', description: 'Boil the bitter leaves while there is still fuel.', ingredients: { herb: 3 }, result: 'tea', amount: 1, station: 'campfire' },
  { id: 'make_coupon', name: 'Unstamped tomorrow', description: 'Recover three minutes without asking the Lady to kiss you.', ingredients: { timeglass: 3, willow_fibre: 1 }, result: 'time_coupon', amount: 1, station: 'workbench' },
];
