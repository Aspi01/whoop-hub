import React from 'react';

export default function Navigation({ activeTab, setActiveTab, pendingMealsCount = 0 }) {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Today',
      svg: (
        <svg viewBox="0 0 24 24">
          <path d="M4 13h3l2-6 4 11 2-7h5" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      id: 'meals',
      label: 'Food',
      badge: pendingMealsCount,
      svg: (
        <svg viewBox="0 0 24 24">
          <path d="M12 2c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    },
    {
      id: 'workouts',
      label: 'Train',
      svg: (
        <svg viewBox="0 0 24 24">
          <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" stroke="currentColor" fill="none" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      )
    },
    {
      id: 'journal',
      label: 'Rituals',
      svg: (
        <svg viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4" stroke="currentColor" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    },
    {
      id: 'coach',
      label: 'AI',
      svg: (
        <svg viewBox="0 0 24 24">
          <path d="M9 18h6M10 22h4" stroke="currentColor" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M8.5 14.5A7 7 0 1 1 15.5 14.5C14.5 15.2 14 16 14 17h-4c0-1-.5-1.8-1.5-2.5z" stroke="currentColor" fill="none" strokeWidth="1.6" />
        </svg>
      )
    }
  ];

  return (
    <nav className="nav" role="navigation" aria-label="Основная навигация">
      {navItems.map((item) => {
        const active = activeTab === item.id;
        return (
          <button
            key={item.id}
            data-nav={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            aria-current={active ? 'page' : undefined}
            className={active ? 'active' : ''}
          >
            <div className="relative">
              {item.svg}
              {item.badge > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-1 rounded-full bg-[#f1c463] text-[#06120b] text-[8px] font-black grid place-items-center">
                  {item.badge}
                </span>
              )}
            </div>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
