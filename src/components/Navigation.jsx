import React from 'react';
import { Home, Utensils, Dumbbell, BookOpen, Bot } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab, pendingMealsCount = 0 }) {
  const navItems = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'meals', label: 'Health', icon: Utensils, badge: pendingMealsCount },
    { id: 'workouts', label: 'Workout', icon: Dumbbell },
    { id: 'journal', label: 'Journal', icon: BookOpen },
    { id: 'coach', label: 'Coach', icon: Bot, isAi: true }
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-safe pointer-events-none"
      role="navigation"
      aria-label="Основная навигация"
    >
      <div className="max-w-md mx-auto mb-2 pointer-events-auto flex items-center gap-2">
        {/* Главная плавающая капсула навигации */}
        <div className="flex-1 bg-[#141a24]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-1 shadow-2xl shadow-black/90 flex items-center justify-around">
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
                className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 min-h-[46px] rounded-2xl transition-all duration-150 cursor-pointer active:scale-95 ${
                  isActive
                    ? 'text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon className={`w-4 h-4 transition-transform ${isActive ? 'scale-110 text-[#0099ff]' : 'text-slate-400'}`} />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 bg-[#ffb800] text-slate-950 text-[9px] font-black rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center shadow-sm">
                      {item.badge}
                    </span>
                  )}
                  {item.isAi && !isActive && (
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 bg-[#00e676] rounded-full animate-pulse" />
                  )}
                </div>
                <span className={`text-[10px] tracking-tight mt-0.5 leading-none ${isActive ? 'text-white font-bold' : 'text-slate-400'}`}>
                  {item.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0.5 w-1 h-1 bg-[#0099ff] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Фирменная круглая кнопка Whoop W/ (Screenshot 1) */}
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === 'coach' ? 'dashboard' : 'coach')}
          aria-label="Whoop Action"
          className="w-12 h-12 rounded-3xl bg-gradient-to-tr from-[#121620] via-[#1a2230] to-[#26354a] border border-white/15 text-white flex items-center justify-center shadow-xl shadow-black/80 hover:border-[#0099ff]/50 active:scale-90 transition-all cursor-pointer shrink-0"
        >
          <span className="font-black font-sans text-sm tracking-tighter text-[#0099ff]">
            W<span className="text-white">/</span>
          </span>
        </button>
      </div>
    </nav>
  );
}
