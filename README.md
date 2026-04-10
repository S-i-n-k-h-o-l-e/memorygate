# MemoryGate

MemoryGate is a two-part, movement-based memory tool designed for GitHub Pages.

## 1) Recover

Use **Recover** when you are trying to remember something now.

- Choose a recovery cue type (object, song, location, name, phrase, lost thought, other).
- Optionally add a cue phrase.
- Move around the retrieval field (mouse acts as eye-tracking proxy).
- Top candidates rise based on dwell, revisits, slow-zone behavior, cue match, and thread pull.
- Select a candidate to view details and a compact “Why this surfaced” explanation.

## 2) Memory Net

Use **Memory Net** to store memories and revisit them later.

- Add memories with title, content, tags, thread, and category.
- Browse memories in a network field and a compact list.
- Navigate memories using movement-based retrieval signals.

## Persistence (localStorage)

- `memorygate_memories_v3`: saved memory records.
- `memorygate_logs_v3`: recover-session logs (cue, dwell/revisit maps, selected item, top candidates).

## Tech

- Plain HTML
- Plain CSS
- Vanilla JavaScript
- No framework
- No build step
- GitHub Pages compatible

## Run locally

```bash
python3 -m http.server 8000
```

Open: <http://localhost:8000>
