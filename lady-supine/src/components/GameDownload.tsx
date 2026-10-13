import { Download } from 'lucide-react';

export function canDownloadGame(): boolean {
  return !import.meta.env.DEV && location.protocol !== 'file:';
}

export default function GameDownload({ className = '' }: { className?: string }) {
  if (!canDownloadGame()) return null;
  const url = document.documentElement.dataset.singleHtml === 'true'
    ? new URL(location.href)
    : new URL(`${import.meta.env.BASE_URL}lady-supine.html`, location.href);
  url.hash = '';
  return <a className={`ow-button ow-game-download ${className}`} href={url.href} download="Lady-Supine.html" aria-label="Download game as a single HTML file"><Download size={15} /><span>Download game (.html)</span></a>;
}
