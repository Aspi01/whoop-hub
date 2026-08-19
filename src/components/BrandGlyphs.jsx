import React from 'react';

function Svg({ children, className = 'w-5 h-5', viewBox='0 0 24 24' }) {
  return <svg viewBox={viewBox} className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">{children}</svg>;
}

export function FormGlyph({ className }) {
  return <Svg className={className}><path d="M12 2.7 20.1 7.3v9.4L12 21.3 3.9 16.7V7.3L12 2.7Z" stroke="currentColor" strokeWidth="1.5"/><path d="m8.2 12 2.2 2.1 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 2.8v3.1M20 7.4l-2.7 1.5M20 16.6 17.3 15M12 21.2v-3.1M4 16.6 6.7 15M4 7.4l2.7 1.5" stroke="currentColor" strokeWidth="1" opacity=".45"/></Svg>;
}

export function LogGlyph({ className }) {
  return <Svg className={className}><path d="M5 5.2c4.8-2.1 9.2-2.1 14 0v13.6c-4.8-2.1-9.2-2.1-14 0V5.2Z" stroke="currentColor" strokeWidth="1.5"/><path d="M8 9h8M8 12h5M8 15h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></Svg>;
}

export function TrainGlyph({ className }) {
  return <Svg className={className}><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></Svg>;
}

export function TrendGlyph({ className }) {
  return <Svg className={className}><path d="M4 19V11M9 19V5M14 19v-8M19 19V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="m4 8 5-3 5 3 5-5" stroke="currentColor" strokeWidth="1.25" opacity=".55" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

export function YouGlyph({ className }) {
  return <Svg className={className}><circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.5"/><path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>;
}

export function SleepGlyph({ className }) {
  return <Svg className={className}><path d="M17.6 16.4A7.4 7.4 0 0 1 8 6.5a7.5 7.5 0 1 0 9.6 9.9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></Svg>;
}

export function HeartGlyph({ className }) {
  return <Svg className={className}><path d="M12 20S4.3 15.8 4.3 9.8A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7.7 2.1C19.7 15.8 12 20 12 20Z" stroke="currentColor" strokeWidth="1.5"/><path d="m7.2 11.8 2.2.1 1.2-2.4 2.1 5 1.3-2.6h2.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity=".6"/></Svg>;
}

export function FuelGlyph({ className }) {
  return <Svg className={className}><path d="M8 3v18M16 3v18M8 9h8M6 3v5c0 1.3.7 2 2 2M18 3v5c0 1.3-.7 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Svg>;
}

export function SignalGlyph({ className }) {
  return <Svg className={className}><path d="M4 12h3l1.7-5 3.1 10 2.4-7 1.7 2H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}
