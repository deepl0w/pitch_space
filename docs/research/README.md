# Research

Numbers and platform facts gathered from outside this repository, so that a
record can cite something other than general knowledge.

One file per enquiry, named for its date and its subject. These are not ADRs
and not findings. An ADR decides something; a finding reports what the app did
to somebody using it; a research note reports **what is true of the world the
app runs in**, with the source attached, and takes no decision at all.

The reason this directory exists is written on
[ADR 0014](../adr/0014-one-clock-and-the-latency-nobody-can-measure.md): "None
of this is measured on this codebase… the claim that round-trip latency is of
that order is general knowledge, not a number from this app on a real device."
A record that knows it is resting on folklore is a record waiting for this
directory.

**Say where every number came from, and what it is a number *of*.** A figure
measured through a loopback cable on a native audio path is not a figure for a
browser, and quoting it as one is how the folklore got there. Where the source
qualifies itself — a draft page, an average of six runs, one laptop — carry the
qualification across rather than rounding it off.

**External evidence does not close an internal question.** It can narrow one,
or show that the question was the wrong shape. Measuring this app on a real
device is the user role's work and a note here never substitutes for it; what
it can do is tell that sweep what to expect and what would be surprising.
