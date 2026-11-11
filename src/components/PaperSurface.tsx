import type { FasteningId, PresetId } from '../types';
import PaperPattern from './PaperPattern';
import Fastening from './Fastening';

/** Only the physical sheet; all text and controls live in StickyNote's HTML layer. */
export default function PaperSurface({ preset, fastening }: { preset?: PresetId; fastening?: FasteningId }) {
  return <div className="paper-art" aria-hidden="true">
    <div className="paper-shadow paper-shadow-ambient" />
    <div className="paper-shadow paper-shadow-contact" />
    <div className="paper-shadow paper-shadow-lift" />
    {fastening === 'clip' && <Fastening kind="clip" layer="back" />}
    <div className="paper-thickness" />
    <div className="paper-base">
      <div className="paper-photo" />
      <div className="paper-grain" />
      <div className="paper-crease" />
      {preset && <PaperPattern preset={preset} />}
      <div className="paper-edge-light" />
      <div className="department-stripe" />
      <span className="paper-curl paper-curl-left" />
      <span className="paper-curl paper-curl-right" />
      <span className="paper-bent-corner paper-bent-top" />
      <span className="paper-bent-corner paper-bent-bottom" />
      <span className="paper-edge-fibres" />
    </div>
  </div>;
}
