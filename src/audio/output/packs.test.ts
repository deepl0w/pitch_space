import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import index from './packs.json';
import { COMPASS, licenceAllowed } from './pack';

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const SERVED = join(ROOT, 'public', 'packs');

/**
 * The index and the files it names have to agree.
 *
 * **This is the defect that shipped.** `public/packs/` was gitignored, so the
 * packs existed in exactly one checkout: every other worktree, a fresh
 * clone, CI and the deployed site served the single-page fallback for them
 * and the app played the synthesised voice instead.
 *
 * It was silent by construction, and ADR 0046's addendum now says why. The
 * record argues — correctly — that a pack which has not arrived is not an
 * error, because synthesis is already sounding and there is nothing to
 * block on. That is right for a pack still downloading and wrong for one
 * that will never come, **and the same silence covers both**. A design
 * whose degraded path is pleasant needs a separate way to tell degraded
 * from fine, and it cannot live where the pack is consumed, because the
 * consumer genuinely cannot tell the difference.
 *
 * So it lives here, where the artefact is produced. Note what this would
 * have done about the original defect: nothing, in the checkout that built
 * the packs, because the files were present there. It would have failed in
 * every checkout where the bug was real — which is the only place a check
 * on this could have helped, and is the reason it is worth having rather
 * than a reason it is weak.
 */
describe('the pack index', () => {
  it('names packs that are actually there to fetch', () => {
    /*
      The population first. An empty index satisfies every case below by
      having nothing to check, and an index that failed to generate is
      exactly how that would happen.
    */
    expect(index.length, 'the index names no packs at all').toBeGreaterThan(0);

    const missing = index
      .filter((pack) => !existsSync(join(SERVED, pack.file)))
      .map((pack) => `${pack.id} -> ${pack.file}`);
    expect(missing, 'named in the index and not in public/packs').toEqual([]);
  });

  it('declares the size the file actually is', () => {
    /*
      `bytes` is what a reader is deciding whether to download, and it is
      written by the builder rather than measured here — so a pack rebuilt
      without the index being rewritten would advertise the old figure. The
      declared size is the audio; the manifest in front of it is under a
      kilobyte, which is the allowance below.
    */
    for (const pack of index) {
      const actual = statSync(join(SERVED, pack.file)).size;
      expect(actual, `${pack.id} is ${actual} bytes, index says ${pack.bytes}`)
        .toBeGreaterThanOrEqual(pack.bytes);
      expect(actual - pack.bytes, `${pack.id}'s manifest is implausibly large`)
        .toBeLessThan(4096);
    }
  });

  it('carries a credit and a licence the allowlist permits', () => {
    /*
      The obligation half. A pack whose licence requires attribution and
      whose attribution is empty is a pack the app cannot honestly ship, and
      the settings screen renders these fields directly — so an empty one is
      a blank line rather than a visible failure.
    */
    for (const pack of index) {
      expect(licenceAllowed(pack.licence), `${pack.id} has licence ${pack.licence}`).toBe(true);
      expect(pack.source, `${pack.id} names no source`).toBeTruthy();
      expect(pack.attribution.length, `${pack.id} has no attribution`).toBeGreaterThan(0);
    }
  });

  it('is a real pack container, not whatever a server felt like returning', () => {
    /*
      The shape of the original failure: the path resolved, with 200 and a
      body, and the body was the application's own HTML. Reading the first
      bytes is what distinguishes "a file is there" from "the right file is
      there", and it is the difference the user role had to find by hand.
    */
    for (const pack of index) {
      const head = readFileSync(join(SERVED, pack.file)).subarray(0, 6).toString('latin1');
      expect(head, `${pack.file} does not begin like a pack`).toBe('PSPACK');
    }
  });

  it('records notes inside the compass an instrument can be recorded over', () => {
    for (const pack of index) {
      expect(pack.notes, `${pack.id} records no notes`).toBeGreaterThan(0);
      expect(pack.trim, `${pack.id} has no measured trim`).toBeGreaterThan(0);
    }
    expect(COMPASS.lowest).toBeLessThan(COMPASS.highest);
  });
});
