import React from 'react';
import { FormGlyph, LogGlyph, TrainGlyph, TrendGlyph, YouGlyph } from './BrandGlyphs.jsx';

export default function Navigation({ activeTab, setActiveTab, pendingMealsCount = 0 }) {
  const navItems = [
    { id: 'dashboard', label: 'Today', icon: FormGlyph },
    { id: 'journal', label: 'Log', icon: LogGlyph },
    { id: 'workouts', label: 'Train', icon: TrainGlyph },
    { id: 'meals', label: 'Fuel', icon: TrendGlyph, badge: pendingMealsCount },
    { id: 'coach', label: 'Coach', icon: YouGlyph }
  ];

  return (
    <nav className="brand-nav" role="navigation" aria-label="Основная навигация">
      <div className="brand-nav__inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`brand-nav__item ${active ? 'is-active' : ''}`}
            >
              <span className="brand-nav__icon-wrap">
                <Icon className="w-[19px] h-[19px]" />
                {item.badge > 0 && <span className="brand-nav__badge">{item.badge}</span>}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
