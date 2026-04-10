# MemoryGate

MemoryGate is a plain HTML/CSS/vanilla JS prototype with a two-part structure:

- **Recover**: immediate, cue-driven memory retrieval.
- **Memory Net**: intentional memory storage and later movement-based browsing.

The app stays fully static and GitHub Pages-compatible.

## Product structure

## 1) Recover

Use this page when you are trying to remember something now.

- Compact recovery type selector:
  - object
  - song
  - location
  - name
  - phrase
  - lost thought
  - other
- Optional cue input
- Large retrieval text field
- Candidate list + detail panel
- Movement (mouse) tracking as the current proxy for future eye tracking
- “Why this surfaced” appears after selection
- Telemetry is moved into a collapsible experiment/details section

## 2) Memory Net

Use this page to intentionally store memories and revisit them later.

- Add-memory form
- Saved memory list
- Tags, thread, and category support
- Movement-compatible memory nodes in a network field
- Stored memories can be opened from Memory Net into Recover for retrieval

## Data persistence

The prototype uses `localStorage`:

- `memorygate_memory_net_v1` for saved Memory Net entries
- `memorygate_v2_notes` reserved for notes compatibility

## Run locally

Open `index.html` directly, or run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy with GitHub Pages

1. Push repository to GitHub.
2. Open **Settings → Pages**.
3. Deploy from the repository root on the default branch.

No build step is required.
