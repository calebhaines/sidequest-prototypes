import { useId } from 'react';

/** Small pasted-paper diagrams. The symbols remain readable without their colour. */
export default function PaperMotif({ id, size = 48, className = '' }: { id: string; size?: number; className?: string }) {
  const grain = `paper-motif-${useId().replace(/:/g, '')}`;
  const dark = 'var(--p-charcoal)', pale = 'var(--p-paper)', warm = 'var(--p-clay)';
  let shape;
  switch (id) {
    case 'crown': shape = <><path fill={warm} d="m8 25 5 3 2-14 12 15 6-18 8 16 12-13 2 17-5 12-37 1Z" /><path fill={pale} d="m12 43 39-2-2 7-34 2Z" /></>; break;
    case 'seed': case 'leaf': case 'willow': shape = <><path fill="var(--p-pine)" d="m29 52-2-23 6-4 2 27Z" /><path fill="var(--p-moss)" d="m30 34-14-5-7-10 5-8 9 3 9 16Zm2-7 3-15 12-6 10 3-4 12-16 10Z" /><path fill="var(--p-ash)" d="m18 16 12 15-3 1-9-13Zm27-3-10 14 1-5Z" /></>; break;
    case 'eye': shape = <><path fill={warm} d="m4 30 9-10 18-9 19 7 11 13-12 14-20 8-16-10Z" /><path fill={pale} d="m9 31 13-12 13-3 14 8 7 7-14 10-16 3-11-6Z" /><path fill={dark} d="m28 17 12 2 6 12-7 12-10 1-9-11Z" /><path fill="var(--p-ash)" d="m31 20 5 1 1 9-4 2-3-5Z" /></>; break;
    case 'bowl': shape = <><path fill="var(--p-deepWater)" d="m7 26 20-3 29 2-7 20-11 9-17-3-9-13Z" /><path fill={pale} d="m8 24 17-4 21 1 11 4-14 8-19 1-12-5Z" /><path fill={warm} d="m15 26 12-3 16 1 9 3-13 3-17-1Z" /></>; break;
    case 'door': shape = <><path fill="var(--p-umbra)" d="m10 54-1-45 42-3 4 49-9 1-2-42-28 1 1 39Z" /><path fill={dark} d="m17 16 25-2 1 40-27 1Z" /><path fill="var(--p-sand)" d="m16 15 17 4-2 32-16 4Z" /><path fill={dark} d="m27 33 3-1 1 4-3 1Z" /></>; break;
    case 'scales': shape = <><path fill={dark} d="m28 10 6-1 2 43 13 1 1 4-32 1-1-5 12-2Zm-19 9 45-3 1 4-47 4Z" /><path fill={warm} d="m8 28 18-1-5 13-9 1Zm32-3 17-1-3 12-10 2Z" /><path fill={dark} d="m15 19 2 1-1 12-2-1Zm31-2 3-1 1 12-3 1Z" /></>; break;
    case 'coin': case 'sun': shape = <><path fill="var(--p-ochre)" d="m19 8 22-2 12 11 6 20-11 18-22 4-17-13-5-20Z" /><path fill="var(--p-sand)" d="m22 14 16-2 12 12-1 20-13 7-17-5-7-16Z" /><path fill="var(--p-umbra)" d="m28 18 8-1 1 23-7 4-2-6 4-3Z" /></>; break;
    case 'clock': shape = <><path fill="var(--p-ash)" d="m16 8 24-3 14 14 5 19-13 19-23 2-17-17-3-18Z" /><path fill={pale} d="m20 13 18-2 14 16-3 16-15 10-16-9-7-16Z" /><path fill={dark} d="m30 18 4-1 1 16 13 5-2 4-16-6Z" /></>; break;
    case 'moon': shape = <><path fill="var(--p-straw)" d="m36 5-18 7-9 17 3 18 16 12 19-1 11-12-16 3-13-9-5-15 5-12Z" /><path fill="var(--p-sand)" d="m13 36 8 14 12 4 16-4-6 6-15 1-13-9Z" /></>; break;
    case 'earth': shape = <><path fill="var(--p-clay)" d="m7 25 46-4 4 28-47 6Z" /><path fill="var(--p-umbra)" d="m8 38 22-4 27 3-1 7-28-3-18 3Z" /></>; break;
    case 'bark': shape = <><path fill="var(--p-umbra)" d="m22 7 24-2 4 49-26 6-8-20Z" /><path fill="var(--p-clay)" d="m25 11 5-1-1 26 5 16-5 1-7-17Zm15-3 2 1 5 31-4 3Z" /></>; break;
    case 'raven': case 'bat': shape = <><path fill={dark} d="m6 35 7-18 16 11 3-18 7 3 2 14 15-9 4 19-11-3-9 14-12-1-9-13Z" /><path fill="var(--p-bruise)" d="m14 25 15 7-3 6-12-4Zm28 7 10-8 1 8-12 9Z" /><path fill={pale} d="m34 22 3 1-1 3-3-1Z" /></>; break;
    case 'house': shape = <><path fill="var(--p-water)" d="m12 27 37-3 4 28-39 3Z" /><path fill={dark} d="m5 29 25-22 30 17-3 7-26-14-20 16Z" /><path fill={pale} d="m19 34 8-1 1 10-8 1Z" /><path fill="var(--p-umbra)" d="m34 32 12-1 2 23-15 1Z" /><path fill="var(--p-rust)" d="m12 47 17-2 1 3-18 3Z" /></>; break;
    case 'lantern': shape = <><path fill={dark} d="m23 12 3-7 14 1 4 7-4 4-3-7-7-1-4 6Zm-4 8 27-3 5 32-5 9-29-2-3-8Z" /><path fill="var(--p-straw)" d="m24 24 16-2 4 22-3 6-18-1-3-5Z" /><path fill="var(--p-ochre)" d="m29 31 5-4 6 14-8 5-7-5Z" /></>; break;
    case 'chime': shape = <><path fill={dark} d="m13 13 37-3 2 5-38 4Z" /><path fill="var(--p-clay)" d="m17 20 6-1 2 25-6 2Zm15-2 5 1 2 35-5-1Zm12 0 5-1 3 24-6 3Z" /></>; break;
    case 'mirror': shape = <><path fill="var(--p-umbra)" d="m15 8 29-3 10 9 1 30-13 10-20-1-13-12Z" /><path fill="var(--p-water)" d="m20 14 22-2 6 7-1 22-9 7-16-3-7-10Z" /><path fill="var(--p-ash)" d="m18 28 27-12 1 4-28 12Z" /></>; break;
    case 'curtain': shape = <><path fill="var(--p-bruise)" d="m8 9 49-3 3 47-17 4-11-17-11 18-11-3Z" /><path fill={dark} d="m24 8 4 36-8 9 3-31Zm13-1-2 28 8 17-3-25Z" /></>; break;
    case 'shout': shape = <><path fill="var(--p-rust)" d="m25 9 14-3-3 31-10 2Zm2 37 10-2 3 11-13 3Z" /></>; break;
    default: shape = <><path fill="var(--p-ash)" d="m12 8 39-3 5 50-44 4Z" /><path fill="var(--p-umbra)" d="m19 20 28-2 1 4-28 2Zm1 11 24-2 1 3-24 3Zm1 12 20-2 1 4-21 2Z" /></>;
  }
  return <svg className={`paper-motif ${className}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><pattern id={grain} width="17" height="19" patternUnits="userSpaceOnUse"><path d="m1 2 3 1m4 3 2-1m4 6 3-2m-14 6 4 1m6-1 2 1" fill="none" stroke="var(--p-paper)" strokeWidth=".7" opacity=".28" /></pattern></defs><g>{shape}</g><path fill={`url(#${grain})`} d="M4 3h56v57H4Z" /></svg>;
}
