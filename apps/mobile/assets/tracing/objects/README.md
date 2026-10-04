# Tracing pictures

Every picture a letter card, a number card or the "A for Apple" page shows is
named explicitly in `../lessons.json`, the one content mapping, as `"image"`.
Nothing is inferred from a word.

- **Numbers** teach quantity. Their `"image"` is a picture of that many things,
  from `assets/numbers/` — the same picture for 3, ३ and ૩. Only the number
  word (`"label"`) and what the picture shows (`"phrase"`) change by language.
- **Letters** teach a word in their own language. Their `"image"` is set only
  where a picture shows that word (A — Apple, स — सेब, મ — માછલી). A letter
  with no matching picture shows the letter and its word, never a stand-in.

To add a picture: put it in this folder (PNG, transparent or white background,
about 512 × 512) or anywhere already listed under `assets:` in `pubspec.yaml`,
and set `"image"` on the letter's entry in `../lessons.json`. No code change.
