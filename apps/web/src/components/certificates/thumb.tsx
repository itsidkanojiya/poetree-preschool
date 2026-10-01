import type { ReactNode } from 'react';
import type { CertificateDesign } from '@poetree/shared';

/**
 * A certificate design in miniature, in the school's own colour, so the
 * office can tell the four apart without opening a preview. Drawn after the
 * PDF artwork in the API's certificate.pdf.ts; the lettering is suggested by
 * grey bars, which is all a thumbnail needs.
 */

const GOLD = '#C9A227';
const FLAGS = ['#FF6B6B', '#FFB547', '#2EC4A0', '#3FA9F5', '#7B5CF0', '#F0648C'];

function Star({
  x,
  y,
  r,
  fill,
  opacity = 1,
}: {
  x: number;
  y: number;
  r: number;
  fill: string;
  opacity?: number;
}) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.45;
    return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`;
  }).join(' ');
  return <polygon points={points} fill={fill} opacity={opacity} />;
}

/** Title, name and the line beneath, as bars. */
function Lettering({ brand, top = 26 }: { brand: string; top?: number }) {
  return (
    <g>
      <rect x="38" y={top} width="44" height="5" rx="1.5" fill={brand} />
      <rect x="48" y={top + 9} width="24" height="2" rx="1" fill="#9CA3AF" />
      <rect x="30" y={top + 16} width="60" height="7" rx="2" fill="#1A1D29" />
      <rect x="40" y={top + 27} width="40" height="2" rx="1" fill="#9CA3AF" />
      <rect x="18" y="68" width="22" height="1" fill="#9CA3AF" />
      <rect x="80" y="68" width="22" height="1" fill="#9CA3AF" />
    </g>
  );
}

const ART: Record<CertificateDesign, (brand: string) => ReactNode> = {
  CLASSIC: (brand) => (
    <>
      <rect width="120" height="85" fill="#FFFCF5" />
      <rect x="4" y="4" width="112" height="77" fill="none" stroke={brand} strokeWidth="3" />
      <rect
        x="7.5"
        y="7.5"
        width="105"
        height="70"
        fill="none"
        stroke={brand}
        strokeOpacity="0.45"
        strokeWidth="0.6"
      />
      {[
        [7.5, 7.5],
        [112.5, 7.5],
        [7.5, 77.5],
        [112.5, 77.5],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x! - 2.2}
          y={y! - 2.2}
          width="4.4"
          height="4.4"
          fill={GOLD}
          transform={`rotate(45 ${x} ${y})`}
        />
      ))}
      <Lettering brand={brand} />
    </>
  ),
  STARS: (brand) => (
    <>
      <rect width="120" height="85" fill="#FFFFFF" />
      <rect width="120" height="6" fill={brand} />
      <rect y="6" width="120" height="1.2" fill={GOLD} />
      <rect y="79" width="120" height="6" fill={brand} />
      <rect y="77.8" width="120" height="1.2" fill={GOLD} />
      <Star x={11} y={17} r={4} fill={GOLD} />
      <Star x={17} y={33} r={2.4} fill={brand} opacity={0.5} />
      <Star x={14} y={62} r={3.4} fill={GOLD} />
      <Star x={109} y={17} r={3.6} fill={GOLD} />
      <Star x={103} y={36} r={2.4} fill={brand} opacity={0.5} />
      <Star x={106} y={62} r={4} fill={GOLD} />
      <Lettering brand={brand} />
    </>
  ),
  PLAYFUL: (brand) => (
    <>
      <rect width="120" height="85" fill={brand} fillOpacity="0.07" />
      <rect width="120" height="85" fill="#FFFFFF" fillOpacity="0.6" />
      <rect
        x="3.5"
        y="3.5"
        width="113"
        height="78"
        rx="7"
        fill="none"
        stroke={brand}
        strokeOpacity="0.5"
        strokeWidth="1.2"
      />
      <line x1="8" y1="7" x2="112" y2="7" stroke="#9CA3AF" strokeWidth="0.4" />
      {Array.from({ length: 12 }, (_, i) => {
        const step = 104 / 12;
        const x = 8 + i * step;
        return (
          <polygon
            key={i}
            points={`${x + 0.8},7 ${x + step - 0.8},7 ${x + step / 2},13`}
            fill={FLAGS[i % FLAGS.length]}
          />
        );
      })}
      {[
        [11, 26, 1.4],
        [17, 45, 1.1],
        [10, 64, 1.5],
        [109, 27, 1.5],
        [103, 47, 1.1],
        [110, 64, 1.3],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={FLAGS[i % FLAGS.length]} />
      ))}
      <Lettering brand={brand} top={22} />
    </>
  ),
  ELEGANT: (brand) => (
    <>
      <rect width="120" height="85" fill={brand} />
      <rect width="120" height="85" fill="#000000" fillOpacity="0.25" />
      <rect x="4" y="4" width="112" height="77" fill="#FFFEFB" />
      <rect x="6" y="6" width="108" height="73" fill="none" stroke={GOLD} strokeWidth="0.5" />
      <rect x="7" y="7" width="106" height="71" fill="none" stroke={GOLD} strokeWidth="0.3" />
      <Lettering brand={brand} top={20} />
      <circle
        cx="60"
        cy="62"
        r="4.5"
        fill={GOLD}
        fillOpacity="0.25"
        stroke={GOLD}
        strokeWidth="0.4"
      />
      <Star x={60} y={62} r={2.6} fill={GOLD} />
    </>
  ),
};

export function CertificateThumb({
  design,
  brand,
  className = '',
}: {
  design: CertificateDesign;
  /** The school's colour, as on its profile. */
  brand: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 85"
      className={`block h-auto w-full rounded-md shadow-sm ring-1 ring-navy-950/10 ${className}`}
      aria-hidden="true"
    >
      {ART[design](brand)}
    </svg>
  );
}
