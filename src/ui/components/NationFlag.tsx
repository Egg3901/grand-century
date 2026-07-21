import { useState } from 'react';
import { NationShield } from './NationShield';

interface NationFlagProps {
  tag: string;
  color?: [number, number, number] | number[];
  size?: number; // flag HEIGHT in px; width is 3:2
  className?: string;
}

/**
 * Era-appropriate nation flag (public/flags/<TAG>.svg, baked by
 * scripts/build-flags.mjs, self-hosted so it rides the PWA precache).
 * Unknown tags — released nations, future formables without art — fall back
 * to the procedural NationShield so no nation ever renders without an icon.
 */
export function NationFlag({ tag, color, size = 20, className = '' }: NationFlagProps) {
  const [failed, setFailed] = useState(false);
  if (!tag || failed) {
    return <NationShield nation={{ tag, color: (color ?? [90, 84, 70]) as [number, number, number] }} size={size} className={className} />;
  }
  return (
    <img
      className={`nation-flag ${className}`}
      src={`${import.meta.env.BASE_URL}flags/${tag}.svg`}
      width={Math.round(size * 1.5)}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
