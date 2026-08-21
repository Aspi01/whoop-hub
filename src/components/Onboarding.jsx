import React, { useState } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { api } from '../services/api.js';
import './Onboarding.css';

export default function Onboarding({ onComplete }) {
  const { locale, setLocale, t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0); // 0: language, 1: brand, 2: context, 3: intelligence, 4: sources

  const handleFinish = () => {
    try {
      localStorage.setItem('onboarding_completed', 'true');
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('reset_onboarding')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {}
    if (typeof onComplete === 'function') {
      onComplete();
    }
  };

  const handleConnectWhoop = async () => {
    try {
      handleFinish();
      const res = await api.getWhoopOAuthUrl();
      if (res.success && res.authUrl) {
        window.location.href = res.authUrl;
      }
    } catch (err) {
      console.warn('OAuth URL fetch note:', err);
    }
  };

  return (
    <div className="onboarding-root">
      <div className="onboarding-phone">
        {/* Screen 0: Language Selection */}
        {currentStep === 0 && (
          <section className="ob-screen" id="language">
            <div className="ob-top">
              <div className="ob-wordmark">WHOOP HUB</div>
            </div>
            <div className="ob-langHero">
              <div className="ob-eyebrow">{t('langEyebrow')}</div>
              <h1>{t('langHead')}</h1>
              <div className="ob-langList" role="radiogroup" aria-label={t('langEyebrow')}>
                <div
                  className={`ob-langRow ${locale === 'en' ? 'selected' : ''}`}
                  data-lang="en"
                  role="radio"
                  aria-checked={locale === 'en'}
                  tabIndex={0}
                  onClick={() => setLocale('en')}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLocale('en')}
                >
                  <div>
                    <strong>English</strong>
                    <small>EN</small>
                  </div>
                  <div className="ob-circle">{locale === 'en' ? '✓' : ''}</div>
                </div>

                <div
                  className={`ob-langRow ${locale === 'ru' ? 'selected' : ''}`}
                  data-lang="ru"
                  role="radio"
                  aria-checked={locale === 'ru'}
                  tabIndex={0}
                  onClick={() => setLocale('ru')}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLocale('ru')}
                >
                  <div>
                    <strong>Русский</strong>
                    <small>RU</small>
                  </div>
                  <div className="ob-circle">{locale === 'ru' ? '✓' : ''}</div>
                </div>

                <div
                  className={`ob-langRow ${locale === 'uk' ? 'selected' : ''}`}
                  data-lang="uk"
                  role="radio"
                  aria-checked={locale === 'uk'}
                  tabIndex={0}
                  onClick={() => setLocale('uk')}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLocale('uk')}
                >
                  <div>
                    <strong>Українська</strong>
                    <small>UA</small>
                  </div>
                  <div className="ob-circle">{locale === 'uk' ? '✓' : ''}</div>
                </div>
              </div>
              <div className="ob-note">{t('langNote')}</div>
            </div>
            <div className="ob-bottom">
              <button
                type="button"
                className="ob-primary"
                style={{ width: '100%' }}
                onClick={() => setCurrentStep(1)}
              >
                {t('continue')}
              </button>
            </div>
          </section>
        )}

        {/* Screen 1: Brand Promise */}
        {currentStep === 1 && (
          <section className="ob-screen" id="s1">
            <div className="ob-top">
              <div className="ob-wordmark">WHOOP HUB</div>
              <div className="ob-step">01 / 04</div>
            </div>
            <div className="ob-hero">
              {/* EXACT INVARIANT: Main headline is ALWAYS English */}
              <div className="ob-display">
                YOUR BODY<br />
                HAS A <span className="accent">PATTERN.</span>
              </div>
              <div className="ob-body">{t('s1body')}</div>
              <div className="ob-brandline">{t('s1brandline')}</div>
              <div className="ob-bigQuote">{t('s1quote')}</div>
              <div className="ob-microcopy">{t('s1micro')}</div>
            </div>
            <div className="ob-bottom">
              <div className="ob-progress">
                <i style={{ width: '25%' }} />
              </div>
              <div className="ob-actions">
                <button
                  type="button"
                  className="ob-back"
                  aria-label={t('back')}
                  onClick={() => setCurrentStep(0)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="ob-primary"
                  onClick={() => setCurrentStep(2)}
                >
                  {t('continue')}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Screen 2: Context */}
        {currentStep === 2 && (
          <section className="ob-screen" id="s2">
            <div className="ob-top">
              <div className="ob-wordmark">WHOOP HUB</div>
              <div className="ob-step">02 / 04</div>
            </div>
            <div className="ob-hero">
              <div className="ob-eyebrow">{t('contextEyebrow')}</div>
              <div className="ob-display">{t('s2head')}</div>
              <div className="ob-body">{t('s2body')}</div>
              <div className="ob-statement">
                <div className="ob-statementRow">
                  <span>{t('sleep')}</span>
                  <b>{t('sleepLine')}</b>
                  <em>↘</em>
                </div>
                <div className="ob-statementRow">
                  <span>{t('training')}</span>
                  <b>{t('trainLine')}</b>
                  <em>↘</em>
                </div>
                <div className="ob-statementRow">
                  <span>{t('nutrition')}</span>
                  <b>{t('foodLine')}</b>
                  <em>↘</em>
                </div>
                <div className="ob-statementRow">
                  <span>{t('habits')}</span>
                  <b>{t('habitLine')}</b>
                  <em>↘</em>
                </div>
                <div className="ob-statementRow good">
                  <span>TODAY</span>
                  <b>{t('todayLine')}</b>
                  <em>●</em>
                </div>
              </div>
            </div>
            <div className="ob-bottom">
              <div className="ob-progress">
                <i style={{ width: '50%' }} />
              </div>
              <div className="ob-actions">
                <button
                  type="button"
                  className="ob-back"
                  aria-label={t('back')}
                  onClick={() => setCurrentStep(1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="ob-primary"
                  onClick={() => setCurrentStep(3)}
                >
                  {t('continue')}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Screen 3: Personal Intelligence */}
        {currentStep === 3 && (
          <section className="ob-screen" id="s3">
            <div className="ob-top">
              <div className="ob-wordmark">WHOOP HUB</div>
              <div className="ob-step">03 / 04</div>
            </div>
            <div className="ob-hero">
              <div className="ob-eyebrow">{t('intelEyebrow')}</div>
              <div className="ob-display">
                <span>{t('s3a')}</span>
                <br />
                <span className="accent">{t('s3b')}</span>
              </div>
              <div className="ob-body">{t('s3body')}</div>

              <div className="ob-scoreLine">
                <div className="num">78</div>
                <div className="label">{t('dailyForm')}</div>
              </div>
              <div className="ob-split">
                <div className="ob-metric">
                  <small>{t('changed')}</small>
                  <b>-8%</b>
                  <div className="sub">{t('changedSub')}</div>
                </div>
                <div className="ob-metric">
                  <small>{t('why')}</small>
                  <b>{t('whyValue')}</b>
                  <div className="sub">{t('whySub')}</div>
                </div>
              </div>
              <div className="ob-rule" />
              <div className="ob-kicker">
                <i className="ob-dot" />
                <span>{t('actionLine')}</span>
              </div>
              <div className="ob-microcopy">{t('trust')}</div>
            </div>
            <div className="ob-bottom">
              <div className="ob-progress">
                <i style={{ width: '75%' }} />
              </div>
              <div className="ob-actions">
                <button
                  type="button"
                  className="ob-back"
                  aria-label={t('back')}
                  onClick={() => setCurrentStep(2)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="ob-primary"
                  onClick={() => setCurrentStep(4)}
                >
                  {t('continue')}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Screen 4: Data Sources */}
        {currentStep === 4 && (
          <section className="ob-screen" id="s4">
            <div className="ob-top">
              <div className="ob-wordmark">WHOOP HUB</div>
              <div className="ob-step">04 / 04</div>
            </div>
            <div className="ob-hero" style={{ marginTop: '40px' }}>
              <div className="ob-eyebrow">{t('sourcesEyebrow')}</div>
              <div className="ob-display">{t('s4head')}</div>
              <div className="ob-body">{t('s4body')}</div>
              <div className="ob-sources">
                <div className="ob-source">
                  <div>
                    <strong>Whoop</strong>
                    <small>{t('whoop')}</small>
                  </div>
                  <div className="ob-badge ready">{t('connect')}</div>
                </div>
                <div className="ob-source">
                  <div>
                    <strong>Apple Health</strong>
                    <small>{t('apple')}</small>
                  </div>
                  <div className="ob-badge">{t('ios')}</div>
                </div>
                <div className="ob-source">
                  <div>
                    <strong>Garmin</strong>
                    <small>{t('garmin')}</small>
                  </div>
                  <div className="ob-badge">{t('soon')}</div>
                </div>
                <div className="ob-source">
                  <div>
                    <strong>Health Connect</strong>
                    <small>{t('healthconnect')}</small>
                  </div>
                  <div className="ob-badge">{t('soon')}</div>
                </div>
              </div>
            </div>
            <div className="ob-bottom">
              <div className="ob-progress">
                <i style={{ width: '100%' }} />
              </div>
              <button
                type="button"
                className="ob-primary"
                style={{ width: '100%' }}
                onClick={handleConnectWhoop}
              >
                {t('connectWhoop')}
              </button>
              <button
                type="button"
                className="ob-secondary"
                onClick={handleFinish}
              >
                {t('skip')}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
