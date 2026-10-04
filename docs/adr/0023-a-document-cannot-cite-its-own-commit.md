# ADR 0023 — A document cannot cite its own commit

- **Status:** Accepted
- **Date:** 2026-10-04

Settles what [`docs/report/2026-10-04.html`](../report/2026-10-04.html) is,
which has never been decided and has been costing commits in the meantime.

## Context

The report carries a dateline: "4 October 2026 · main at 901e3d6 · 188
commits". It is now 42 commits behind that sha, and the figures beside it —
663 tests against 729, eighteen ADRs against twenty-two — are behind with it.

The churn is visible in the log. Of twenty-six commits touching
`docs/report/`, **nine carry the message "Point the report's dateline at the
commit it describes" verbatim**, and a tenth, "Name the commit whose state the
report describes", does the same job:

```bash
git log --oneline -- docs/report/ | grep -c "Point the report's dateline"   # 9
git log --oneline -- docs/report/ | wc -l                                   # 26
```

Nine identical commit messages are not nine oversights. They are the signature
of a loop, and the loop has a cause that no amount of care would have fixed.

**The sha of a commit does not exist until the commit exists.** A document
committed with "main at X" can only ever name a commit that already happened —
its parent, at best. Writing the correct sha into the file changes the file,
which produces a new commit with a new sha, which the document now does not
name. The target moves exactly as far as each attempt to hit it. There is no
fixed point and nine commits are the proof.

Everything else about the report's figures was already right, and this is the
part that makes the diagnosis specific rather than general.
[`tools/report-facts.sh`](../../tools/report-facts.sh) reads every number out
of the repository — commits, ADRs, source files, lines, tests, bundle size,
catalogue counts — and its header says why: "A report's only real claim is that
its numbers are checkable, so none of them should be written from memory." The
figures were never typed. **The one hand-copied value in the document is the
one that generated all of the churn**, and it is the one value that cannot be
generated, because it describes the act of writing rather than the thing
written about.

### Why "make it live" is the wrong half to fix

The obvious remedy is to render the dateline at display time so it is always
current. That fixes the number and makes the document worse.

The report is not a dashboard. It is an argument written at a moment — a
section of it reasons about the chroma correction and concludes "the sequence
is: build a chroma feature, measure per-pitch-class recall on recorded chords
both strummed and blocked, then build the exercise on whichever answer comes
back". That was the right next step on 4 October. Whether it still is depends
on four ADRs that did not exist when it was written.

So a live dateline on a fixed narrative produces a document that reports
today's test count beside last week's conclusions, **and the fresh number
lends its authority to the stale argument**. A reader checks the figure, finds
it correct, and extends that trust to the prose. Honest staleness is legible;
partial freshness is not, and it is the only one of the three options that can
mislead someone who is paying attention.

## Decision

**The report is a dated artefact. It is written once, describes a stated
commit, and is never updated.**

- **Its dateline names a commit that already existed when it was written** —
  the parent, or any earlier sha — and says so in those words rather than
  implying it describes itself. "Written at 901e3d6" is permanently true;
  "main at 901e3d6" becomes false on the next commit and invites someone to
  correct it.
- **It carries its own staleness on its face.** A reader arriving in December
  should learn from the document itself that it describes a moment, without
  having to check the log.
- **A later report is a new file**, named for its date, beside this one.
  `docs/report/` becomes a series rather than a document, which is what
  `docs/findings/` and `docs/process/` already are and for the same reason.
- **`tools/report-facts.sh` stays exactly as it is.** It was never the problem
  and it is the reason the report's figures were worth anything. The next
  report runs it and pastes the output once.

**Generally: a document may not cite the commit it is part of.** Anything that
must name where it stands names a commit that already exists. This is not a
rule about reports; it is a rule about self-reference, and it will apply to the
next generated artefact somebody dates.

## Consequences

The loop stops without anyone having to remember not to run it, because the
thing that was being chased is no longer claimed. That is the test of this
decision: it removes an obligation rather than adding a discipline.

`docs/report/` joins `findings/` and `process/` as a dated series, so the three
time-stamped directories now work the same way and a reader learns one
convention instead of three.

### What this costs

**Nobody will read the second report next to the first.** A series accumulates
and the comparison that would make a series valuable — what changed between
October and November — is work no one has signed up for. The likely outcome is
one stale report and a second stale report, which is better than the loop but
is not a reporting practice.

**The figures go stale the instant the file is written, and now say so loudly
rather than quietly.** Someone wanting the current numbers has to run
`report-facts.sh`, which is thirty seconds and one more thing to know. The
report stops being the place you look to find out how the project is doing,
which is what a reader will expect it to be from its name.

**It does not fix the existing document, only classifies it.** `2026-10-04.html`
still says "main at 901e3d6" in the present tense and still carries an argument
about what to do next that four later ADRs have overtaken. Re-wording its
dateline is one more edit to the file this record is about, and someone has to
decide whether that edit is the last permitted one or whether the file stands
as it is, wrong tense and all. This record says it is permitted once, to add
the banner and fix the tense, and never again — which is a line that depends on
being remembered, exactly the kind of instrument the Context criticises.

**Anyone who wanted a live dashboard still wants one.** Declaring the report an
artefact does not supply the thing the nine commits were reaching for, which
was a current view of the project. If that is genuinely wanted, it is a
different artefact with a different name, generated and not committed, and
this record neither designs nor forbids it.

## Revisit when

- **A second report is written.** That is when the series convention is tested,
  and when it becomes clear whether anyone compares them. If nobody does, the
  honest move is to stop writing them rather than to keep a directory.
- **Something wants a current view of the repository.** The answer is a
  generated, uncommitted artefact, not an edit to a dated one — but it should
  be built when somebody needs it, not in anticipation.
- **Any other document starts naming a sha.** The general rule above is stated
  on one instance; a second is when it should become a check rather than a
  convention.
