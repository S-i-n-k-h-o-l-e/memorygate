# MemoryGate V2 (Static Prototype)

MemoryGate V2 extends the V1 movement-led retrieval prototype with live signal visibility, freeze controls, retrieval modes, transparent rule explanations, and session logging.

The app remains GitHub Pages-compatible and uses only plain HTML, plain CSS, and vanilla JavaScript.

---

## What is new in V2

- **Live signal block** in the detail panel for dwell time, revisit count, slow-zone time, relevance score, and thread pull.
- **Soft visual linking** across related cards:
  - same thread
  - overlapping tags
  - nearby conceptual neighbors (same emotional state or close timestamp)
- **Lock / freeze controls**:
  - Lock selection
  - Reveal related
  - Start recall session
- **Retrieval modes**:
  - Free drift
  - Focused recall
  - Weak memory mode
- **Improved card state transitions**:
  - subtle brightening
  - slight scale-up
  - faint edge pulse
  - subtle depth lift
- **Session logging to localStorage**:
  - selected item
  - dwell per item
  - revisit counts
  - session duration
  - final top-ranked candidates
  - whether a note was added
  - whether related items were revealed
  - retrieval mode
  - recall path sequence if recall was started
- **Retrieval outcome prompt**:
  - Did this help you retrieve something?
  - No / Partly / Yes
- **Transparent “Why this was surfaced” block** powered by readable rules.
- **Field organization modes**:
  - by thread
  - by emotional state
  - by time
  - by inferred relevance

---

## Storage keys

- Notes: `memorygate_v2_notes`
- Session logs: `memorygate_v2_logs`

---

## Run locally

Open `index.html` directly in a browser, or run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

---

## Deploy with GitHub Pages

1. Push repository to GitHub.
2. Open **Settings → Pages**.
3. Deploy from the root of the default branch.

No build step is required.
