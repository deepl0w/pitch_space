import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The README's "not built yet" section, for the tests that check it.
 *
 * Shared because the claims in that section are not all decidable from one
 * place. Most are facts about files, and `src/architecture.test.ts` asks
 * them under node; one is about whether a control is *offered*, which can
 * only be answered by mounting the screens under jsdom. Two environments,
 * one section, and a second copy of this reader would be free to drift from
 * the first — which is the failure the section itself keeps having.
 *
 * From the working directory rather than `import.meta.url`, for the reason
 * `stylesheet.ts` gives: under jsdom the global `URL` resolves against the
 * document base and the module specifier is not a `file:` URL.
 */
export function notBuiltSection(): string {
  const source = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
  const start = source.indexOf('## What is not built yet');
  if (start === -1) throw new Error('could not find the "not built" section in README.md');
  const next = source.indexOf('\n## ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}
