The original single-file, localStorage-only tracker, kept for reference.

Nothing reads it any more. If you open it, note that it stores progress under
the old `case-comp-tracker-v2` key — the new app reads that key once, on first
run, and lifts your progress across, so you do not need to re-tick anything.
