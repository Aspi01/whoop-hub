import React from 'react';
import { Activity, Utensils, Dumbbell, BookOpen, Bot } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab, pendingMealsCount = 0 }) {
  const navItems = [
    { id: 'dashboard', label: 'Whoop', icon: Activity },
    { id: 'meals', label: 'Питание', icon: Utensils, badge: pendingMealsCount },
    { id: 'workouts', label: 'Тренировки', icon: Dumbbell },
    { id: 'journal', label: 'Дневник', icon: BookOpen },
    { id: 'coach', label: 'AI Коуч', icon: Bot, isAi: true }
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-safe pointer-events-none"
      role="navigation"
      aria-label="Основная навигация"
    >
      <div className="max-w-md mx-auto mb-2 pointer-events-auto">
        <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-1 shadow-2xl shadow-black/80 flex items-center justify-around">
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
                className={`relative flex flex-col items-center justify-center flex-1 py-2 px-1 min-h-[48px] rounded-xl transition-all duration-150 cursor-pointer active:scale-95 ${
                  isActive
                    ? item.isAi
                      ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                      : 'bg-slate-800/90 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-amber-500 text-slate-950 text-[10px] font-black rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow-sm">
                      {item.badge}
                    </span>
                  )}
                  {item.isAi && !isActive && (
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  )}
                </div>
                <span className="text-[10px] tracking-tight mt-1 leading-none">
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-1 w-1 h-1 bg-emerald-400 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
