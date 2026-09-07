# Tracing guides

The shapes a child traces are polylines stored per question in
`activity_questions.strokesJson`, normalised to a 0–1 box so one definition
renders at any size.

The numerals shipped originally were straight-line skeletons — a two was a
diagonal and a bar, so it drew on screen as a **Z**, and a three was three
zigzags. Children copy what they are shown, so the guide has to be the numeral
as it is actually written.

`numerals.py` generates 1–10 with real curves. `render_numerals.py` draws the
result the way the app's painter does, which is the only way to tell whether a
six looks like a six before a child is asked to trace it.

```
python numerals.py          # writes numerals.json
python render_numerals.py   # writes numerals.png — look at it
```

The content is written to the database rather than shipped in the app, so
changing a shape does not need a release.

**Where the app reads it from:** `composeContent()` builds a tracing activity
from its `activity_questions` rows and only falls back to the activity's stored
`contentJson` when there are none. Updating the blob alone changes nothing —
that mistake cost an hour.
