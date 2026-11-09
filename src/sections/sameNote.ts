import { getEngine } from '../audio/engine';
import { playBuffer, stopAll } from '../audio/player';
import { CLIP_SECONDS, hasNote, INSTRUMENTS, loadPrepared, type NoteName } from '../audio/samples';
import { loadVowel, VOWELS, type Vowel } from '../audio/vowels';
import { h, selectInGroup } from '../ui/dom';

type Sound = {
  key: string;
  label: string;
  load: (note: NoteName) => Promise<AudioBuffer>;
  available: (note: NoteName) => boolean;
};

const GAP_SECONDS = 0.5;

const vowelSounds: Sound[] = VOWELS.map((vowel: Vowel) => ({
  key: `vowel-${vowel}`,
  label: vowel.toUpperCase(),
  load: (note) => loadVowel(vowel, note),
  available: () => true,
}));

const instrumentSounds: Sound[] = INSTRUMENTS.map((instrument) => ({
  key: instrument.id,
  label: instrument.label,
  load: (note) => loadPrepared({ instrumentId: instrument.id, note }),
  available: (note) => hasNote(instrument.id, note),
}));

let sequenceTimer: number | null = null;

const clearSequence = (): void => {
  if (sequenceTimer !== null) {
    window.clearTimeout(sequenceTimer);
    sequenceTimer = null;
  }
};

const flash = (button: HTMLElement, seconds: number): void => {
  button.classList.add('playing');
  window.setTimeout(() => button.classList.remove('playing'), seconds * 1000);
};

/** Part 1, block 1: same note, same strength, same length. Only the color changes. */
export const createSameNote = (): HTMLElement => {
  let note: NoteName = 'A3';
  const buttons = new Map<string, HTMLButtonElement>();
  const play = async (sound: Sound): Promise<void> => {
    getEngine();
    clearSequence();
    stopAll();
    const buffer = await sound.load(note);
    playBuffer({ buffer });
    const button = buttons.get(sound.key);
    if (button) {
      flash(button, CLIP_SECONDS);
    }
  };
  const playSequence = (sounds: Sound[]): void => {
    const playable = sounds.filter((sound) => sound.available(note));
    clearSequence();
    const step = (index: number): void => {
      if (index >= playable.length) {
        return;
      }
      void play(playable[index]).then(() => {
        sequenceTimer = window.setTimeout(() => step(index + 1), (CLIP_SECONDS + GAP_SECONDS) * 1000);
      });
    };
    step(0);
  };
  const soundButton = (sound: Sound, extraClass: string): HTMLButtonElement => {
    const button = h('button', { type: 'button', class: `sound ${extraClass}` }, sound.label);
    button.addEventListener('click', () => void play(sound));
    buttons.set(sound.key, button);
    return button;
  };
  const refreshAvailability = (): void => {
    [...vowelSounds, ...instrumentSounds].forEach((sound) => {
      const button = buttons.get(sound.key);
      if (button) {
        button.disabled = !sound.available(note);
      }
    });
  };
  const noteGroup = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Nota' });
  const noteButton = (value: NoteName, label: string): HTMLButtonElement => {
    const button = h('button', { type: 'button', 'aria-pressed': String(note === value) }, label);
    button.addEventListener('click', () => {
      note = value;
      selectInGroup(noteGroup, button);
      refreshAvailability();
    });
    return button;
  };
  noteGroup.append(noteButton('A3', 'Lá 220 Hz'), noteButton('A4', 'Lá 440 Hz'));
  const vowelRow = h('div', { class: 'grid vowels' }, ...vowelSounds.map((sound) => soundButton(sound, 'vowel')));
  const instrumentRow = h('div', { class: 'grid' }, ...instrumentSounds.map((sound) => soundButton(sound, '')));
  const sequenceButton = (label: string, sounds: Sound[]): HTMLButtonElement =>
    h('button', { type: 'button', class: 'secondary', onclick: () => playSequence(sounds) }, label);
  const stopButton = h('button', { type: 'button', class: 'secondary', onclick: () => { clearSequence(); stopAll(); } }, '■ Parar');
  refreshAvailability();
  return h(
    'section',
    { class: 'card', id: 'mesma-nota' },
    h('h2', {}, 'Mesma nota, mesma força'),
    h('p', { class: 'prompt' }, 'Escute e olhe o medidor lá em cima. O que muda de um som para o outro?'),
    h('div', { class: 'toolbar' }, noteGroup, stopButton),
    h('h3', {}, 'Vogais'),
    vowelRow,
    h('div', { class: 'toolbar' }, sequenceButton('▶ Todas as vogais', vowelSounds)),
    h('h3', {}, 'Instrumentos'),
    instrumentRow,
    h('div', { class: 'toolbar' }, sequenceButton('▶ Todos os instrumentos', instrumentSounds)),
  );
};
