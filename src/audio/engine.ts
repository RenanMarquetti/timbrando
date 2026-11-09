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

const FFT_SIZE = 16384;
const SMOOTHING = 0.55;

let engine: Engine | null = null;
const micState: MicState = { stream: null, source: null };
const micListeners: Array<(on: boolean) => void> = [];

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

export const isMicOn = (): boolean => micState.stream !== null;

const notifyMic = (): void => micListeners.forEach((listener) => listener(isMicOn()));

export const onMicChange = (listener: (on: boolean) => void): void => {
  micListeners.push(listener);
};

/** Opens the microphone with every browser "improvement" turned off, so level and timbre stay honest. */
export const startMic = async (): Promise<void> => {
  if (micState.stream) {
    return;
  }
  const { ctx, micAnalyser } = getEngine();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = ctx.createMediaStreamSource(stream);
  source.connect(micAnalyser);
  micState.stream = stream;
  micState.source = source;
  notifyMic();
};

export const stopMic = (): void => {
  micState.source?.disconnect();
  micState.stream?.getTracks().forEach((track) => track.stop());
  micState.stream = null;
  micState.source = null;
  notifyMic();
};
