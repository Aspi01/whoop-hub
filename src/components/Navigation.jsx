import React from 'react';
import {
  PulseGlyph,
  FuelGlyph,
  LiftGlyph,
  RitualGlyph,
  IntelligenceGlyph
} from './BrandGlyphs.jsx';

export default function Navigation({ activeTab, setActiveTab, pendingMealsCount = 0 }) {
  const navItems = [
    { id: 'dashboard', label: 'Today', icon: PulseGlyph },
    { id: 'meals', label: 'Food', icon: FuelGlyph, badge: pendingMealsCount },
    { id: 'workouts', label: 'Train', icon: LiftGlyph },
    { id: 'journal', label: 'Rituals', icon: RitualGlyph },
    { id: 'coach', label: 'AI', icon: IntelligenceGlyph, isAi: true }
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-safe pointer-events-none"
      role="navigation"
      aria-label="Основная навигация"
    >
      <div className="max-w-md mx-auto mb-2 pointer-events-auto">
        <div className="nav-frost rounded-[26px] p-1.5 grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`relative min-h-[52px] rounded-[18px] flex flex-col items-center justify-center gap-1 pressable ${
                  isActive ? 'nav-active' : 'text-slate-500'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-[19px] h-[19px] ${isActive ? 'text-emerald-300' : 'text-slate-400'}`} />
                  {item.badge > 0 && (
                    <span className="absolute -top-2 -right-3 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[#0a0d12] text-[9px] font-black grid place-items-center">
                      {item.badge}
                    </span>
                  )}
                  {item.isAi && !isActive && (
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(34,224,162,.8)]" />
                  )}
                </div>
                <span className={`text-[9px] leading-none tracking-tight ${isActive ? 'font-extrabold text-white' : 'font-semibold text-slate-500'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
