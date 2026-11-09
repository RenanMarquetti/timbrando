import { radioGroup } from './controls';
import { h } from './dom';

export type Theme = 'auto' | 'light' | 'dark';

type Preferences = {
  theme: Theme;
  showHistory: boolean;
  micOn: boolean;
};

type SettingsArgs = {
  appName: string;
  version: string;
  onHistoryChange: (show: boolean) => void;
};

const STORAGE_KEY = 'timbrando-preferences';
const DEFAULTS: Preferences = { theme: 'auto', showHistory: false, micOn: true };

export const readPreferences = (): Preferences => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULTS, ...(JSON.parse(saved) as Partial<Preferences>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

export const savePreferences = (change: Partial<Preferences>): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPreferences(), ...change }));
  } catch {
    return;
  }
};

export const applyTheme = (theme: Theme): void => {
  if (theme === 'auto') {
    delete document.documentElement.dataset.theme;
    return;
  }
  document.documentElement.dataset.theme = theme;
};

const credits = (): HTMLElement =>
  h(
    'div',
    { class: 'credits' },
    h('h3', {}, 'Créditos'),
    h('p', { class: 'small' }, 'Instrumentos da lista do MSA (Método Simplificado de Aprendizagem Musical), mais piano, violão e harpa por causa do começo do som. Do MSA ainda faltam gravações livres de oboé d’amore, corne inglês, clarinete alto e baixo, saxofones soprano, tenor e barítono, cornet, flugelhorn, trombonito, barítono e eufônio.'),
    h('p', { class: 'small' }, 'Gravações: ', h('a', { href: 'https://github.com/nbrosowsky/tonejs-instruments', target: '_blank', rel: 'noopener' }, 'tonejs-instruments'), ' (CC BY 3.0; VSCO 2, University of Iowa, Karoryfer, Freesound) e ', h('a', { href: 'https://github.com/sgossner/VSCO-2-CE', target: '_blank', rel: 'noopener' }, 'VSCO 2 Community Edition'), ' (CC0: viola e oboé). As vogais são sintetizadas pelo próprio app.'),
    h('p', { class: 'small' }, 'Receitas do laboratório: harmônicos de violino, viola, violoncelo, flauta, oboé, fagote, clarinete, trompete, trompa, trombone e tuba do ', h('a', { href: 'https://github.com/gregsandell/sharc', target: '_blank', rel: 'noopener' }, 'SHARC'), ', de Gregory Sandell (gravações McGill University Master Samples; uso sem fins lucrativos). Saxofone, órgão, piano, violão e harpa foram medidos pelo Timbrando nas gravações do app, com o mesmo método. Tempos de ataque: Luce e Clark (1965), Grobben (1967) e Guettler (2002); decaimento do piano: Weinreich (1977) e Askenfelt (1990).'),
    h('p', { class: 'small' }, 'Para ler mais: Fletcher e Rossing, The Physics of Musical Instruments (1998); Meyer, Acoustics and the Performance of Music (2009); Grey, Multidimensional perceptual scaling of musical timbres (JASA, 1977).'),
    h('p', { class: 'small' }, 'Detecção de altura: ', h('a', { href: 'https://github.com/ianprime0509/pitchy', target: '_blank', rel: 'noopener' }, 'pitchy'), '. Código aberto: ', h('a', { href: 'https://github.com/RenanMarquetti/timbrando', target: '_blank', rel: 'noopener' }, 'github.com/RenanMarquetti/timbrando'), '.'),
  );

/** Gear button plus the settings dialog (theme, history graph, credits). */
export const createSettings = (args: SettingsArgs): HTMLElement => {
  const preferences = readPreferences();
  applyTheme(preferences.theme);
  args.onHistoryChange(preferences.showHistory);
  const themes = radioGroup<Theme>({
    label: 'Tema',
    selected: preferences.theme,
    className: 'grid themes',
    options: [
      { value: 'auto', label: '◐ Automático' },
      { value: 'light', label: '☀ Claro' },
      { value: 'dark', label: '☾ Escuro' },
    ],
    onSelect: (theme) => {
      applyTheme(theme);
      savePreferences({ theme });
      window.dispatchEvent(new Event('resize'));
    },
  });
  const history = h('input', { type: 'checkbox', checked: preferences.showHistory });
  history.addEventListener('change', () => {
    args.onHistoryChange(history.checked);
    savePreferences({ showHistory: history.checked });
  });
  const dialog = h(
    'dialog',
    { class: 'settings', 'aria-label': 'Configurações' },
    h('div', { class: 'settings-head' }, h('h2', {}, 'Configurações'), h('button', { type: 'button', class: 'secondary small-button', onclick: () => dialog.close() }, 'Fechar')),
    h('h3', {}, 'Tema'),
    themes.element,
    h('h3', {}, 'Medidor'),
    h('label', { class: 'check' }, history, ' Mostrar o gráfico de altura e intensidade ao longo do tempo (aba Som)'),
    credits(),
    h('p', { class: 'muted small' }, `${args.appName} ${args.version}`),
  );
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
  const button = h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Configurações', title: 'Configurações', onclick: () => dialog.showModal() }, '⚙');
  return h('div', { class: 'settings-wrap' }, button, dialog);
};
