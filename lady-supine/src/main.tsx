import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/palette.css';
import './styles/openworld.css';
import { loadPaperAssets, paperAssetPortrait, photoMaterialDataUrl } from './openworld/paperAssets';

function PaperBoot() {
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    loadPaperAssets().then(() => {
      if (!active) return;
      const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement('link');
      const portrait = paperAssetPortrait('lady-head', 48);
      if (portrait) { icon.rel = 'icon'; icon.href = portrait; icon.type = 'image/png'; if (!icon.isConnected) document.head.append(icon); }
      for (const material of ['olive', 'metal', 'wood', 'water', 'gravel', 'grass']) {
        const url = photoMaterialDataUrl(`material-${material}`);
        if (url) document.documentElement.style.setProperty(`--photo-${material}`, `url("${url}")`);
      }
      setState('ready');
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [attempt]);
  if (state === 'ready') return <App />;
  return <div className="ow-game"><div className="ow-title-overlay"><div className="ow-title-card" role="status" aria-live="polite">
    <span className="ow-eyebrow">THE LAND OF LIMITED TIME</span>
    <h1>Lady Supine</h1>
    <div className="cigarillo-loader" aria-hidden="true"><span className="cigarillo-filter" /><span className="cigarillo-paper" /><span className="cigarillo-ember" /></div>
    <p>{state === 'error' ? 'The pages have not arrived. Try opening them again.' : 'The roofs were patched with yesterday’s notices.'}</p>
    {state === 'error' && <button className="ow-primary" onClick={() => { setState('loading'); setAttempt(value => value + 1); }}>Try again</button>}
  </div></div></div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><PaperBoot /></React.StrictMode>);
