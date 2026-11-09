import json, os, subprocess, sys
import numpy as np
SHARC = sys.argv[1]
SAMPLES = sys.argv[2]
OUT = sys.argv[3]
H = 16
NAMES = ['c','c#','d','d#','e','f','f#','g','g#','a','a#','b']
SHARC_MAP = {'violin': 'violin_vibrato', 'viola': 'viola_vibrato', 'cello': 'cello_vibrato', 'flute': 'flute_vibrato', 'oboe': 'oboe', 'bassoon': 'bassoon', 'clarinet': 'Bb_clarinet', 'trumpet': 'C_trumpet', 'french-horn': 'French_horn', 'trombone': 'trombone', 'tuba': 'tuba'}
OWN = {'saxophone': 'sustained', 'organ': 'sustained', 'piano': 'decaying', 'guitar-nylon': 'decaying', 'harp': 'decaying'}
def pitch_midi(p):
    return 12 * (int(p[-1]) + 1) + NAMES.index(p[:-1])
def norm(v):
    m = max(v)
    return [x / m for x in v]
def smooth(notes):
    out = {}
    for m in notes:
        near = [np.array(notes[k]) ** 2 for k in notes if abs(k - m) <= 2]
        out[m] = [round(float(x), 3) for x in norm(list(np.sqrt(np.mean(near, axis=0))))]
    return out
def sharc(inst):
    notes = {}
    for f in os.listdir(os.path.join(SHARC, inst)):
        if not f.endswith('.spect'):
            continue
        db = [float(l.split()[0]) for l in open(os.path.join(SHARC, inst, f)) if l.strip()][:H]
        lin = [10 ** (d / 20) for d in db] + [0.0] * (H - len(db))
        notes[pitch_midi(f[:-6])] = norm(lin)
    return notes
def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)
SR = 44100
def envelope_db(x, hop=0.005):
    n = int(hop * SR)
    frames = len(x) // n
    rms = np.sqrt(np.mean(x[:frames * n].reshape(frames, n) ** 2, axis=1)) + 1e-9
    return 20 * np.log10(rms), hop
def partials(seg, f0):
    win = seg * np.hanning(len(seg))
    nfft = 1 << 19
    spec = np.abs(np.fft.rfft(win, nfft))
    hz = SR / nfft
    amps, prev = [], 0.0
    for n in range(1, H + 1):
        guess = f0 if n == 1 else prev + (prev / (n - 1))
        lo, hi = int((guess - 0.35 * f0) / hz), int((guess + 0.35 * f0) / hz)
        if hi >= len(spec):
            amps.append(0.0); prev = guess; continue
        k = lo + int(np.argmax(spec[lo:hi]))
        amps.append(float(spec[k])); prev = k * hz
    return amps
def measure(iid, kind):
    folder = os.path.join(SAMPLES, iid)
    notes, timing = {}, {}
    for f in sorted(os.listdir(folder)):
        midi = int(f.split('.')[0])
        x = decode(os.path.join(folder, f))
        db, hop = envelope_db(x)
        peak_i = int(np.argmax(db)); peak = db[peak_i]
        onset_i = int(np.argmax(db > peak - 40))
        t10 = int(np.argmax(db > peak - 20)); t90 = int(np.argmax(db > peak - 3))
        attack = max(0.002, (t90 - onset_i) * hop)
        start = onset_i * hop
        a, b = (start + 0.4, start + 0.9) if kind == 'sustained' else (start + 0.03, start + 0.23)
        seg = x[int(a * SR):int(b * SR)]
        if len(seg) < 2048:
            continue
        f0 = 440 * 2 ** ((midi - 69) / 12)
        notes[midi] = norm(partials(seg, f0))
        entry = {'attack': round(attack, 3)}
        if kind == 'decaying':
            after = db[peak_i:]
            below = np.nonzero(after < peak - 20)[0]
            if len(below):
                t20 = below[0] * hop
            else:
                t = np.arange(len(after)) * hop
                ok = (t > 0.1) & (after > peak - 45)
                slope = np.polyfit(t[ok], after[ok], 1)[0]
                t20 = 20 / -slope if slope < 0 else 6.0
            entry['t20'] = round(float(t20), 2)
        timing[midi] = entry
    return notes, timing
result = {}
for iid, inst in SHARC_MAP.items():
    notes = sharc(inst)
    result[iid] = {'source': 'sharc', 'range': [min(notes), max(notes)], 'points': smooth(notes)}
for iid, kind in OWN.items():
    notes, timing = measure(iid, kind)
    result[iid] = {'source': 'timbrando', 'range': [min(notes), max(notes)], 'points': smooth(notes), 'timing': timing}
def envelope_for(timing, m):
    near = [timing[k] for k in timing if abs(k - m) <= 3]
    out = {'attack': round(max(0.003, float(np.median([t['attack'] for t in near])) * 1.4), 3)}
    t20 = [t['t20'] for t in near if 't20' in t]
    if t20:
        out['decay'] = round(1.3 * float(np.median(t20)), 2)
    return out
compact = {}
for k, v in result.items():
    points = []
    for m in sorted(v['points']):
        row = {'midi': m, 'harmonics': v['points'][m]}
        if 'timing' in v:
            row.update(envelope_for(v['timing'], m))
        points.append(row)
    compact[k] = {'source': v['source'], 'points': points}
json.dump(compact, open(OUT, 'w'), separators=(',', ':'))
for k, v in result.items():
    mids = sorted(v['points'])
    print(k, v['source'], v['range'], 'n=', len(mids), 'C4ish:', v['points'][min(mids, key=lambda m: abs(m - 60))][:8])
    if 'timing' in v:
        print('   timing', {m: v['timing'][m] for m in sorted(v['timing'])[::4]})
