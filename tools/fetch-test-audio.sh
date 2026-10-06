#!/usr/bin/env bash
#
# Fetch the recorded notes the capture tests use, which are not committed.
#
# **Why not committed.** They are 4–6 MiB each as published, and a
# repository carrying a recording corpus is one nobody can clone cheaply.
# The tests that want them skip with a message naming this script when they
# are absent, so a fresh checkout is green without them and nobody is
# blocked — the pattern this project uses for anything a machine may not
# have.
#
# **Why these recordings.** ADR 0008's argument is that a synthetic tone has
# no attack and no decay and therefore finds no real defect, and that a
# browser's fake microphone is a 440 Hz beep. The capture layer is tested
# against Karplus–Strong plucks, which is better than a sine and still a
# model; a struck piano string is the thing it will actually be asked to
# hear. One specific claim is waiting on these — see `ATTACK_FRACTION` in
# `src/audio/capture/listen.ts`, which measurably does nothing on synthetic
# plucks and may or may not earn its place on a real attack.
#
# **Licence.** The Versilian Community Sample Library is CC0-1.0 — public
# domain dedication, confirmed from the repository's own licence metadata
# rather than from a page describing it. Nothing is owed, nothing needs
# attributing, and these files are never shipped: they are a build-time
# input to a test and the bundle does not contain them.
#
#   https://github.com/sgossner/VCSL   (LICENSE: CC0-1.0)
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="fixtures/audio"
BASE="https://media.githubusercontent.com/media/sgossner/VCSL/master/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains"

# A spread rather than a chromatic run: the detector's hard cases are the
# extremes of the range, where the fundamental is weak or the partials
# crowd together, and six notes an octave or so apart cover that in about
# the same bytes as one octave would.
NOTES=(A1 A2 C3 E3 A3 C5)

mkdir -p "$DEST"
printf 'Fetching %s notes into %s\n' "${#NOTES[@]}" "$DEST"
printf 'Source: VCSL Upright Piano, Knight (CC0-1.0). Roughly 4–6 MiB each.\n\n'

missing=0
for note in "${NOTES[@]}"; do
    out="$DEST/piano_$note.wav"
    if [ -s "$out" ]; then
        printf '  have    %s\n' "$(basename "$out")"
        continue
    fi
    printf '  fetch   %s ... ' "$(basename "$out")"
    if curl -fsSL --max-time 180 "$BASE/Player_vl1_rr1_$note.wav" -o "$out.part"; then
        mv "$out.part" "$out"
        printf 'ok (%s)\n' "$(du -h "$out" | cut -f1)"
    else
        rm -f "$out.part"
        printf 'FAILED\n'
        missing=$((missing + 1))
    fi
done

printf '\n'
if [ "$missing" -gt 0 ]; then
    printf '%s note(s) could not be fetched. The tests that need them will skip.\n' "$missing"
    exit 1
fi
printf 'Done. Run the suite again and the recorded-audio cases will run.\n'
