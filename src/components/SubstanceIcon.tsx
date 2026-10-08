import type { Substance } from '../lib/types';

/** Small line drawings, one per substance, coloured by `currentColor`. */
export function SubstanceIcon({ substance, size = 22 }: { substance: Substance; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (substance === 'cigarette') {
    return (
      <svg {...common}>
        <rect x="2.5" y="13" width="17" height="4" rx="1" />
        <line x1="7" y1="13" x2="7" y2="17" />
        <path d="M21.5 13v4" />
        <path d="M19 9c0-1.5 1.5-1.5 1.5-3S19 4.5 19 3" />
      </svg>
    );
  }
  if (substance === 'vape') {
    return (
      <svg {...common}>
        <rect x="8" y="6" width="8" height="16" rx="2.5" />
        <path d="M10.5 6V3.5h3V6" />
        <line x1="12" y1="10" x2="12" y2="14" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M2.5 15.5 L19 12.5 L19.5 17 L3 17.2 Z" />
      <line x1="6" y1="14.9" x2="6.2" y2="17.1" />
      <path d="M19.4 12.6c1-.4 1.6-.2 2.1.4" />
      <path d="M17 8.5c0-1.2 1.2-1.2 1.2-2.4S17 4.9 17 3.7" />
    </svg>
  );
}
