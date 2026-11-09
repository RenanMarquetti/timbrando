export type ListenSource = 'app' | 'mic';

type Engine = {
  ctx: AudioContext;
  master: GainNode;
  outAnalyser: AnalyserNode;
  micAnalyser: AnalyserNode;
};

type MicState = {
  stream: MediaStream | null;
  source: MediaStreamAudioSourceNode | null;
};

const FFT_SIZE = 8192;
const SMOOTHING = 0.6;

let engine: Engine | null = null;
const micState: MicState = { stream: null, source: null };
let listenSource: ListenSource = 'app';
const sourceListeners: Array<(source: ListenSource) => void> = [];

const createAnalyser = (ctx: AudioContext): AnalyserNode => {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = SMOOTHING;
  return analyser;
};

const buildEngine = (): Engine => {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const master = ctx.createGain();
  const outAnalyser = createAnalyser(ctx);
  const micAnalyser = createAnalyser(ctx);
  master.connect(outAnalyser);
  outAnalyser.connect(ctx.destination);
  return { ctx, master, outAnalyser, micAnalyser };
};

/** Returns the shared audio engine, creating it on first use. */
export const getEngine = (): Engine => {
  if (!engine) {
    engine = buildEngine();
  }
  if (engine.ctx.state === 'suspended') {
    void engine.ctx.resume();
  }
  return engine;
};

/** Opens the microphone with every browser "improvement" turned off, so level and timbre stay honest. */
export const startMic = async (): Promise<MediaStream> => {
  const { ctx, micAnalyser } = getEngine();
  if (micState.stream) {
    return micState.stream;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = ctx.createMediaStreamSource(stream);
  source.connect(micAnalyser);
  micState.stream = stream;
  micState.source = source;
  return stream;
};

export const stopMic = (): void => {
  micState.source?.disconnect();
  micState.stream?.getTracks().forEach((track) => track.stop());
  micState.stream = null;
  micState.source = null;
};

export const getListenSource = (): ListenSource => listenSource;

export const setListenSource = async (source: ListenSource): Promise<void> => {
  if (source === 'mic') {
    await startMic();
  }
  if (source === 'app') {
    stopMic();
  }
  listenSource = source;
  sourceListeners.forEach((listener) => listener(source));
};

export const onListenSourceChange = (listener: (source: ListenSource) => void): void => {
  sourceListeners.push(listener);
};

/** The analyser for whatever the class is listening to right now (the app or the microphone). */
export const getActiveAnalyser = (): AnalyserNode => {
  const { outAnalyser, micAnalyser } = getEngine();
  if (listenSource === 'mic') {
    return micAnalyser;
  }
  return outAnalyser;
};
