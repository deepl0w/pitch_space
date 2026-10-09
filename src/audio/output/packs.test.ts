import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkManifest, parsePack } from './pack';
import index from './packs.json';

/**
 * The packs as shipped, rather than a manifest invented in a test.
 *
 * `pack.test.ts` asks what a pack has to be; this asks whether the files in
 * the repository are that. The distinction earned itself: `public/packs/`
 * was gitignored, so the packs existed in one checkout and nowhere else —
 * every other worktree, every fresh clone, CI and the deployed site served
 * the SPA fallback for them and the app played the synthesised voice.
 *
 * **Nothing failed.** ADR 0046 makes synthesis the floor precisely so that
 * an absent pack is not an error, which is right, and which is what made a
 * total absence look exactly like a working app. 1,245 tests saw nothing.
 *
 * **It was found by a person looking, and the first version of this comment
 * credited the wrong half of what they did.** It said the discovery was a
 * patch on `AudioScheduledSourceNode.start` showing that no
 * `AudioBufferSourceNode` ever ran. That reading was worthless:
 * `AudioBufferSourceNode` declares its own `start` — the signature takes an
 * offset and a duration the base class has no parameters for — so a patch on
 * the base is shadowed and sees no buffer source **on a perfectly healthy
 * app**. The instrument could not have returned any other answer, so it
 * agreed with a true conclusion by luck. `docs/RUNNING-THE-APP.md` carries
 * the general form.
 *
 * What actually established it was the rest of the same sweep, and all of it
 * holds: the pack path returning 200 with `text/html` and the app's own
 * shell as the body, no `packs/` directory in a plain `./build.sh`, and a
 * 404 on the deployed site. Three independent observations of absence, none
 * of which depends on knowing which node type was scheduled.
 *
 * **Why existence in the working tree is the whole claim, and git is not
 * needed to make it.** What went wrong is better described as "not
 * committed" than "ignored", and the mechanism that answers *that* is
 * already in the repository: `.github/workflows/ci.yml` checks out a fresh
 * clone and runs `npx vitest run`, so a file absent from the commit is
 * absent from the directory this reads. Shelling out to `git check-ignore`
 * would answer the question a few minutes earlier on the author's own
 * machine, at the cost of the suite depending on being inside a repository
 * at all — and it would still be a proxy for what matters, which is whether
 * the bytes reach the browser.
 */

const PACKS = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), '..', 'public', 'packs');

/** The shipped file for an index entry, read once. */
function bytesOf(file: string): Uint8Array {
  return new Uint8Array(readFileSync(join(PACKS, file)));
}

describe('the packs the app will fetch', () => {
  it('are listed by an index with something in it', () => {
    // The population every case below sweeps. An index that had become an
    // empty array would satisfy all of them by having nothing to check,
    // while the app silently lost every recorded instrument.
    expect(index.length).toBeGreaterThan(1);
  });

  it('each exist at the path the index names', () => {
    const missing = index
      .filter((pack) => !readdirSync(PACKS).includes(pack.file))
      .map((pack) => `${pack.id} wants ${pack.file}`);
    expect(missing, 'named in packs.json and not in public/packs/').toEqual([]);
  });

  /**
   * And nothing is shipped that the index does not name. A content-addressed
   * filename means a rebuilt pack is a *new* file rather than a changed one,
   * so the old one survives unless something removes it — bytes in the
   * deployment that no code can reach and no credit covers.
   */
  it('are the only packs shipped', () => {
    const named = new Set(index.map((pack) => pack.file));
    const orphans = readdirSync(PACKS).filter((file) => file.endsWith('.pack') && !named.has(file));
    expect(orphans, 'in public/packs/ and not in packs.json — rebuilt and not swept up')
      .toEqual([]);
  });

  /**
   * Every shipped pack passes the refusals it would be refused by at
   * runtime. The synthetic manifests in `pack.test.ts` check that the rules
   * work; this checks that the artefacts obey them, which is the half a
   * truncated file, a stray Git LFS pointer or a hand-edited index breaks.
   */
  it('parse, and satisfy the rules a pack is refused by', () => {
    for (const entry of index) {
      const { manifest, audio } = parsePack(bytesOf(entry.file));
      expect(() => checkManifest(manifest), entry.id).not.toThrow();

      // The format's one piece of deliberate duplication: the index carries
      // every pack's header and each pack repeats its own, so that a
      // downloaded pack is self-describing when the index has moved on.
      // Deliberate duplication is still duplication, and it can disagree.
      for (const field of ['id', 'name', 'source', 'licence', 'attribution', 'file', 'trim'] as const) {
        expect(manifest[field], `${entry.id}: ${field} differs from the index`)
          .toEqual(entry[field]);
      }

      // `bytes` is the audio, not the file — it is what a reader is deciding
      // whether to download, and the manifest in front of it is under a
      // kilobyte.
      expect(audio.length, `${entry.id}: declared size is not the audio`).toBe(entry.bytes);
      expect(manifest.notes).toHaveLength(entry.notes);
    }
  });

  /**
   * The filename is the content hash, and that is what makes ADR 0046's
   * immutable URL structural rather than a discipline: a pack cannot be
   * edited in place because editing it changes its name.
   *
   * Recomputed here the way `tools/build-instrument-pack.mjs` computes it —
   * over the header, the note table and the trim, then the audio — because a
   * claim that something is content-addressed is only worth making if
   * somebody checks the address against the content. A pack edited by hand,
   * truncated in transit, or rebuilt without its index entry following all
   * fail here and nowhere else.
   */
  it('are named after what is inside them', () => {
    for (const entry of index) {
      const { manifest, audio } = parsePack(bytesOf(entry.file));
      const header = {
        id: manifest.id,
        name: manifest.name,
        source: manifest.source,
        licence: manifest.licence,
        attribution: manifest.attribution,
      };
      const digest = createHash('sha256')
        .update(JSON.stringify({ header, notes: manifest.notes, trim: manifest.trim }))
        .update(audio)
        .digest('hex')
        .slice(0, 8);
      expect(entry.file, `${entry.id} is not named after its contents`)
        .toBe(`${entry.id}-${digest}.pack`);
    }
  });

  /**
   * Every note the table indexes is inside the audio it came with. An offset
   * past the end decodes to nothing, which — behind a synthesised voice that
   * is already sounding — is the same silence as no pack at all.
   */
  it('index only into audio they actually carry', () => {
    for (const entry of index) {
      const { manifest, audio } = parsePack(bytesOf(entry.file));
      for (const note of manifest.notes) {
        expect(note.offset + note.bytes, `${entry.id}: note ${note.midi} runs past the audio`)
          .toBeLessThanOrEqual(audio.length);
        expect(note.bytes, `${entry.id}: note ${note.midi} is empty`).toBeGreaterThan(0);
      }
    }
  });
});
