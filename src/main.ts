import './styles.css';
import { getEngine, isMicOn, onMicChange, startMic, stopMic } from './audio/engine';
import { readListening } from './audio/meter';
import { stopAll } from './audio/player';
import { createAttack } from './sections/attack';
import { createColors } from './sections/colors';
import { createLab } from './sections/lab';
import { createSameNote } from './sections/sameNote';
import { h, selectInGroup } from './ui/dom';
import { createMeterBar } from './ui/meterBar';
import { createSettings, readPreferences, savePreferences } from './ui/settings';
import { createSpectrum } from './ui/spectrum';

type TabId = 'som' | 'fundamento';

const APP_NAME = 'Timbrando';
const APP_VERSION = '0.2.0';
const TAB_LABELS: Record<TabId, string> = { som: 'Som', fundamento: 'Fundamento' };

const turnMicOn = async (): Promise<void> => {
  try {
    await startMic();
  } catch {
    savePreferences({ micOn: false });
  }
};

const createMicToggle = (): HTMLButtonElement => {
  const label = h('span', { class: 'mic-label' }, 'Microfone');
  const button = h('button', { type: 'button', class: 'mic-toggle', 'aria-pressed': 'false', title: 'Ligar ou desligar o microfone' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), '🎤 ', label);
  const render = (on: boolean): void => {
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Microfone ligado' : 'Microfone desligado');
  };
  onMicChange(render);
  button.addEventListener('click', () => {
    if (isMicOn()) {
      stopMic();
      savePreferences({ micOn: false });
      return;
    }
    savePreferences({ micOn: true });
    void turnMicOn();
  });
  return button;
};

const createTabs = (panels: Record<TabId, HTMLElement>, onShow: (tab: TabId) => void): HTMLElement => {
  const nav = h('nav', { class: 'tabs', role: 'tablist' });
  (Object.keys(TAB_LABELS) as TabId[]).forEach((tab) => {
    const button = h('button', { type: 'button', role: 'tab', 'aria-pressed': String(tab === 'som') }, TAB_LABELS[tab]);
    button.addEventListener('click', () => {
      stopAll();
      (Object.keys(panels) as TabId[]).forEach((id) => {
        panels[id].hidden = id !== tab;
      });
      selectInGroup(nav, button);
      onShow(tab);
      window.dispatchEvent(new Event('resize'));
      window.scrollTo({ top: 0 });
    });
    nav.append(button);
  });
  return nav;
};

const trackStickyHeight = (sticky: HTMLElement): void => {
  new ResizeObserver(() => document.documentElement.style.setProperty('--sticky-h', `${sticky.offsetHeight}px`)).observe(sticky);
};

const start = (): void => {
  const root = document.getElementById('app') as HTMLElement;
  const meter = createMeterBar();
  const spectrum = createSpectrum();
  const panels: Record<TabId, HTMLElement> = {
    som: h('main', { class: 'panel' }, createSameNote(), createAttack()),
    fundamento: h('main', { class: 'panel', hidden: true }, spectrum.element, createLab(), createColors()),
  };
  const settings = createSettings({ appName: APP_NAME, version: APP_VERSION, onHistoryChange: meter.showHistory });
  const tabs = createTabs(panels, (tab) => {
    meter.element.hidden = tab !== 'som';
  });
  const header = h(
    'div',
    { class: 'top-band' },
    h('header', { class: 'top' }, h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, '◐'), APP_NAME), tabs, createMicToggle(), settings),
  );
  const sticky = h('div', { class: 'sticky' }, header, meter.element);
  root.append(sticky, panels.som, panels.fundamento);
  trackStickyHeight(sticky);
  document.addEventListener('pointerdown', () => getEngine(), { once: true });
  if (readPreferences().micOn) {
    void turnMicOn();
  }
  const loop = (): void => {
    const listening = readListening();
    meter.update(listening.reading, listening.source);
    spectrum.update(listening.reading, listening.analyser);
    window.requestAnimationFrame(loop);
  };
  window.requestAnimationFrame(loop);
};

start();
