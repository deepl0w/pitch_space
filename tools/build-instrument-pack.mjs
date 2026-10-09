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
 * **Two libraries, both CC0, both verified from their own repository rather
 * than from a page describing them.** VCSL is the broader set; VSCO 2 CE is
 * the orchestral one, and is where the sustained instruments come from
 * because VCSL has no strings and no flute.
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
 * **No guitar.** Neither library has one, and a guitar faked from another
 * plucked instrument would be exactly the "not the instrument you know"
 * problem recordings were added to solve. It stays synthesised until there
 * is a real one, which also suits the user's own note that a guitar wants
 * strummed voicings rather than block chords.
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
  dir: `${VSCO}/Strings/Violin Section/susVib`,
  // Everything the section has; its spacing is uneven and not ours to fix.
  notes: ['G2', 'A2', 'B2', 'D3', 'F#3', 'A3', 'C4', 'E4', 'G4', 'B4', 'D5'],
  file: (note) => `VlnEns_susVib_${note}_v1.wav`,
}, {
  id: 'flute',
  name: 'Flute',
  source: 'https://github.com/sgossner/VSCO-2-CE',
  licence: 'CC0-1.0',
  attribution: `${VERSILIAN} Chamber Orchestra 2 CE — Flute, sustained`,
  dir: `${VSCO}/Woodwinds/Flute/susNV`,
  notes: ['C3', 'E3', 'A3', 'C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'C6'],
  file: (note) => `LDFlute_susNV_${note}_v1_1.wav`,
}];

/** MIDI number for a name like `C#3`, with A4 = 69 and C4 = 60. */
function midiOf(name) {
  const [, letter, accidental, octave] = /^([A-G])(#|b)?(-?\d+)$/.exec(name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
  const alter = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + base + alter;
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

/** Mean RMS in dBFS across a set of encoded notes, via ffmpeg's astats. */
function rmsOf(paths) {
  const levels = paths.map((path) => {
    // Both streams: ffmpeg writes its filter reports to stderr, so reading
    // stdout alone measures nothing and reports every note as silent.
    const { stdout, stderr } = spawnSync('ffmpeg',
      ['-nostdin', '-v', 'info', '-i', path, '-af', 'astats=measure_perchannel=none',
        '-f', 'null', '-'],
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
  const sources = [];
  for (const note of instrument.notes) {
    const source = join(cacheDir, `${instrument.id}_${note}.wav`);
    await fetchTo(urlFor(instrument, note), source);
    sources.push({ midi: midiOf(note), note, source });
  }

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
