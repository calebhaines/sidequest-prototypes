/** The entire game's authored ink set: 24 pigments, shared by drawings and interface.
 * Smooth vector edges and overlapping translucent strokes blend these inks naturally. */
export const PALETTE = Object.freeze({
  ink: '#27252a', charcoal: '#3e393d', slate: '#545350', smoke: '#757a78',
  fog: '#9da59e', paper: '#ddd2ba', chalk: '#efe5cf', ash: '#beb7a4',
  umbra: '#564a3d', bark: '#78634a', clay: '#a28766', sand: '#c1ad87',
  rust: '#a45d47', ochre: '#c29559', ember: '#c57c50', straw: '#d5bd78',
  pine: '#465951', moss: '#637c61', sage: '#8e9b71', lichen: '#b0b894',
  deepWater: '#445e68', water: '#708a8c', bruise: '#725b70', flesh: '#c9968f',
});
export const PALETTE24 = PALETTE;
export type PigmentName = keyof typeof PALETTE;
export const PIGMENTS = Object.values(PALETTE);
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const colours = PIGMENTS.map(hex => ({ hex, rgb: rgb(hex) }));
const mapped = new Map<string, string>();

/** Normalizes imported object/item tint onto the same palette, retaining ink opacity. */
export function pigment(source: string): string {
  if (source === 'transparent') return PALETTE.ink + '00';
  if (Object.hasOwn(PALETTE, source)) return PALETTE[source as PigmentName];
  const cached = mapped.get(source); if (cached) return cached;
  let channels: number[], alpha = 1;
  const hex = source.match(/^#([\da-f]{3,8})$/i);
  const functional = source.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (hex && [3, 4, 6, 8].includes(hex[1].length)) {
    const expanded = hex[1].length <= 4 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    channels = rgb(`#${expanded.slice(0, 6)}`);
    if (expanded.length === 8) alpha = parseInt(expanded.slice(6), 16) / 255;
  } else if (functional) {
    channels = functional.slice(1, 4).map(Number); alpha = functional[4] === undefined ? 1 : Number(functional[4]);
  } else return PALETTE.ink;
  const nearest = colours.reduce((best, candidate) => {
    const distance = candidate.rgb.reduce((sum, component, i) => sum + (component - channels[i]) ** 2 * [0.3, 0.59, 0.11][i], 0);
    return distance < best.distance ? { hex: candidate.hex, distance } : best;
  }, { hex: PALETTE.ink as string, distance: Infinity }).hex;
  const result = alpha >= 1 ? nearest : nearest + Math.round(Math.max(0, alpha) * 255).toString(16).padStart(2, '0');
  mapped.set(source, result); return result;
}

export function rgba(name: PigmentName | string, alpha: number): string {
  const [r, g, b] = rgb(pigment(name));
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha))})`;
}
