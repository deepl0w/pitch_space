# In flight

What is being worked on right now, and what it is expected to change for
whoever is not the one building it — mainly **tester**, whose standing job
after a sync now includes this file as well as what just landed
(`CLAUDE.md`, "Several agents work here at once"). This is not `ROADMAP.md`:
that is what is planned but not yet started, architect's to keep; this is
what is already underway, and an entry leaves the moment its change has
merged and been reviewed. Removing an entry is itself a claim — that both
of those are actually true — and claims get checked against the tree
before being acted on, the same as any other; an entry looking old is not
evidence of either.

**Main is the only writer.** A role that wants an entry says so to main
rather than adding one, the same reason `.claude/scripts/fleet.sh` and the
fleet skill have a single writer — two roles editing a shared forward plan
in the same week is the merge conflict waiting to happen, and main already
integrates everything else this file would need to stay correct about.

**An entry spanning several roles says which parts are settled and which
are not, separately.** Everything so far has been one role's independent
change; "implies" was enough, because nobody downstream could start before
the change existed to react to. A multi-role entry is different — a role
can start building from the entry itself, before anything merges — so an
open question left as an aside reads as a detail to the role deciding
whether it is safe to begin. If a piece cannot start until something else
is settled, say that plainly rather than trusting "is the architect's to
propose" to carry it.

**Name what the condition is true of, not who was meant to check it.**
"Kept until architect has reviewed" depends on one person remembering a
file they may not read; "kept until 0021 is marked superseded in the
index" is true or false of the repository itself, checkable by whoever
holds the pen regardless of who else is reading anything. The second kind
can also fail loudly — stays open, visibly, rather than aging silently
into something nobody notices has been waiting a fortnight. Same reason a
mechanism beats a correlate everywhere else in this protocol, applied to
how a condition is phrased rather than to how it is checked.

**A stated block has to be stated as removed, not just quietly stop
applying.** Found on the first real use: once the open question was
settled, the entry had to be edited a second time to say so — without
that edit it would read exactly as it did while still blocking, and a
role that had agreed not to start would have no signal the reason expired.
The block and the unblock are two edits, not one.

**The second edit is a field moving, not a sentence announcing that it
moved.** Found on the convention's own first real use, read more literally
than intended: moving the item from a `Not settled:` line to a `Settled:`
one, with the commit that settled it, already says what changed and when.
A sentence on top — "the block this entry carried is removed" — tells a
cold reader that a block they never saw once existed, restates what the
line above it already says, and is the kind of narration this file is
explicitly not meant to hold. Move the field; that is the statement.

**An open question keeps an entry alive only while another role must act
differently because of it.** The removal rule above is about *work* —
merged and reviewed — and the first time an entry had merged work with an
unresolved question still attached to it, that test gave no answer and the
entry sat here for want of one. Ruled by architect on the capture seam: a
question that asks the user to choose between three readings is not in
flight, it is waiting, and waiting has better homes than a file about what
is coming. The inverse is the half worth keeping in view, because it looks
like the same case: if the open question were *which interface a role
should write against*, the entry stays after the code merges, because
somebody is genuinely blocked on reading it.

**And an entry is the weakest of the three places a question can live**,
which is the reason the rule falls this way rather than the other. A test
that fails when somebody answers wrongly is a claim bound to a fact; a
document carrying its own command is checkable by whoever opens it; an
entry here relies on a reader arriving. Moving a question off the third
tier costs nothing when the first still holds it — and `ARCHITECTURE.md`
rotted twice on the strength of the third, in the same week the one claim
with a test behind it stayed true on its own.

**The user role does not read this file.** See `CLAUDE.md`.

## Contents

