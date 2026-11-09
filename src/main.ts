import './styles.css';
import { getActiveAnalyser, getEngine } from './audio/engine';
import { readAnalyser } from './audio/meter';
import { createAttack } from './sections/attack';
import { createColors } from './sections/colors';
import { createLab } from './sections/lab';
import { createSameNote } from './sections/sameNote';
import { h, selectInGroup } from './ui/dom';
import { createMeterBar } from './ui/meterBar';
import { createSpectrum } from './ui/spectrum';

type TabId = 'ouvir' | 'laboratorio' | 'sobre';

const APP_NAME = 'Timbrando';

const createAbout = (): HTMLElement =>
  h(
    'section',
    { class: 'card' },
    h('h2', {}, `Sobre o ${APP_NAME}`),
    h('p', {}, 'Feito para aulas de música: primeiro ouvir, depois nomear.'),
    h('p', {}, h('strong', {}, 'Ouvir'), ': sons com a mesma altura, a mesma intensidade e a mesma duração. O medidor no topo mostra isso enquanto o som toca.'),
    h('p', {}, h('strong', {}, 'Laboratório'), ': o espectro e um sintetizador para montar timbres mexendo nos harmônicos, no começo do som e no abafamento.'),
    h('h3', {}, 'Créditos dos sons'),
    h('p', { class: 'small' }, 'Amostras de instrumentos: ', h('a', { href: 'https://github.com/nbrosowsky/tonejs-instruments', target: '_blank', rel: 'noopener' }, 'tonejs-instruments'), ' (Nicholaus Brosowsky), licença CC BY 3.0, a partir de VSCO 2 Community Edition, University of Iowa Electronic Music Studios, Karoryfer e Freesound (flcellogrl, quartertone, donyaquick). As vogais são sintetizadas pelo próprio app.'),
    h('p', { class: 'small' }, 'Detecção de altura: ', h('a', { href: 'https://github.com/ianprime0509/pitchy', target: '_blank', rel: 'noopener' }, 'pitchy'), ' (0BSD).'),
  );

const createTabs = (panels: Record<TabId, HTMLElement>): HTMLElement => {
  const nav = h('nav', { class: 'tabs', role: 'tablist' });
  const labels: Record<TabId, string> = { ouvir: 'Ouvir', laboratorio: 'Laboratório', sobre: 'Sobre' };
  const show = (tab: TabId, button: HTMLElement): void => {
    (Object.keys(panels) as TabId[]).forEach((id) => {
      panels[id].hidden = id !== tab;
    });
    selectInGroup(nav, button);
    window.dispatchEvent(new Event('resize'));
    window.scrollTo({ top: 0 });
  };
  (Object.keys(labels) as TabId[]).forEach((tab) => {
    const button = h('button', { type: 'button', role: 'tab', 'aria-pressed': String(tab === 'ouvir') }, labels[tab]);
    button.addEventListener('click', () => show(tab, button));
    nav.append(button);
  });
  return nav;
};

const start = (): void => {
  const root = document.getElementById('app') as HTMLElement;
  const meter = createMeterBar();
  const spectrum = createSpectrum();
  const panels: Record<TabId, HTMLElement> = {
    ouvir: h('main', { class: 'panel' }, createSameNote(), createColors(), createAttack()),
    laboratorio: h('main', { class: 'panel', hidden: true }, createLab(spectrum)),
    sobre: h('main', { class: 'panel', hidden: true }, createAbout()),
  };
  const header = h('header', { class: 'top' }, h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, '◐'), APP_NAME), createTabs(panels));
  root.append(h('div', { class: 'sticky' }, header, meter.element), panels.ouvir, panels.laboratorio, panels.sobre);
  document.addEventListener('pointerdown', () => getEngine(), { once: true });
  const loop = (): void => {
    const reading = readAnalyser(getActiveAnalyser());
    meter.update(reading);
    spectrum.update(reading);
    window.requestAnimationFrame(loop);
  };
  document.addEventListener('pointerdown', () => window.requestAnimationFrame(loop), { once: true });
};

start();
