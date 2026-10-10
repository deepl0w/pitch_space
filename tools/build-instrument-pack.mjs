#!/usr/bin/env node
/**
 * Build a sampled instrument pack, and the index that credits it.
 *
 * `docs/instrument-pack-format.md` specifies what this emits; read that
 * first. The short version: one `.pack` per instrument, content-addressed so
 * its URL is immutable, plus a small `index.json` that ships in the bundle so
 * the settings screen can list and credit what is on offer before anything
 * has been downloaded and while offline.
 *
 * **Nothing here is committed except the index.** The recordings are tens of
 * megabytes as published and the packs are built from them, so both are
 * git-ignored and this script is how they come back — the same pattern
 * `tools/fetch-test-audio.sh` uses for the capture fixtures, and for the same
 * reason: a repository carrying an audio corpus is one nobody can clone
 * cheaply.
 *
 * **Licence.** The Versilian Community Sample Library is CC0-1.0, a public
 * domain dedication, confirmed from the repository's own licence metadata.
 * That matters more here than it did for the fixtures: those were a
 * build-time input to a test and were never shipped, and this ships. CC0
 * permits redistribution, so the conclusion survives, but it survives on a
 * different premise and is restated rather than inherited.
 *
 *   https://github.com/sgossner/VCSL   (LICENSE: CC0-1.0)
 *
 * Usage:  node tools/build-instrument-pack.mjs [--out dir] [--keep-source]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACK_MAGIC = 'PSPACK\u0000\u0001';

/**
 * How long a sampled note is kept.
 *
 * Measured against what the app asks for rather than chosen: the longest
 * single sound any exercise schedules is a progression chord at about 1.1
 * seconds, and a struck piano needs its release tail after that or it ends
 * in a click. Three seconds covers both with room, and it is most of what
 * decides the pack's size — the recordings run 8 to 24 seconds and almost
 * all of that is decay nothing will ever hear.
 */
const SECONDS = 3;

/**
 * Mono, because the exercises are about pitch and nothing is panned, and
 * halving the channels halves the bytes for nothing anyone can hear in a
 * practice app played through a phone speaker.
 */
const BITRATE = '64k';

/**
 * The level the pack is normalised to, in dBFS RMS.
 *
 * A reference rather than a preference: the point is that every pack lands
 * on the same number, so switching instrument is a change of instrument
 * rather than a change of volume. -20 dBFS RMS is quiet enough that a
 * six-note chord has headroom above it before the master gain.
 *
 * This is the figure the format document means by a measured trim, and it is
 * measured from the recordings rather than inherited from the synthesised
 * voice of the same name — see `PackManifest.trim`.
 */
const REFERENCE_DBFS = -20;

/**
 * How much of a note the level is measured over.
 *
 * **Not the whole sample, and the first version of this got it wrong.** A
 * pack stores three seconds; the app plays about one. Measuring the stored
 * length matched the instruments over audio most of which is never heard,
 * and the two kinds of instrument hide their energy in different places —
 * a struck piano puts nearly all of it in the first second and a sustained
 * flute spreads it evenly, so two voices with the same three-second RMS
 * are nothing like the same loudness over the second that plays.
 *
 * That is exactly what shipped: piano and flute were matched to within
 * 0.3 dB across three seconds, and the user role measured the piano at
 * roughly three times the flute's level in the app. Measured over what is
 * actually sounded instead. `BAR_SECONDS` in `progression-id` is the
 * longest single sound any exercise schedules, at 1.1s.
 */
const HEARD_SECONDS = 1.2;

/**
 * Where the loudest note in a pack is put before encoding.
 *
 * Not 0: a lossy encoder overshoots the waveform it was given, so a file
 * normalised to the ceiling decodes with samples above it and clips on the
 * way out. A decibel of room is the usual allowance and costs nothing here.
 */
const PEAK_CEILING_DBFS = -1;

/**
 * What each pack is built from.
 *
 * **Three libraries, all CC0, each verified from its own repository rather
 * than from a page describing it.** VCSL is the broader set; VSCO 2 CE is the
 * orchestral one, and is where the sustained instruments come from because
 * VCSL has no strings and no flute; FreePats has the guitar neither of the
 * other two has.
 *
 * VSCO's readme adds two requests on top of CC0 — credit Versilian Studios,
 * and do not sell the samples directly. Neither is a condition CC0 imposes
 * and neither constrains this app, which is MIT, free, and names the source
 * in its settings screen. Recorded because the next person to read the
 * licence field will find CC0 and should know the requests exist.
 *
 * **The note lists are what each library actually holds**, enumerated from
 * its file tree rather than assumed: the spacing is not free to choose and
 * differs per instrument. Where a library samples more finely than four
 * semitones the list thins it out, because the furthest a note is ever
 * shifted is what matters and two semitones is already inaudible as a
 * formant shift.
 *
 * **The octave each library writes its filenames in is not free to assume**,
 * and `middleC` below records what each one actually does. Four of the six
 * packs shipped an octave sharp because it was assumed; `midiOf` and
 * `checkPitch` carry that story and the guard that now prevents it.
 */
const VCSL = 'https://raw.githubusercontent.com/sgossner/VCSL/master';
const VSCO = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/SFZ';

const VERSILIAN = 'Versilian Studios';

const INSTRUMENTS = [{
  id: 'piano',
  name: 'Upright Piano',
  source: 'https://github.com/sgossner/VCSL',
  licence: 'CC0-1.0',
  attribution: `${VERSILIAN} Community Sample Library — Upright Piano, Knight`,
  // Measured: the file named A1 sounds A2. VCSL is not uniform about this.
  middleC: 3,
  dir: `${VCSL}/Chordophones/Zithers/Upright Piano, Knight/Sustains`,
  // Every four semitones: VCSL samples every other one, so this is its set
  // thinned by half.
  notes: ['A1', 'C#2', 'F2', 'A2', 'C#3', 'F3', 'A3', 'C#4', 'F4', 'A4',
    'C#5', 'F5', 'A5', 'C#6', 'F6', 'A6'],
  file: (note) => `Player_vl1_rr1_${note}.wav`,
}, {
  id: 'electric-piano',
  name: 'Electric piano',
  source: 'https://github.com/sgossner/VCSL',
  licence: 'CC0-1.0',
  attribution: `${VERSILIAN} Community Sample Library — Yamaha TX81Z`,
  // Scientific, unlike its two neighbours from the same library.
  middleC: 4,
  dir: `${VCSL}/Electrophones/TX81Z/FM Piano`,
  // C, E and G# an octave at a time, which is this library's own spacing.
  notes: ['C2', 'E2', 'G#2', 'C3', 'E3', 'G#3', 'C4', 'E4', 'G#4',
    'C5', 'E5', 'G#5', 'C6'],
  file: (note) => `FMPiano_${note}_vl1.wav`,
}, {
  id: 'organ',
  name: 'Organ',
  source: 'https://github.com/sgossner/VCSL',
  licence: 'CC0-1.0',
  attribution: `${VERSILIAN} Community Sample Library — Renaissance Organ, 8'`,
  middleC: 3,
  dir: `${VCSL}/Aerophones/Edge-blown Aerophones/Renaissance Organ/8'`,
  // The library holds every two semitones from C1; taken every four.
  notes: ['C2', 'E2', 'G#2', 'C3', 'E3', 'G#3', 'C4', 'E4', 'G#4', 'C5', 'E5'],
  file: (note) => `RenOrgan_8foot_Room_${note}_rr1.wav`,
}, {
  id: 'strings',
  name: 'Strings',
  source: 'https://github.com/sgossner/VSCO-2-CE',
  licence: 'CC0-1.0',
  attribution: `${VERSILIAN} Chamber Orchestra 2 CE — Violin Section, sustained`,
  // VSCO is consistently C3; its lowest violin file, G2, is a violin's G3.
  middleC: 3,
  dir: `${VSCO}/Strings/Violin Section/susVib`,
  // Everything the section has; its spacing is uneven and not ours to fix.
  notes: ['G2', 'A2', 'B2', 'D3', 'F#3', 'A3', 'C4', 'E4', 'G4', 'B4', 'D5'],
  file: (note) => `VlnEns_susVib_${note}_v1.wav`,
}, {
  id: 'guitar',
  name: 'Guitar',
  source: 'https://freepats.zenvoid.org/Guitar/acoustic-guitar.html',
  licence: 'CC0-1.0',
  attribution: 'FreePats — Spanish Classical Guitar, recorded by Roberto Zenvoid',
  // Scientific: its lowest file, E2, is the guitar's own bottom string.
  middleC: 4,
  /*
    The one library of the three that publishes an archive rather than loose
    files, and the only free per-note guitar I could find at all: VCSL and
    VSCO both have none, and the usual alternatives are either
    non-commercial or a single strummed chord.
  */
  archive: 'https://freepats.zenvoid.org/Guitar/SpanishClassicalGuitar/'
    + 'SpanishClassicalGuitar-SFZ-20190618.7z',
  within: 'SpanishClassicalGuitar-SFZ-20190618/samples',
  /*
    Densely sampled — 48 notes — but not chromatically: G#2 and C#3 are
    missing, among others, so the four-semitone spacing used elsewhere
    cannot be taken literally here. Chosen from what exists, no gap wider
    than four, across a guitar's own range rather than a keyboard's.
  */
  notes: ['E2', 'G2', 'B2', 'D3', 'F#3', 'A3', 'C4', 'E4', 'G4', 'B4',
    'D5', 'F#5', 'A5', 'C6'],
  file: (note) => `${note}.wav`,
}, {
  id: 'flute',
  name: 'Flute',
  source: 'https://github.com/sgossner/VSCO-2-CE',
  licence: 'CC0-1.0',
  attribution: `${VERSILIAN} Chamber Orchestra 2 CE — Flute, sustained`,
  // Its lowest file is C3, and a concert flute does not go below C4.
  middleC: 3,
  dir: `${VSCO}/Woodwinds/Flute/susNV`,
  notes: ['C3', 'E3', 'A3', 'C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'C6'],
  file: (note) => `LDFlute_susNV_${note}_v1_1.wav`,
}];

/**
 * MIDI number for a name like `C#3`, as *that library* writes octave numbers.
 *
 * **A sample library's filename is not scientific pitch notation, and four of
 * the six here are not.** Octave numbering has two live conventions — middle
 * C as C4, which MIDI and this app use, and middle C as C3, which Yamaha
 * established and which much sample-library tooling inherited — and a
 * filename carries no indication of which one it was written in. So the
 * convention is read off the library and passed in, rather than assumed.
 *
 * Getting this wrong is close to invisible from inside the code: every note
 * is shifted by the same octave, so the pack is internally consistent, every
 * test passes, and the only symptom is that the instrument sounds an octave
 * high. It shipped that way. A user reported the organ as sounding
 * "artificial" and as not sounding like a chord, which is what a single-rank
 * 8' flute stop does when a C-E-G in the fourth octave is played in the
 * fifth; measuring the built packs' own fundamentals found piano, organ,
 * strings and flute all an octave sharp.
 *
 * `checkPitch` below is the guard, and it is the part that matters more than
 * this argument: the convention is now measured from the audio rather than
 * believed.
 */
function midiOf(name, middleC) {
  const [, letter, accidental, octave] = /^([A-G])(#|b)?(-?\d+)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
  const alter = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + base + alter + (4 - middleC) * 12;
}

/**
 * Fetch and unpack an archived sound bank once, returning where it landed.
 *
 * Two libraries publish loose files over HTTP and one publishes an archive;
 * rather than teach the rest of this script about that difference, an
 * archived instrument is unpacked into the cache and then read exactly like
 * a directory of downloads.
 */
async function unpack(instrument, cacheDir) {
  const into = join(cacheDir, instrument.id);
  const marker = join(into, '.unpacked');
  if (!existsSync(marker)) {
    mkdirSync(into, { recursive: true });
    const archive = join(into, 'bank.7z');
    await fetchTo(instrument.archive, archive);
    run('7z', ['x', '-y', `-o${into}`, archive]);
    writeFileSync(marker, instrument.archive);
  }
  return join(into, instrument.within);
}

/**
 * The URL of one recording.
 *
 * Each path segment is encoded on its own: these libraries have spaces,
 * commas and apostrophes in their directory names and sharps in their
 * filenames, and a sharp left raw is read as the start of a fragment — the
 * server is asked for the natural, which 404s and looks exactly like the
 * note not existing. Encoding the whole URL at once would instead destroy
 * the slashes.
 */
function urlFor(instrument, note) {
  const [scheme, rest] = instrument.dir.split('://');
  const path = rest.split('/').map(encodeURIComponent).join('/');
  return `${scheme}://${path}/${encodeURIComponent(instrument.file(note))}`;
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Peak level in dBFS of one file, via ffmpeg's volumedetect. */
function peakOf(path) {
  const { stdout, stderr } = spawnSync('ffmpeg',
    ['-nostdin', '-v', 'info', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' });
  const match = /max_volume:\s*(-?[\d.]+) dB/.exec(`${stdout}${stderr}`);
  if (!match) throw new Error(`could not measure the peak of ${path}`);
  return Number(match[1]);
}

/**
 * How far a recording's own pitch sits from the note it is labelled, in
 * semitones, or `null` when the recording is too quiet to say.
 *
 * Only whole octaves are considered, because that is the error being guarded
 * against and narrowing the question is what makes the answer reliable: a
 * general pitch detector has to separate candidates a semitone apart, and
 * every attempt to do that here was defeated by the material. A piano is
 * harmonically dense enough that the summed energy of a candidate and of the
 * candidate an octave away agree within a decibel.
 *
 * What does separate them is **peakiness of the fundamental alone** — how far
 * the candidate's own first partial stands above the spectrum a whole tone
 * either side of it. A harmonic series has nothing at half its fundamental,
 * so an octave-low candidate scores nothing, and broadband noise has no peak
 * anywhere, so a silent recording scores nothing and says so rather than
 * voting.
 *
 * The *lowest* candidate that is a peak at all wins, not the strongest. A
 * weak fundamental is ordinary — a violin section's bottom G and a guitar's
 * bottom E both put far more energy into the second harmonic than the first —
 * and taking the strongest reads exactly those an octave high, which is the
 * error this is here to find.
 */
function octaveOffset(path, midi) {
  const RATE = 22050;
  const raw = execFileSync('ffmpeg',
    ['-nostdin', '-v', 'error', '-i', path, '-ac', '1', '-ar', String(RATE),
      '-f', 'f32le', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 28 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length >> 2);
  /*
    The loudest half-second, rather than a fixed offset into the recording.

    Where that window falls differs by instrument and the difference matters:
    a sustained flute is the same all through, but the top of the upright
    piano has decayed into room noise within two seconds, and reading it at a
    fixed 150 ms meant reading mostly noise. Searched rather than chosen, so
    one rule covers both. Never the first 50 ms, where a struck note's pitch
    has not settled and a blown one is still sliding into tune.
  */
  const len = RATE >> 1;
  const earliest = Math.floor(RATE * 0.3);
  if (x.length < len + earliest) return null;
  let from = earliest;
  let loudest = -1;
  for (let start = earliest; start + len <= x.length; start += Math.floor(RATE * 0.05)) {
    let energy = 0;
    for (let i = start; i < start + len; i += 4) energy += x[i] * x[i];
    if (energy > loudest) {
      loudest = energy;
      from = start;
    }
  }

  const bin = (hz) => {
    const w = (2 * Math.PI * hz) / RATE;
    const c = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < len; i++) {
      const s0 = x[from + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len)) + c * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    return Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2) / (len * len);
  };
  const hzOf = (m) => 440 * 2 ** ((m - 69) / 12);
  const peakiness = (hz) => bin(hz)
    / ((bin(hz * 2 ** (-2 / 12)) + bin(hz * 2 ** (2 / 12))) / 2 + 1e-20);

  const scored = OCTAVES.map((d) => ({ d, score: peakiness(hzOf(midi + d)) }));
  const best = Math.max(...scored.map((c) => c.score));
  if (best < A_PEAK) return null;
  return scored.find((c) => c.score >= Math.max(A_PEAK, best / FAINTEST)).d;
}

/** The octaves a label could be out by, lowest first. */
const OCTAVES = [-24, -12, 0, 12, 24];

/**
 * How far above its own neighbourhood a frequency has to stand to count as a
 * partial rather than as part of the noise floor: 10 dB.
 *
 * A recording where nothing reaches this is not saying anything and does not
 * vote. The top of the upright piano is what that is for — by the window this
 * reads, those notes have decayed into room tone.
 */
const A_PEAK = 10;

/**
 * How far below the strongest partial a fundamental may still be believed:
 * 30 dB.
 *
 * Not a tuning knob despite looking like one. A plucked low string really
 * does put its first partial tens of decibels under its second, so a tight
 * tolerance would read half the guitar an octave high; and nothing a flute
 * does puts a spurious peak within 30 dB of its fundamental, so a loose one
 * does not cost anything there. Every value from 20 to 40 dB gives the same
 * verdict for all six packs, which is the reason to believe the figure is
 * not holding the result up.
 */
const FAINTEST = 1000;

/**
 * Refuse a pack whose recordings do not sound the notes it labels them.
 *
 * This exists because believing a filename shipped four instruments an octave
 * sharp — see `midiOf`. A build-time measurement is the only check with any
 * authority over that: nothing downstream can tell, because the error is
 * uniform, and a uniformly wrong pack is a perfectly consistent one.
 *
 * **The verdict is the set's, not each note's.** A convention belongs to the
 * library, so the statistic is the modal offset over every note that could be
 * measured, which survives the few notes any real set will have that are too
 * quiet or too inharmonic to read. The margin is thinner than it looks for
 * the piano — nine of its fifteen measurable notes agree, against four
 * reading an octave high off a strong second partial — so a bare majority is
 * what is asked for, and a set that cannot reach even that fails rather than
 * passing on a plurality nobody should trust.
 *
 * What this does not catch is one mislabelled file among many, which would
 * lose the vote and be reported as a disagreement rather than refused. That
 * is the right way round: the convention error is silent and systematic, and
 * a single wrong note is audible the first time it is played.
 */
function checkPitch(instrument, sources) {
  const offsets = sources
    .map((s) => ({ ...s, offset: octaveOffset(s.source, s.midi) }))
    .filter((s) => s.offset !== null);
  if (offsets.length === 0) throw new Error(`${instrument.id}: no note was loud enough to measure`);

  const votes = new Map();
  for (const { offset } of offsets) votes.set(offset, (votes.get(offset) ?? 0) + 1);
  const [shift, agreeing] = [...votes].reduce((a, b) => (b[1] > a[1] ? b : a));

  if (agreeing * 2 <= offsets.length) {
    throw new Error(`${instrument.id}: its recordings do not agree on an octave `
      + `(${[...votes].map(([d, n]) => `${n} at ${d}`).join(', ')} of ${offsets.length} measured)`);
  }
  if (shift !== 0) {
    throw new Error(`${instrument.id}: every note sounds ${shift / 12} octave(s) from its label `
      + `(${agreeing} of ${offsets.length} measured) — this library writes middle C as `
      + `C${instrument.middleC - shift / 12}, not C${instrument.middleC}`);
  }
  const odd = offsets.filter((s) => s.offset !== 0);
  const quiet = sources.length - offsets.length;
  console.log(`  pitch   ${offsets.length - odd.length}/${sources.length} notes sound as labelled`
    + (odd.length ? `, ${odd.map((s) => `${s.note} by ${s.offset}`).join(', ')}` : '')
    + (quiet ? `, ${quiet} too quiet to measure` : ''));
}

/** Mean RMS in dBFS across a set of encoded notes, via ffmpeg's astats. */
function rmsOf(paths) {
  const levels = paths.map((path) => {
    // Both streams: ffmpeg writes its filter reports to stderr, so reading
    // stdout alone measures nothing and reports every note as silent.
    const { stdout, stderr } = spawnSync('ffmpeg',
      ['-nostdin', '-v', 'info', '-i', path, '-t', String(HEARD_SECONDS),
        '-af', 'astats=measure_perchannel=none', '-f', 'null', '-'],
      { encoding: 'utf8' });
    const match = /RMS level dB:\s*(-?[\d.]+|-?inf)/.exec(`${stdout}${stderr}`);
    return match && match[1] !== '-inf' ? Number(match[1]) : null;
  }).filter((v) => v !== null);
  if (levels.length === 0) throw new Error('could not measure any note');
  return levels.reduce((a, b) => a + b, 0) / levels.length;
}

async function fetchTo(url, path) {
  if (existsSync(path) && statSync(path).size > 0) return;
  process.stdout.write(`  fetch   ${url.split('/').pop()} ... `);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  process.stdout.write(`${(statSync(path).size / 1048576).toFixed(1)} MiB\n`);
}

async function build(instrument, outDir, cacheDir) {
  console.log(`\n${instrument.name} (${instrument.licence})`);
  const unpacked = instrument.archive ? await unpack(instrument, cacheDir) : null;
  const sources = [];
  for (const note of instrument.notes) {
    let source;
    if (unpacked) {
      source = join(unpacked, instrument.file(note));
      if (!existsSync(source)) throw new Error(`${instrument.id}: no ${source}`);
    } else {
      source = join(cacheDir, `${instrument.id}_${note}.wav`);
      await fetchTo(urlFor(instrument, note), source);
    }
    sources.push({ midi: midiOf(note, instrument.middleC), note, source });
  }
  checkPitch(instrument, sources);

  /*
    One gain for the whole pack, not one per note.

    The recordings are quiet — the set peaks around -30 dBFS — and storing
    them that way would mean correcting for it at playback, which amplifies
    the encoder's noise along with the note. Lifting them here puts the
    signal in the range the codec is good at and leaves `trim` a small
    corrective rather than a 14x boost, which is what the first version of
    this produced and is what prompted the change.

    The *same* gain for every note, because the quiet notes are quiet for a
    musical reason: the top of a piano really is weaker than its middle, and
    normalising each note on its own would flatten the instrument into
    something that plays every pitch at the same force. A single offset moves
    the set without touching the relationships inside it.
  */
  const peak = Math.max(...sources.map((s) => peakOf(s.source)));
  const lift = PEAK_CEILING_DBFS - peak;
  console.log(`  loudest note ${peak.toFixed(1)} dBFS -> lifting the set by ${lift.toFixed(1)} dB`);

  const encoded = [];
  for (const { midi, note, source } of sources) {
    const out = join(cacheDir, `${instrument.id}_${note}.m4a`);
    run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', source,
      '-t', String(SECONDS), '-ac', '1', '-ar', '44100',
      '-af', `volume=${lift.toFixed(2)}dB`,
      '-c:a', 'aac', '-b:a', BITRATE, out]);
    encoded.push({ midi, path: out });
  }
  encoded.sort((a, b) => a.midi - b.midi);

  /*
    Measured, then written down. The format document's rule is that a pack
    without a measured trim does not load at all, rather than defaulting to
    1 — a plausible-looking value for a thing nobody measured is worse than
    an absent one, because nothing goes looking for it.
  */
  const measured = rmsOf(encoded.map((e) => e.path));
  const trim = 10 ** ((REFERENCE_DBFS - measured) / 20);
  console.log(`  measured ${measured.toFixed(1)} dBFS RMS -> trim ${trim.toFixed(3)}`);

  const audio = [];
  const notes = [];
  let offset = 0;
  for (const { midi, path } of encoded) {
    const bytes = readFileSync(path);
    notes.push({ midi, offset, bytes: bytes.length });
    audio.push(bytes);
    offset += bytes.length;
  }
  const blob = Buffer.concat(audio);

  /*
    The filename is a content hash, which makes ADR 0046's immutable URL
    structural rather than a discipline: a pack cannot be edited in place
    because editing it changes its name, there is no version counter for
    anyone to forget, and a rebuild with identical contents keeps its URL and
    the cache entry that goes with it. Hashed over the audio and the note
    table together, so a retimed note table is a different pack even when the
    audio has not moved.
  */
  const header = {
    id: instrument.id,
    name: instrument.name,
    source: instrument.source,
    licence: instrument.licence,
    attribution: instrument.attribution,
  };
  const digest = createHash('sha256')
    .update(JSON.stringify({ header, notes, trim })).update(blob)
    .digest('hex').slice(0, 8);
  const file = `${instrument.id}-${digest}.pack`;

  const manifest = { ...header, bytes: blob.length, file, notes, trim };
  const json = Buffer.from(JSON.stringify(manifest), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length, 0);
  const pack = Buffer.concat([Buffer.from(PACK_MAGIC, 'utf8'), length, json, blob]);
  // The declared size is the audio, which is what a reader is deciding
  // whether to download; the manifest in front of it is under a kilobyte.
  writeFileSync(join(outDir, file), pack);
  console.log(`  ${file}  ${(pack.length / 1024).toFixed(0)} KiB, ${notes.length} notes`);
  return manifest;
}

const outDir = join(ROOT, 'public', 'packs');
const cacheDir = join(ROOT, 'fixtures', 'packs');
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const built = [];
for (const instrument of INSTRUMENTS) built.push(await build(instrument, outDir, cacheDir));

/*
  Remove packs this run did not produce.

  Content-addressed names mean a rebuilt pack is a *new* file rather than an
  overwritten one, so without this the directory accumulates every version
  ever built and the app ships all of them — found immediately, with two
  piano packs on disk and the index naming one. Only files this run wrote
  survive, which is the same claim the index makes.
*/
const keep = new Set(built.map((m) => m.file));
for (const name of readdirSync(outDir)) {
  if (name.endsWith('.pack') && !keep.has(name)) {
    rmSync(join(outDir, name));
    console.log(`  removed stale ${name}`);
  }
}

/*
  The index is generated here rather than maintained by hand, and that is
  what makes the credits honest: a CC-BY pack obliges the app to display
  attribution, attribution the app does not display is attribution the app
  has failed to make, and a hand-written list fails silently in exactly that
  direction. Nobody types this, so it cannot drift from the packs.
*/
const index = built.map(({ notes, ...header }) => ({ ...header, notes: notes.length }));
const indexPath = join(ROOT, 'src', 'audio', 'output', 'packs.json');
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(`\nindex -> ${indexPath.slice(ROOT.length + 1)} (${built.length} pack(s))`);
