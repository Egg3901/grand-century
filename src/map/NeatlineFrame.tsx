/**
 * NeatlineFrame — the engraved plate frame around the world.
 *
 * A 19th-century atlas plate is never full-bleed: it sits inside a neatline
 * (double rule with graticule tick marks) with a title cartouche in a corner.
 * Pure chrome, pointer-events none; the map pans underneath it.
 */

const TICKS = 36; // tick marks per edge

export function NeatlineFrame() {
  const ticks = Array.from({ length: TICKS - 1 }, (_, i) => ((i + 1) / TICKS) * 100);
  return (
    <div className="neatline" aria-hidden="true">
      <div className="neatline__rule neatline__rule--outer" />
      <div className="neatline__rule neatline__rule--inner" />
      {/* graticule ticks along all four edges, between the two rules */}
      <svg className="neatline__ticks" width="100%" height="100%" preserveAspectRatio="none">
        {ticks.map((p) => (
          <g key={p}>
            <line x1={`${p}%`} y1="0" x2={`${p}%`} y2="7" />
            <line x1={`${p}%`} y1="100%" x2={`${p}%`} y2="calc(100% - 7px)" />
            <line x1="0" y1={`${p}%`} x2="7" y2={`${p}%`} />
            <line x1="100%" y1={`${p}%`} x2="calc(100% - 7px)" y2={`${p}%`} />
          </g>
        ))}
      </svg>
      <div className="neatline__cartouche">
        <svg viewBox="0 0 48 48" width="34" height="34" className="neatline__rose">
          <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M35 13 L28.5 24 L35 35 L24 28.5 L13 35 L19.5 24 L13 13 L24 19.5 Z" fill="currentColor" opacity="0.45" />
          <path d="M24 4 L27.2 21 L44 24 L27.2 27 L24 44 L20.8 27 L4 24 L20.8 21 Z" fill="currentColor" />
          <circle cx="24" cy="24" r="2.2" fill="var(--gc-paper, #ece6d6)" stroke="currentColor" strokeWidth="1" />
        </svg>
        <div className="neatline__cartouche-text">
          <span className="neatline__title">Grand Century</span>
          <span className="neatline__subtitle">Atlas of the Long Nineteenth Century</span>
          <span className="neatline__plate">MDCCCXXX &ndash; MCMXXX &middot; Plate I</span>
        </div>
      </div>
    </div>
  );
}
