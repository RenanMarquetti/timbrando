import data from './instrumentSpectra.json';

export type SpectrumSource = 'sharc' | 'timbrando';

type SpectrumPoint = {
  midi: number;
  harmonics: number[];
  attack?: number;
  decay?: number;
};

type InstrumentData = {
  source: SpectrumSource;
  points: SpectrumPoint[];
};

type SpectrumForArgs = {
  instrumentId: string;
  midi: number;
};

export type NoteRecipe = SpectrumPoint & {
  source: SpectrumSource;
  inRange: boolean;
};

const SPECTRA = data as Record<string, InstrumentData>;

/** The measured harmonic recipe of an instrument at a note (the nearest measured note when outside its range). */
export const spectrumFor = (args: SpectrumForArgs): NoteRecipe | null => {
  const instrument = SPECTRA[args.instrumentId];
  if (!instrument) {
    return null;
  }
  const nearest = instrument.points.reduce((best, point) => (Math.abs(point.midi - args.midi) < Math.abs(best.midi - args.midi) ? point : best));
  return { ...nearest, source: instrument.source, inRange: Math.abs(nearest.midi - args.midi) <= 1 };
};
