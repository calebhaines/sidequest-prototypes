import { CircleAlert, Clock3, Moon, Sun } from 'lucide-react';
import { drawPaperAsset, drawPaperAssetRegion, paperAssetsRevision } from '../openworld/paperAssets';
import { itemIconDataUrl } from '../openworld/sprites';

const photoSources: Record<string, string> = {
  supine: 'lady-head', crown: 'prop-crown', seed: 'item-sapling', leaf: 'item-willow', willow: 'willow',
  eye: 'lady-head', bowl: 'prop-bowl', door: 'trailer', scales: 'prop-scales',
  coin: 'item-coupon', earth: 'item-stone', bark: 'item-wood', raven: 'gatekeeper-head', bat: 'bat-head',
  house: 'blue-trailer', lantern: 'item-lantern', chime: 'prop-chime', mirror: 'prop-mirror', curtain: 'prop-curtain',
  decree: 'item-coupon', harvest: 'item-herb', hospital: 'brain-machine', arrival: 'item-glass',
  work: 'worker-coat', breath: 'human-head', friend: 'hare-head', yesterday: 'item-soup', tooth: 'item-key',
  brain: 'item-brain', book: 'shelves', tools: 'item-axe', fish: 'item-fish',
};
const fallbackItems: Record<string, string> = {
  crown: 'time_coupon', bowl: 'soup', scales: 'stone', chime: 'key', mirror: 'time_coupon', curtain: 'wood',
};
const specimens = new Map<string, string>();

/** Mount original photographic cutouts without repainting, tinting, or changing their source files. */
function specimenImage(id: string, size: number): string {
  const source = photoSources[id];
  if (!source) return itemIconDataUrl('library_ticket', size);
  const dimension = Math.max(24, Math.min(192, Math.round(size * 2)));
  const key = `${paperAssetsRevision()}:${id}:${dimension}`;
  const previous = specimens.get(key);
  if (previous) return previous;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = dimension;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  const painted = id === 'eye'
    ? drawPaperAssetRegion(context, source, .13, .34, .74, .25, 2, dimension * .31, dimension - 4, dimension * .39)
    : drawPaperAsset(context, source, 2, 2, dimension - 4, dimension - 4);
  if (!painted) return itemIconDataUrl(fallbackItems[id] || 'library_ticket', size);
  const url = canvas.toDataURL('image/png');
  if (specimens.size >= 96) specimens.delete(specimens.keys().next().value!);
  specimens.set(key, url);
  return url;
}

/** Photo specimens carry object imagery; fine printed signs remain legible at small sizes. */
export default function PaperMotif({ id, size = 48, className = '' }: { id: string; size?: number; className?: string }) {
  const Icon = id === 'clock' ? Clock3 : id === 'moon' ? Moon : id === 'sun' ? Sun : id === 'shout' ? CircleAlert : null;
  if (Icon) return <Icon className={`paper-motif photo-printed-sign ${className}`} size={size} strokeWidth={1.25} aria-hidden="true" focusable="false" />;
  return <img className={`paper-motif photo-specimen ${className}`} src={specimenImage(id, size)} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}
