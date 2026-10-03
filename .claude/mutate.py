"""
Mutation sweep over the music theory core.

A green suite says the tests pass, not that they would notice if the code were
wrong. Each entry below is one single-line edit of the kind a real change makes
— an off-by-one, a flipped sign, a comparator reversed — applied on its own,
with the suite run against it and the file put back afterwards. A mutation that
survives names a test that cannot fail.

    python3 .claude/mutate.py

Exits non-zero if any mutation survives or no longer applies. A mutation that
no longer applies is not a pass: the line it targeted has been edited, and the
entry needs rewriting or deleting rather than quietly guarding nothing.

Two survivors found real gaps when this was first run (tiedValues was pinned to
its sum rather than to longest-first, and identifyChord's ranking was asserted
on a set with only one reading). One survivor is an equivalent mutant and is
marked as such.
"""
import pathlib, subprocess, sys, shutil, json

MUTANTS = [
 # (file, find, replace, label)
 ('pitch.ts', 'return 12 * (p.octave + 1) + LETTER_SEMITONES[p.letter] + p.alter;',
              'return 12 * (p.octave + 1) + LETTER_SEMITONES[p.letter] - p.alter;', 'pitch: midiOf ignores accidental sign'),
 ('pitch.ts', 'export const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;',
              'export const LETTER_SEMITONES = [0, 2, 4, 6, 7, 9, 11] as const;', 'pitch: F is a semitone high'),
 ('pitch.ts', 'return p.octave * 7 + p.letter;', 'return p.octave * 7 + p.letter + 1;', 'pitch: diatonicOf off by one'),
 ('pitch.ts', 'const midi = Math.round(exact);', 'const midi = Math.floor(exact);', 'pitch: centsOff floors instead of rounds'),
 ('pitch.ts', 'return 69 + 12 * Math.log2(freq / a4);', 'return 69 + 12 * Math.log2(freq / a4) + 0.01;', 'pitch: midiFromFreq biased'),

 ('interval.ts', 'const IS_PERFECT = [true, false, false, true, true, false, false];',
                 'const IS_PERFECT = [true, false, false, false, true, false, false];', 'interval: fourth no longer perfect'),
 ('interval.ts', '  if (diff === -1) return \'min\';', '  if (diff === -2) return \'min\';', 'interval: minor needs two semitones'),
 ('interval.ts', 'number: Math.abs(diatonic) + 1,', 'number: Math.abs(diatonic),', 'interval: number off by one'),

 ('scale.ts', 'return { ...natural, alter: rootMidi + semi - midiOf(natural) };',
              'return { ...natural, alter: 0 };', 'scale: spellScale drops accidentals'),
 ('scale.ts', '      if (target < lowMidi || target > highMidi) continue;',
              '      if (target < lowMidi || target > highMidi + 12) continue;', 'scale: ladder overruns its range'),
 ('scale.ts', '  const alter = semi - natural - (step >= 7 ? 12 : 0);',
              '  const alter = natural - semi - (step >= 7 ? 12 : 0);', 'scale: degreeLabel flips the alteration'),

 ('key.ts', "  return (k.accidentals >= 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, n);",
            "  return (k.accidentals >= 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, n + 1);", 'key: one accidental too many'),
 ('key.ts', "const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];",
            "const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'B', 'E'];", 'key: sharps written out of order'),
 ('key.ts', '  const major = MAJOR_KEYS.find((m) => m.accidentals === k.accidentals);',
            '  const major = MAJOR_KEYS.find((m) => m.accidentals === -k.accidentals);', 'key: vex signature mirrored'),

 ('chord.ts', '    const octaves = Math.ceil((bassMidi - midiOf(p)) / 12);',
              '    const octaves = Math.floor((bassMidi - midiOf(p)) / 12);', 'chord: voicing rounds the wrong way'),
 ('chord.ts', '    const inversion = Math.max(0, sorted.indexOf(bassPc));',
              '    const inversion = 0;', 'chord: identify always says root position'),
 ('chord.ts', '  if (pcs.length < 3) return [];', '  if (pcs.length < 2) return [];', 'chord: identify accepts a dyad'),
 ('chord.ts', '    rank[a.type.family] - rank[b.type.family] || a.inversion - b.inversion);',
              '    rank[b.type.family] - rank[a.type.family] || a.inversion - b.inversion);', 'chord: identify ranks exotic first'),

 ('meter.ts', '  const scaled = v.dots === 0 ? base : v.dots === 1 ? base * 3 / 2 : base * 7 / 4;',
               '  const scaled = v.dots === 0 ? base : v.dots === 1 ? base * 7 / 4 : base * 3 / 2;', 'meter: dots swapped'),
 ('meter.ts', '  if (beatStarts.length === 4) out.add(beatStarts[2]);',
               '  if (beatStarts.length === 4) out.add(beatStarts[1]);', 'meter: secondary accent on beat two'),
 ('meter.ts', '    if (ts.levels[i].includes(t)) return ts.levels.length - i;',
               '    if (ts.levels[i].includes(t)) return i;', 'meter: metricWeight inverted'),
 ('meter.ts', '  return unitsInBeat > 1 ? unitsInBeat : 2;', '  return 2;', 'meter: compound beat halves'),
 ('meter.ts', '  const descending = [...VALUE_BY_TICKS.entries()].sort((a, b) => b[0] - a[0]);',
               '  const descending = [...VALUE_BY_TICKS.entries()].sort((a, b) => a[0] - b[0]);', 'meter: tiedValues shortest first'),

 ('roman.ts', '    root = transpose(target, n.degree - 1, APPLIED_SEMITONES[n.degree]);',
              '    root = transpose(target, n.degree - 1, APPLIED_SEMITONES[n.degree] - 1);', 'roman: applied root a semitone flat'),
 ('roman.ts', '  const base = keyPitches(key)[degree - 1];', '  const base = keyPitches(key)[degree % 7];', 'roman: degreeRoot off by one'),
 ('roman.ts', "  major: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],",
              "  major: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'min'],", 'roman: leading-tone triad is minor'),
 ('roman.ts', '  const inv = ((inversion % size) + size) % size;', '  const inv = Math.min(inversion, size - 1);', 'roman: figures clamp again'),
]

# Mutations that provably cannot change behaviour, so surviving is correct.
# identifyChord's shape.length filter already rejects anything with fewer than
# three distinct pitch classes, so relaxing the explicit guard is a no-op.
EQUIVALENT = {'chord: identify accepts a dyad'}

base = pathlib.Path('src/theory')
results = []
for fname, find, repl, label in MUTANTS:
    path = base / fname
    original = path.read_text()
    if find not in original:
        results.append((label, 'NOT-APPLIED')); continue
    path.write_text(original.replace(find, repl, 1))
    r = subprocess.run(['npx', 'vitest', 'run', '--silent'], capture_output=True, text=True)
    path.write_text(original)
    caught = 'failed' in r.stdout.lower() or r.returncode != 0
    results.append((label, 'caught' if caught else 'SURVIVED'))

for label, verdict in results:
    print(f'{verdict:12} {label}')

caught = sum(1 for _, v in results if v == 'caught')
survived = [l for l, v in results if v == 'SURVIVED' and l not in EQUIVALENT]
stale = [l for l, v in results if v == 'NOT-APPLIED']
print()
print(f'{caught}/{len(results)} caught')
for label in survived:
    print(f'  SURVIVED, no test catches this: {label}')
for label in stale:
    print(f'  STALE, the line this targeted has changed: {label}')
sys.exit(1 if survived or stale else 0)
