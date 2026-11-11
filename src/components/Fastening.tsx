import { useId } from 'react';

type Kind = 'pin' | 'clip' | 'tape' | 'fold';

function Pushpin({ id, hue }: { id: string; hue: number }) {
  const color = (lightness: number) => `hsl(${hue} 93% ${lightness}%)`;
  return <svg viewBox="0 0 48 60" className="physical-pushpin" focusable="false">
    <defs>
      <radialGradient id={`${id}-head`} cx="29%" cy="20%" r="82%">
        <stop stopColor={color(91)} /><stop offset=".16" stopColor={color(69)} />
        <stop offset=".4" stopColor={color(49)} /><stop offset=".76" stopColor={color(34)} /><stop offset="1" stopColor={color(21)} />
      </radialGradient>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2=".85" y2="1">
        <stop stopColor={color(73)} /><stop offset=".24" stopColor={color(46)} /><stop offset=".66" stopColor={color(26)} /><stop offset="1" stopColor={color(14)} />
      </linearGradient>
      <linearGradient id={`${id}-steel`}><stop stopColor="#424947" /><stop offset=".38" stopColor="#f8fcfa" /><stop offset=".6" stopColor="#b9bcb5" /><stop offset="1" stopColor="#494e49" /></linearGradient>
      <filter id={`${id}-blur`} x="-70%" y="-100%" width="260%" height="300%"><feGaussianBlur stdDeviation="2.6" /></filter>
      <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".65" /></filter>
    </defs>
    <ellipse cx="30" cy="45" rx="12" ry="5.5" fill="#432b17" opacity=".35" filter={`url(#${id}-blur)`} />
    <path d="M24 32 27 49 29 51 28 32Z" fill={`url(#${id}-steel)`} />
    <ellipse cx="24" cy="33.5" rx="12.2" ry="7.3" fill={`url(#${id}-rim)`} />
    <path d="M13 30c0 8 20 10 23 1l-5-13H18Z" fill={`url(#${id}-rim)`} />
    <path d="M14.2 29.5c3.4 5.6 15.2 7.4 20.5 1.5" fill="none" stroke={color(73)} strokeWidth="1.1" opacity=".65" />
    <ellipse cx="23.8" cy="19.7" rx="12.6" ry="14.2" fill={`url(#${id}-head)`} />
    <path d="M14.7 16c1-4.7 4.9-7.5 9.1-7.8" stroke="#fff" strokeWidth="2.7" strokeLinecap="round" opacity=".75" fill="none" filter={`url(#${id}-soft)`} />
    <ellipse cx="17.7" cy="12.4" rx="2.8" ry="1.7" transform="rotate(-35 17.7 12.4)" fill="#fff" opacity=".92" />
    <path d="M31 24c-.7 3.4-2.8 5.8-5.5 6.9" stroke={color(13)} strokeWidth="1.6" strokeLinecap="round" opacity=".35" fill="none" />
  </svg>;
}

function Paperclip({ id, layer }: { id: string; layer: 'front' | 'back' | 'whole' }) {
  // The wide return loop goes behind the sheet; only the narrow tongue rests on its face.
  const back = 'M18 20v28c0 10 15 10 15 0V14';
  const front = 'M33 14C33-1 10-1 10 14v32c0 5.7 9 5.7 9 0V17';
  const wire = layer === 'back' ? back : layer === 'front' ? front : `${back} ${front}`;
  return <svg viewBox="0 0 46 70" className="physical-paperclip" focusable="false">
    <defs>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2=".25"><stop stopColor="#4c5659" /><stop offset=".18" stopColor="#f6f8f6" /><stop offset=".35" stopColor="#aab5b6" /><stop offset=".54" stopColor="#edf2ed" /><stop offset=".73" stopColor="#707e82" /><stop offset="1" stopColor="#d5dedb" /></linearGradient>
      <filter id={`${id}-clip-shadow`} x="-100%" y="-60%" width="350%" height="250%"><feGaussianBlur stdDeviation=".65" /></filter>
    </defs>
    <path d={wire} fill="none" stroke="#372d21" strokeWidth="5.8" opacity=".28" transform="translate(.7 1)" filter={`url(#${id}-clip-shadow)`} />
    <path d={wire} fill="none" stroke="#566065" strokeWidth="5.7" strokeLinecap="round" />
    <path d={wire} fill="none" stroke={`url(#${id}-metal)`} strokeWidth="4.4" strokeLinecap="round" />
    <path d={wire} fill="none" stroke="#fff" strokeWidth=".8" strokeLinecap="round" opacity=".8" transform="translate(-.7 -.4)" />
    {layer !== 'back' && <path d="M10 25v18" stroke="#f6faf4" strokeWidth="1" opacity=".6" />}
    {layer !== 'front' && <path d="M33 24v20" stroke="#4d585b" strokeWidth=".9" opacity=".7" />}
  </svg>;
}

export default function Fastening({ kind, hue = 44, layer = 'front' }: { kind: Kind; hue?: number; layer?: 'front' | 'back' | 'whole' }) {
  const id = `fastener-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return <div className={`fastening fastening-${kind} fastening-${layer}`} aria-hidden="true">
    {kind === 'pin' ? <Pushpin id={id} hue={hue} /> : kind === 'clip' ? <Paperclip id={id} layer={layer} />
      : <><span className="tape-material" /><span className="tape-ridge" /></>}
  </div>;
}
