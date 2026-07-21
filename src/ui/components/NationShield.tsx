import { nationShieldSvg, type NationShieldInput } from '../nationShield';

interface NationShieldProps {
  nation: NationShieldInput;
  size?: number;
  className?: string;
}

/**
 * Inline SVG shield for a nation. `nationShieldSvg` emits the raw `<svg>`
 * string so this component can render it without a wrapper `<img>` — keeps
 * the same DOM weight as text and inherits CSS transitions.
 */
export function NationShield({ nation, size = 24, className = '' }: NationShieldProps) {
  return (
    <span
      className={`nation-shield ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: nationShieldSvg(nation, size) }}
    />
  );
}
