import React, { useState } from 'react';
import { X, CheckCircle, Clock, ShieldCheck, ArrowUpRight, Cpu } from 'lucide-react';

export default function DataSourcesModal({ isOpen, onClose, sources = [], onOpenWhoopSettings, onConnectAppleHealth }) {
  const [activeTab, setActiveTab] = useState('sources'); // 'sources' | 'priority'

  if (!isOpen) return null;

  return (
    <div className="modal open" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh' }}>
        <div className="sheetHead">
          <div>
            <h2>Источники данных</h2>
            <div className="text-[10px] uppercase tracking-wider text-[#7f8b92] mt-0.5 font-bold">
              Подключённые устройства и сервисы
            </div>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        {/* Source List */}
        <div className="mt-4 space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="p-3.5 rounded-xl bg-[#0b141b] border border-[#1d2931] flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#142028] border border-[#24333d] flex items-center justify-center text-xs font-black text-[#7cf0a5]">
                    {source.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-[#f3f6f4] flex items-center gap-1.5">
                      {source.name}
                      {source.connected && (
                        <span className="w-2 h-2 rounded-full bg-[#7cf0a5] shadow-[0_0_8px_rgba(124,240,165,0.7)]" />
                      )}
                    </div>
                    <div className="text-[10px] text-[#7f8a92] mt-0.5">
                      {source.statusText}
                    </div>
                    {source.supportingText && (
                      <div className="text-[10px] text-[#7f8a92] mt-1 max-w-[220px]">
                        {source.supportingText}
                      </div>
                    )}
                  </div>
                </div>

                {source.isComingSoon ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#1d2931] text-[#8ea099]">
                    Скоро
                  </span>
                ) : source.connected && source.id === 'whoop' ? (
                  <button
                    type="button"
                    onClick={() => { onClose(); onOpenWhoopSettings?.(); }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#173926] text-[#7cf0a5] border border-[#24523a] hover:bg-[#1f4a32]"
                  >
                    Настроить
                  </button>
                ) : source.connected && source.id === 'apple_health' ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#173926] text-[#7cf0a5]">
                    Подключено
                  </span>
                ) : source.id === 'apple_health' && source.capability === 'AVAILABLE' ? (
                  <button
                    type="button"
                    onClick={() => onConnectAppleHealth?.()}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#13222d] text-[#87d8f5] border border-[#253949] hover:bg-[#1a2d3b]"
                  >
                    Подключить Apple Health
                  </button>
                ) : source.id === 'apple_health' ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-[#1d2931] text-[#8ea099]">
                    iOS app
                  </span>
                ) : null}
              </div>

              {/* Data domains pills */}
              {source.domains && source.domains.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-[#152129]">
                  {source.domains.map((dom, i) => (
                    <span key={i} className="text-[9px] px-2 py-0.5 rounded bg-[#101c24] text-[#8e9ca4] border border-[#1b2b35]">
                      {dom}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Multi-Source Priority & Conflict Resolution Architecture Note */}
        <div className="mt-4 p-3 rounded-xl bg-[#091118] border border-[#1c272f]">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#7cf0a5] font-extrabold mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Стратегия приоритета и дедупликации</span>
          </div>
          <p className="text-[10px] text-[#8e9aa1] leading-relaxed">
            • <b>HRV и сон</b>: приоритет отдается первичному носимому трекеру (Whoop). Сессии сна не объединяются вслепую.<br />
            • <b>Тренировки</b>: импортированные сессии из Apple Health/Garmin сопоставляются по времени для исключения дублирования объема.
          </p>
        </div>
      </div>
    </div>
  );
}
