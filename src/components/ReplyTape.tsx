import { useId, useLayoutEffect, useRef, useState } from 'react';
import { paperSeedFromId } from '../paper';

interface Point { x: number; y: number }
interface Geometry { left: number; top: number; width: number; height: number; from: Point; to: Point; stripWidth: number }

/** Map an unrotated point on the paper into viewport coordinates. */
function paperPoint(element: HTMLElement, x: number, y: number): Point {
  const style = getComputedStyle(element);
  const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
  const [originX, originY] = style.transformOrigin.split(' ').map(Number.parseFloat);
  const transform = (px: number, py: number) => {
    const point = matrix.transformPoint(new DOMPoint(px - originX, py - originY));
    return { x: point.x + originX, y: point.y + originY };
  };
  const corners = [transform(0, 0), transform(element.offsetWidth, 0), transform(0, element.offsetHeight), transform(element.offsetWidth, element.offsetHeight)];
  const bounds = element.getBoundingClientRect();
  const point = transform(x, y);
  return { x: bounds.left + point.x - Math.min(...corners.map(corner => corner.x)), y: bounds.top + point.y - Math.min(...corners.map(corner => corner.y)) };
}

export default function ReplyTape({ fromId, toId }: { fromId: string; toId: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const id = `reply-tape-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useLayoutEffect(() => {
    const host = hostRef.current;
    const group = host?.closest('.note-group');
    if (!host || !group) return;
    const papers = Array.from(group.querySelectorAll<HTMLElement>('[data-note-id]'));
    const source = papers.find(paper => paper.dataset.noteId === fromId);
    const target = papers.find(paper => paper.dataset.noteId === toId);
    if (!source || !target) return;

    function measure() {
      if (!host || !source || !target) return;
      if (!source.offsetWidth || !source.offsetHeight || !target.offsetWidth || !target.offsetHeight) return;
      const actions = source.querySelector<HTMLElement>('.note-actions');
      const lastLabel = actions?.querySelector<HTMLElement>('label:last-of-type');
      const replyButton = actions?.querySelector<HTMLElement>('button');
      // The gap between “Готово” and “Ответить” keeps the tape clear of controls.
      const gapLeft = lastLabel ? lastLabel.offsetLeft + lastLabel.offsetWidth : source.offsetWidth * .58;
      const gapRight = replyButton?.offsetLeft ?? source.offsetWidth * .74;
      const anchorX = (gapLeft + gapRight) / 2;
      const from = paperPoint(source, anchorX, source.offsetHeight - 12);
      const targetLeft = paperPoint(target, 0, 6);
      const targetRight = paperPoint(target, target.offsetWidth, 6);
      const drift = (paperSeedFromId(toId) % 7) - 3;
      const targetX = Math.max(45, Math.min(target.offsetWidth - 40,
        (from.x + drift - targetLeft.x) * target.offsetWidth / (targetRight.x - targetLeft.x)));
      const to = paperPoint(target, targetX, 6);
      const hostBounds = host.getBoundingClientRect();
      const stripWidth = Math.max(12, Math.min(26, gapRight - gapLeft - 8));
      const padding = stripWidth / 2 + 5;
      const left = Math.min(from.x, to.x) - padding;
      const top = Math.min(from.y, to.y) - 5;
      const next = {
        left: left - hostBounds.left, top: top - hostBounds.top,
        width: Math.abs(to.x - from.x) + padding * 2, height: Math.abs(to.y - from.y) + 10,
        from: { x: from.x - left, y: from.y - top }, to: { x: to.x - left, y: to.y - top }, stripWidth,
      };
      setGeometry(previous => previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(source);
    observer.observe(target);
    // A preceding reply can grow without changing the size of these two papers.
    const thread = host.closest('.thread-replies');
    if (thread) observer.observe(thread);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [fromId, toId]);

  const length = geometry ? Math.hypot(geometry.to.x - geometry.from.x, geometry.to.y - geometry.from.y) : 1;
  const angle = geometry ? -Math.atan2(geometry.to.x - geometry.from.x, geometry.to.y - geometry.from.y) * 180 / Math.PI : 0;
  const half = (geometry?.stripWidth ?? 20) / 2;
  const outline = `M${-half + .5} -.6 L${-half * .65} .5 L${-half * .4} -.7 L${-half * .1} .4 L${half * .2} -.5 L${half * .55} .5 L${half - .5} -.4 L${half} ${length * .3} L${half - .8} ${length * .67} L${half - .5} ${length - .4} L${half * .6} ${length + .5} L${half * .3} ${length - .5} L0 ${length + .6} L${-half * .35} ${length - .3} L${-half * .7} ${length + .5} L${-half + .5} ${length - .4} L${-half} ${length * .65} L${-half + .7} ${length * .28}Z`;

  return <span ref={hostRef} className="reply-tape-anchor" aria-hidden="true">
    {geometry && <svg className="reply-tape" focusable="false" data-from-note={fromId} data-to-note={toId}
      data-from-x={geometry.from.x} data-from-y={geometry.from.y} data-to-x={geometry.to.x} data-to-y={geometry.to.y}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`} style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height }}>
      <defs>
        <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="1" y2=".2"><stop stopColor="#eadcb7" stopOpacity=".98" /><stop offset=".18" stopColor="#f1e5c6" stopOpacity=".97" /><stop offset=".55" stopColor="#eadbb5" stopOpacity=".98" /><stop offset=".86" stopColor="#e1cda3" stopOpacity=".97" /><stop offset="1" stopColor="#ebdcb7" stopOpacity=".98" /></linearGradient>
        <linearGradient id={`${id}-matte`} x1="0" y1="0" x2=".3" y2="1"><stop stopColor="#fff9e6" stopOpacity=".22" /><stop offset=".4" stopColor="#fff9e6" stopOpacity=".04" /><stop offset=".7" stopColor="#aa8d58" stopOpacity=".05" /><stop offset="1" stopColor="#fff9e6" stopOpacity=".12" /></linearGradient>
        <filter id={`${id}-fibres`}><feTurbulence baseFrequency=".12 .82" numOctaves="3" seed={paperSeedFromId(toId) % 97} /><feColorMatrix type="saturate" values="0" /></filter>
        <clipPath id={`${id}-edge`}><path d={outline} /></clipPath>
      </defs>
      <g transform={`translate(${geometry.from.x} ${geometry.from.y}) rotate(${angle})`}>
        <path className="reply-tape-material" d={outline} fill={`url(#${id}-paper)`} stroke="#f7ecd0" strokeOpacity=".7" strokeWidth=".7" />
        <g clipPath={`url(#${id}-edge)`}>
          <rect x={-half} y="-2" width={half * 2} height={length + 4} filter={`url(#${id}-fibres)`} opacity=".22" style={{ mixBlendMode: 'multiply' }} />
          <path d={`M${-half + 1} 0 Q${-half + 2} ${length / 2} ${-half + .5} ${length}`} fill="none" stroke="#fff9e6" strokeOpacity=".32" strokeWidth=".6" />
          <path d={`M${half - 1} 0 Q${half - 2} ${length / 2} ${half - 1} ${length}`} fill="none" stroke="#8b7147" strokeOpacity=".27" strokeWidth=".7" />
          <path d={`M${-half} ${length * .42} Q0 ${length * .5} ${half} ${length * .44}`} fill="none" stroke="#9b8051" strokeOpacity=".16" strokeWidth=".6" />
          <path d={`M${-half} ${length * .45} Q0 ${length * .53} ${half} ${length * .47}`} fill="none" stroke="#fff9e6" strokeOpacity=".27" strokeWidth=".6" />
          <rect x={-half} y="-1" width={half * 2} height={length + 2} fill={`url(#${id}-matte)`} />
        </g>
      </g>
    </svg>}
  </span>;
}
