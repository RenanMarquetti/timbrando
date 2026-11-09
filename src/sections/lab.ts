import { getEngine } from '../audio/engine';
import { playBuffer, stopAll } from '../audio/player';
import { hasNote, loadPrepared } from '../audio/samples';
import { HARMONIC_COUNT, startNote, waveShape, type SynthNote, type SynthParams } from '../audio/synth';
import { DEFAULT_PARAMS, PRESETS, WAVES, type WaveName } from '../audio/synthPresets';
import { midiToHz } from '../audio/vowels';
import { noteName, radioGroup, toggleButton } from '../ui/controls';
import { cssVar, fitCanvas, h } from '../ui/dom';
import { drawEnvelope, drawFilter } from '../ui/graphs';

type NumericKey = Exclude<keyof SynthParams, 'harmonics' | 'signs'>;

type SliderSpec = {
  key: NumericKey;
  label: string;
  help: string;
  min: number;
  max: number;
  log?: boolean;
  format: (value: number) => string;
};

type WhiteKey = {
  midi: number;
  black: number | null;
};

const SLIDER_STEPS = 1000;
const WAVE_POINTS = 400;
const ICON_POINTS = 60;
const BASE_MIDI = 60;
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK_AFTER = [0, 1, 3, 4, 5];
const CUSTOM_WAVE = 'Personalizada: você montou a sua própria receita de harmônicos.';

const seconds = (value: number): string => (value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2).replace('.', ',')} s`);
const percent = (value: number): string => `${Math.round(value * 100)}%`;

const ENVELOPE: SliderSpec[] = [
  { key: 'attack', label: 'Ataque', help: 'Quanto tempo o som leva para chegar ao volume máximo. Curto = golpe (piano, violão); longo = entra devagar (arco, sopro suave).', min: 0.003, max: 1.5, log: true, format: seconds },
  { key: 'decay', label: 'Queda', help: 'Quanto tempo leva para cair do máximo até o volume de sustentação.', min: 0.01, max: 2, log: true, format: seconds },
  { key: 'sustain', label: 'Sustentação', help: 'O volume que fica enquanto a tecla está apertada. 0% = a nota morre sozinha, como no piano e no violão.', min: 0, max: 1, format: percent },
  { key: 'release', label: 'Final', help: 'Quanto tempo o som leva para sumir depois que você solta a tecla.', min: 0.01, max: 3, log: true, format: seconds },
  { key: 'noise', label: 'Ruído do começo', help: 'O chiado que existe no instante em que a nota nasce: o sopro na flauta, o arco raspando na corda, o martelo no piano.', min: 0, max: 1, format: percent },
];

const FILTER: SliderSpec[] = [
  { key: 'cutoff', label: 'Abafamento', help: 'A partir dessa frequência os harmônicos vão sendo cortados. Mais à esquerda = mais abafado, como tocar com surdina ou ouvir de outra sala.', min: 150, max: 16000, log: true, format: (value) => `corta acima de ${Math.round(value)} Hz` },
  { key: 'resonance', label: 'Ressonância', help: 'Realça os harmônicos bem no ponto do corte. Valores altos deixam o som anasalado, como um "uá".', min: 0.5, max: 15, log: true, format: (value) => value.toFixed(1).replace('.', ',') },
  { key: 'filterOpening', label: 'Abrir no começo', help: 'A nota começa mais abafada e vai abrindo logo depois do ataque, como o "uá" de um trompete ou trombone.', min: 0, max: 1, format: percent },
];

const VIBRATO: SliderSpec[] = [
  { key: 'vibratoRate', label: 'Velocidade', help: 'Quantas vezes por segundo a afinação balança. Cantores e violinistas costumam usar de 5 a 7.', min: 0.5, max: 9, format: (value) => `${value.toFixed(1).replace('.', ',')} vezes por segundo` },
  { key: 'vibratoDepth', label: 'Profundidade', help: 'Quanto a afinação sobe e desce. Em cents: 100 cents = meio tom. Zero = sem vibrato.', min: 0, max: 60, format: (value) => `${Math.round(value)} cents` },
];

const toSlider = (spec: SliderSpec, value: number): number => {
  if (spec.log) {
    return (Math.log(value / spec.min) / Math.log(spec.max / spec.min)) * SLIDER_STEPS;
  }
  return ((value - spec.min) / (spec.max - spec.min)) * SLIDER_STEPS;
};

const fromSlider = (spec: SliderSpec, position: number): number => {
  const fraction = position / SLIDER_STEPS;
  if (spec.log) {
    return spec.min * (spec.max / spec.min) ** fraction;
  }
  return spec.min + fraction * (spec.max - spec.min);
};

const copyParams = (params: SynthParams): SynthParams => ({ ...params, harmonics: [...params.harmonics], signs: [...params.signs] });

const SHAPE_LEFT = 74;
const SHAPE_BOTTOM = 26;

const formatPeriod = (fundamental: number): string => `${(1000 / fundamental).toFixed(1).replace('.', ',')} ms`;

/** One wave drawn with meaning on both axes: x = time (two cycles), y = air pushed (up) or pulled back (down). */
const drawShape = (canvas: HTMLCanvasElement, params: SynthParams, fundamental: number): void => {
  const context = fitCanvas(canvas);
  const width = canvas.clientWidth - SHAPE_LEFT - 8;
  const height = canvas.clientHeight - SHAPE_BOTTOM;
  const middle = height / 2;
  const shape = waveShape(params, WAVE_POINTS);
  const xAt = (index: number): number => SHAPE_LEFT + (index / (WAVE_POINTS * 2)) * width;
  context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  context.font = '11px system-ui, sans-serif';
  context.fillStyle = cssVar('--muted');
  context.textAlign = 'right';
  context.fillText('empurra ↑', SHAPE_LEFT - 8, 14);
  context.fillText('ar parado', SHAPE_LEFT - 8, middle + 4);
  context.fillText('puxa ↓', SHAPE_LEFT - 8, height - 4);
  context.strokeStyle = cssVar('--line');
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(SHAPE_LEFT, middle);
  context.lineTo(SHAPE_LEFT + width, middle);
  context.moveTo(SHAPE_LEFT + width / 2, 4);
  context.lineTo(SHAPE_LEFT + width / 2, height);
  context.stroke();
  context.strokeStyle = cssVar('--muted');
  context.beginPath();
  context.moveTo(SHAPE_LEFT, 0);
  context.lineTo(SHAPE_LEFT, height);
  context.lineTo(SHAPE_LEFT + width, height);
  context.stroke();
  context.textAlign = 'center';
  context.fillText(`1 ciclo = ${formatPeriod(fundamental)}`, SHAPE_LEFT + width / 4, height + 14);
  context.fillText(`2º ciclo`, SHAPE_LEFT + (width * 3) / 4, height + 14);
  context.textAlign = 'right';
  context.fillText('tempo →', SHAPE_LEFT + width, height + 24);
  context.textAlign = 'left';
  context.strokeStyle = cssVar('--accent');
  context.lineWidth = 2.5;
  context.beginPath();
  [...shape, ...shape].forEach((value, index) => {
    const y = middle - value * (middle - 6);
    if (index === 0) {
      context.moveTo(xAt(index), y);
      return;
    }
    context.lineTo(xAt(index), y);
  });
  context.stroke();
};

const waveIcon = (name: WaveName): SVGSVGElement => {
  const shape = waveShape({ ...DEFAULT_PARAMS, harmonics: WAVES[name].harmonics, signs: WAVES[name].signs }, ICON_POINTS);
  const points = [...shape, ...shape].map((value, index) => `${(index / (ICON_POINTS * 2)) * 60},${12 - value * 10}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 60 24');
  svg.setAttribute('class', 'wave-icon');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', points);
  svg.append(line);
  return svg;
};

const whiteKeys = (): WhiteKey[] =>
  WHITE_OFFSETS.map((offset, index) => ({ midi: BASE_MIDI + offset, black: BLACK_AFTER.includes(index) ? BASE_MIDI + offset + 1 : null }));

/** Part 2: build timbres by hand, with every control explained. */
export const createLab = (): HTMLElement => {
  let params: SynthParams = copyParams(DEFAULT_PARAMS);
  let octaveShift = 0;
  let sustainMode = false;
  let held: { midi: number; note: SynthNote } | null = null;
  let lastMidi = BASE_MIDI;
  let presetId: string | null = null;
  const pressed = new Set<SynthNote>();
  const harmonicInputs: HTMLInputElement[] = [];
  const sliderInputs = new Map<NumericKey, { input: HTMLInputElement; output: HTMLElement; spec: SliderSpec }>();
  const shapeCanvas = h('canvas', { class: 'shape' });
  const envelopeCanvas = h('canvas', { class: 'graph' });
  const filterCanvas = h('canvas', { class: 'graph' });
  const waveText = h('p', { class: 'help wave-text' }, '');
  const keyButtons = new Map<number, HTMLButtonElement>();
  const redraw = (): void => {
    drawShape(shapeCanvas, params, midiToHz(lastMidi + octaveShift * 12));
    drawEnvelope(envelopeCanvas, params);
    drawFilter(filterCanvas, params, midiToHz(lastMidi + octaveShift * 12));
  };
  const liveUpdate = (): void => {
    held?.note.update(params);
    pressed.forEach((note) => note.update(params));
    redraw();
  };
  const syncControls = (): void => {
    harmonicInputs.forEach((input, index) => {
      input.value = String(Math.round(params.harmonics[index] * 100));
    });
    sliderInputs.forEach(({ input, output, spec }) => {
      input.value = String(Math.round(toSlider(spec, params[spec.key])));
      output.textContent = spec.format(params[spec.key]);
    });
    liveUpdate();
  };
  const describeWave = (name: WaveName | null): void => {
    if (!name) {
      waveText.replaceChildren(CUSTOM_WAVE);
      return;
    }
    waveText.replaceChildren(h('strong', {}, `${WAVES[name].label}: `), WAVES[name].what, ' ', h('em', {}, WAVES[name].like));
  };
  const waves = radioGroup<WaveName>({
    label: 'Onda geradora',
    selected: 'sawtooth',
    className: 'grid waves',
    options: (Object.keys(WAVES) as WaveName[]).map((name) => {
      const label = h('span', { class: 'wave-label' });
      label.append(waveIcon(name), WAVES[name].label);
      return { value: name, label };
    }),
    onSelect: (name) => {
      params = { ...params, harmonics: [...WAVES[name].harmonics], signs: [...WAVES[name].signs] };
      describeWave(name);
      syncControls();
    },
  });
  const realButton = h('button', { type: 'button', class: 'secondary', disabled: true }, '▶ Ouvir o instrumento real');
  const presets = radioGroup<string>({
    label: 'Imitar um instrumento',
    selected: null,
    options: PRESETS.map((preset) => ({ value: preset.id, label: preset.label, title: preset.family })),
    onSelect: (id) => {
      const preset = PRESETS.find((item) => item.id === id);
      if (!preset) {
        return;
      }
      presetId = id;
      params = copyParams(preset.params);
      waves.select(null);
      describeWave(null);
      realButton.disabled = false;
      syncControls();
    },
  });
  const playReal = async (): Promise<void> => {
    if (!presetId) {
      return;
    }
    getEngine();
    stopAll();
    held = null;
    keyButtons.forEach((button) => button.classList.remove('down'));
    const midi = lastMidi + octaveShift * 12;
    const target = hasNote(presetId, midi) ? midi : [57, 69, 60].find((candidate) => presetId !== null && hasNote(presetId, candidate));
    if (target === undefined) {
      return;
    }
    playBuffer({ buffer: await loadPrepared({ instrumentId: presetId, midi: target }) });
  };
  realButton.addEventListener('click', () => void playReal());
  const markCustom = (): void => {
    waves.select(null);
    describeWave(null);
  };
  const harmonicSlider = (index: number): HTMLElement => {
    const input = h('input', { type: 'range', min: 0, max: 100, value: 0, class: 'vertical', 'aria-label': `Harmônico ${index + 1}` });
    input.addEventListener('input', () => {
      params = { ...params, harmonics: params.harmonics.map((value, position) => (position === index ? Number(input.value) / 100 : value)) };
      markCustom();
      liveUpdate();
    });
    harmonicInputs.push(input);
    return h('label', { class: 'harmonic' }, input, h('span', {}, String(index + 1)));
  };
  const specSlider = (spec: SliderSpec): HTMLElement => {
    const output = h('output', {}, '');
    const input = h('input', { type: 'range', min: 0, max: SLIDER_STEPS, value: 0, 'aria-label': spec.label });
    input.addEventListener('input', () => {
      params = { ...params, [spec.key]: fromSlider(spec, Number(input.value)) };
      output.textContent = spec.format(params[spec.key]);
      liveUpdate();
    });
    sliderInputs.set(spec.key, { input, output, spec });
    return h('label', { class: 'param' }, h('span', { class: 'param-name' }, spec.label, ' ', output), input, h('small', { class: 'help' }, spec.help));
  };
  const stopHeld = (): void => {
    held?.note.release();
    keyButtons.get(held?.midi ?? -1)?.classList.remove('down');
    held = null;
  };
  const pressKey = (midi: number, button: HTMLButtonElement): (() => void) | null => {
    getEngine();
    lastMidi = midi - octaveShift * 12;
    redraw();
    if (sustainMode) {
      const same = held?.midi === midi;
      stopHeld();
      if (!same) {
        held = { midi, note: startNote(params, midiToHz(midi)) };
        button.classList.add('down');
      }
      return null;
    }
    const note = startNote(params, midiToHz(midi));
    pressed.add(note);
    button.classList.add('down');
    return () => {
      note.release();
      pressed.delete(note);
      button.classList.remove('down');
    };
  };
  const keyButton = (midi: number, black: boolean, style: string): HTMLButtonElement => {
    const label = black ? '' : noteName(midi).split(' ')[0];
    const button = h('button', { type: 'button', class: black ? 'key black' : 'key', style, 'aria-label': noteName(midi) }, label);
    let release: (() => void) | null = null;
    const end = (): void => {
      release?.();
      release = null;
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      release = pressKey(midi, button);
    });
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
    keyButtons.set(midi, button);
    return button;
  };
  const keyboard = h('div', { class: 'piano', role: 'group', 'aria-label': 'Teclado' });
  const renderKeys = (): void => {
    stopHeld();
    keyButtons.clear();
    const keys = whiteKeys();
    const width = 100 / keys.length;
    const whites = keys.map((key) => keyButton(key.midi + octaveShift * 12, false, `width:${width}%`));
    const blacks = keys.flatMap((key, index) => (key.black === null ? [] : [keyButton(key.black + octaveShift * 12, true, `left:${(index + 1) * width - width * 0.3}%;width:${width * 0.6}%`)]));
    keyboard.replaceChildren(...whites, ...blacks);
  };
  const octaveLabel = h('span', { class: 'muted' }, '');
  const setOctave = (shift: number): void => {
    octaveShift = Math.max(-1, Math.min(1, shift));
    octaveLabel.textContent = `${noteName(BASE_MIDI + octaveShift * 12)} a ${noteName(BASE_MIDI + 12 + octaveShift * 12)}`;
    renderKeys();
    redraw();
  };
  const adjustments = h(
    'div',
    { class: 'adjustments', hidden: true },
    h('p', { class: 'help' }, 'Estes ajustes são o jeito de tocar a nota. Ao escolher um instrumento em "Imitar um instrumento", eles mudam junto, porque cada instrumento começa, sustenta e termina a nota de um jeito.'),
    h(
      'div',
      { class: 'columns' },
      h(
        'div',
        {},
        h('h3', {}, 'Começo, meio e fim da nota'),
        h('p', { class: 'help' }, 'O gráfico mostra o volume de uma nota ao longo do tempo: sobe no ataque, cai um pouco na queda, fica na sustentação enquanto a tecla está apertada e some no final.'),
        envelopeCanvas,
        ...ENVELOPE.map(specSlider),
      ),
      h(
        'div',
        {},
        h('h3', {}, 'Abafamento'),
        h('p', { class: 'help' }, 'O gráfico mostra quanto de cada frequência passa. Os pontos azuis são os harmônicos da última nota tocada: os que caem na parte baixa da curva ficam abafados.'),
        filterCanvas,
        ...FILTER.map(specSlider),
        h('h3', {}, 'Vibrato'),
        h('p', { class: 'help' }, 'Um balanço pequeno e regular na afinação, como o do cantor ou do violinista.'),
        ...VIBRATO.map(specSlider),
      ),
    ),
  );
  const adjustToggle = toggleButton('⚙ Ajustes da nota', (on) => {
    adjustments.hidden = !on;
    redraw();
  });
  adjustToggle.classList.add('no-dot');
  const sustainToggle = toggleButton('♪ Sustentar nota', (on) => {
    sustainMode = on;
    if (!on) {
      stopHeld();
    }
  });
  setOctave(0);
  describeWave('sawtooth');
  window.requestAnimationFrame(syncControls);
  new ResizeObserver(redraw).observe(shapeCanvas);
  return h(
    'section',
    { class: 'card', id: 'laboratorio' },
    h('h2', {}, 'Laboratório de timbres'),
    h('p', { class: 'prompt' }, 'Toque no teclado. Com "Sustentar nota" ligado, a tecla fica soando: outra tecla troca a nota, a mesma tecla para. Mexa em tudo abaixo enquanto o som toca.'),
    h(
      'div',
      { class: 'toolbar' },
      sustainToggle,
      h('button', { type: 'button', class: 'secondary', onclick: () => setOctave(octaveShift - 1) }, '− oitava'),
      octaveLabel,
      h('button', { type: 'button', class: 'secondary', onclick: () => setOctave(octaveShift + 1) }, '+ oitava'),
      adjustToggle,
    ),
    adjustments,
    keyboard,
    h('h3', {}, 'Onda geradora'),
    h('p', { class: 'help' }, 'O ponto de partida do som. Cada onda já vem com uma receita de harmônicos diferente.'),
    waves.element,
    waveText,
    h('h3', {}, 'Imitar um instrumento'),
    h('p', { class: 'help' }, 'Receitas aproximadas para os instrumentos do MSA. Escolha um, toque no teclado e compare com a gravação real.'),
    presets.element,
    h('div', { class: 'toolbar' }, realButton),
    h('h3', {}, 'Harmônicos'),
    h('p', { class: 'help' }, 'Cada barra é a força de um harmônico. O 1 é a nota que você ouve (a fundamental); o 2 soa uma oitava acima, o 3 uma quinta acima disso, e assim por diante.'),
    h('div', { class: 'harmonics' }, ...Array.from({ length: HARMONIC_COUNT }, (_, index) => harmonicSlider(index))),
    h(
      'div',
      { class: 'toolbar' },
      h('button', { type: 'button', class: 'secondary', onclick: () => { params = { ...params, harmonics: params.harmonics.map((value, index) => (index % 2 === 1 ? 0 : value)) }; markCustom(); syncControls(); } }, 'Tirar os pares'),
      h('button', { type: 'button', class: 'secondary', onclick: () => { params = { ...params, harmonics: params.harmonics.map((value, index) => (index === 0 ? value : value * 0.5)) }; markCustom(); syncControls(); } }, 'Enfraquecer os agudos'),
    ),
    h('p', { class: 'help' }, 'A forma da onda mostra como o ar vibra com essa receita, em dois ciclos: acima da linha do meio o ar é empurrado na direção do ouvido (empurra); abaixo, é puxado de volta (puxa). Cada ciclo dura 1 ÷ a frequência da nota.'),
    shapeCanvas,
  );
};
