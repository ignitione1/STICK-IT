import { Cloud, Coffee, Flower2, Heart, Leaf, Orbit, Smile, Sparkles, Star, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import type { PresetId } from '../types';

const motifs: Record<Exclude<PresetId, 'cream'>, [LucideIcon, LucideIcon]> = {
  yellow: [Sparkles, Star], mint: [Leaf, Flower2], pink: [Heart, Sparkles], blue: [Cloud, Star],
  lavender: [Orbit, Star], peach: [Smile, Sparkles],
  sea: [Waves, Cloud], sage: [Coffee, Leaf], berry: [Flower2, Heart],
};

export default function PaperPattern({ preset }: { preset: PresetId }) {
  const id = useId().replace(/:/g, '');
  if (preset === 'cream') return null;
  const [Main, Accent] = motifs[preset];
  return <svg className={`paper-pattern pattern-${preset}`} aria-hidden="true" focusable="false" width="100%" height="100%">
    <defs><pattern id={id} width="136" height="144" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
      <Main x="15" y="15" width="38" height="38" strokeWidth={1.6} />
      <Accent x="84" y="82" width="28" height="28" strokeWidth={1.5} />
      <circle cx="108" cy="32" r="2" fill="currentColor" stroke="none" />
      <circle cx="42" cy="114" r="1.5" fill="currentColor" stroke="none" />
    </pattern></defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>;
}
