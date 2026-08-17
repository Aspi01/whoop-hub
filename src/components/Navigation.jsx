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
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe pointer-events-none">
      <div className="max-w-md mx-auto mb-3 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-1.5 shadow-2xl flex items-center justify-around shadow-black/60">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center py-2 px-3.5 rounded-2xl transition-all duration-200 cursor-pointer ${
                  isActive
                    ? item.isAi
                      ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 font-semibold'
                      : 'bg-slate-800 text-white font-semibold shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-amber-500 text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                      {item.badge}
                    </span>
                  )}
                  {item.isAi && !isActive && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                  )}
                </div>
                <span className="text-[11px] mt-1 tracking-tight">
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
