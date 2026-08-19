import React from 'react';

const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
};

export function PulseGlyph({ className = 'w-5 h-5' }) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M3 12h3.4l1.9-5.2 3.3 10.6 2.2-6.2 1.5 3.1H21" />
      <path d="M4.5 5.5C6.2 3.8 8.2 3 10.2 3c.7 0 1.3.1 1.8.3.5-.2 1.1-.3 1.8-.3 2 0 4 .8 5.7 2.5" opacity=".42" />
    </svg>
  );
}

export function FuelGlyph({ className = 'w-5 h-5' }) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M12 3c1.2 2.9.2 4.7-1.2 6.2-1.8 1.9-2.8 3.6-1.5 6 1.1 2 3.5 2.9 5.6 1.7 2.2-1.2 3.1-4 2-6.4-.8-1.8-2.2-3.1-4.9-4.2" />
      <path d="M8 9.1C5.8 10.3 4.3 12.3 4.3 14.8c0 3.4 2.8 6.2 6.2 6.2 1.4 0 2.7-.5 3.8-1.3" opacity=".42" />
    </svg>
  );
}

export function LiftGlyph({ className = 'w-5 h-5' }) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M5 9v6M8 7v10M16 7v10M19 9v6M8 12h8" />
      <path d="M3.5 10.5v3M20.5 10.5v3" opacity=".55" />
    </svg>
  );
}

export function RitualGlyph({ className = 'w-5 h-5' }) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M7 4.5h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" />
      <path d="M8.5 9.5 10 11l2.7-3M8.5 15h7" />
      <path d="M9 3v3M15 3v3" opacity=".5" />
    </svg>
  );
}

export function IntelligenceGlyph({ className = 'w-5 h-5' }) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M12 3.5a6.7 6.7 0 0 0-4.8 11.3c.8.8 1.3 1.6 1.4 2.7h6.8c.1-1.1.6-1.9 1.4-2.7A6.7 6.7 0 0 0 12 3.5Z" />
      <path d="M9.4 20h5.2M9.2 8.8l1.7 1.1 1.1-2.1 1.1 2.1 1.7-1.1M12 10v4" />
    </svg>
  );
}

export function SleepGlyph({ className = 'w-5 h-5' }) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M18.5 14.7A7.2 7.2 0 0 1 9.3 5.5a7.4 7.4 0 1 0 9.2 9.2Z" />
      <path d="M16.2 5.2h3.2l-3.1 3.4h3.4" opacity=".6" />
    </svg>
  );
}

export function StrainGlyph({ className = 'w-5 h-5' }) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M13.7 2.8 6.6 13h4.7l-1 8.2 7.1-10.4h-4.6l.9-8Z" />
    </svg>
  );
}

export function TrendGlyph({ className = 'w-5 h-5' }) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="m4 16 4.3-4.3 3.2 2.8L18.8 7" />
      <path d="M14.5 7h4.3v4.3" />
    </svg>
  );
}

export function MarkGlyph({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M5 17h5l2.5-8 4.2 14 3-9 2.1 4H27" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeOpacity=".22" strokeWidth="1.4" />
    </svg>
  );
}
