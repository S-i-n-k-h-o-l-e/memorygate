# MemoryGate V1 (Static Prototype)

MemoryGate V1 is a GitHub Pages-compatible prototype for **movement-led memory retrieval**.

Instead of forcing immediate typed search, this prototype treats early movement behavior as the first retrieval signal. The intent is to reduce the "brain fog" that can happen when people are asked to verbalize too early during fragile recall.

---

## What the prototype does

- Presents memory entries as cards in a central **Memory Field**.
- Tracks movement dynamics (mouse movement as a stand-in for future eye tracking).
- Infers likely relevance with transparent, rule-based scoring.
- Promotes likely-relevant cards and softly promotes related thread items.
- Opens a detail panel on click for full entry inspection.
- Allows optional post-selection notes/reflections.
- Persists notes in `localStorage` and restores them on reload.

No backend is used. Everything runs as a static site.

---

## Core theory (grounded / experimental framing)

MemoryGate V1 is based on a practical cognitive-design hypothesis:

1. During retrieval, orientation may occur **before** explicit naming.
2. Movement dynamics (attention dwell, revisits, hesitation) can expose implicit relevance.
3. Traditional search-box-first interactions may overload users during early retrieval states.
4. Therefore, interaction starts with movement signals and keeps typing secondary.

This is not a claim of guaranteed recall accuracy; it is an interaction model for experimentation.

---

## Mouse movement as a proxy for eye tracking

In V1, mouse movement is used as an instrumentation proxy for future gaze-based input.

Current tracked metrics include:

- Dwell time near an item
- Revisit count
- Proximity duration
- Slow movement / hesitation near an item
- Selection history

These metrics feed transparent inference rules that update relevance scores over time.

---

## Rule-based inference (transparent + tunable)

All tuning lives in `config` inside `app.js`.

Examples of implemented rules:

- Repeated dwell near an item increases inferred relevance.
- Repeated revisits increase inferred relevance.
- Slow movement near an item adds a recognition signal.
- Strong attention in one thread softly boosts related thread items.

Likely-relevant items are visually promoted via subtle brightening, scaling, and stronger depth cues.

---

## File structure

Repository root (GitHub Pages compatible):

- `index.html`
- `style.css`
- `app.js`
- `README.md`

No build step is required.

---

## Run locally

Option 1: Open `index.html` directly in a browser.

Option 2: Serve statically from repository root (example Python server):

```bash
python3 -m http.server 8000
```

Then open: <http://localhost:8000>

---

## Deploy with GitHub Pages

1. Push this repository to GitHub.
2. In GitHub, open **Settings → Pages**.
3. Set source to deploy from the root of the default branch (or `/ (root)`).
4. Save. GitHub Pages will serve `index.html` automatically.

Because the prototype is plain HTML/CSS/JS with root entrypoint `index.html`, it is immediately GitHub Pages-ready.

---

## Next steps (toward webcam eye tracking)

- Add optional webcam-based gaze estimation (with explicit consent and privacy controls).
- Replace mouse proxy streams with gaze fixation/saccade metrics.
- Calibrate per-user thresholds (dwell windows, hesitation sensitivity).
- Compare mouse-proxy vs gaze-driven relevance outcomes in controlled tests.
- Add exportable anonymized interaction logs for experimental analysis.

---

## Notes on persistence

- Notes are stored locally using browser `localStorage`.
- Key used: `memorygate_v1_notes`
- Clearing browser storage removes saved notes.
