# MemoryGate V2 (Static Retrieval Experiment Prototype)

MemoryGate V2 is a GitHub Pages-compatible static prototype for **movement-led memory retrieval experiments**.

The interface is designed for cognitively fragile retrieval states: movement and orienting signals come first, typing remains secondary.

This version is an incremental V2 update on top of the previously merged V1 static prototype.

---

## What is new in V2

- **Live signal block** for the current lead/anchor item:
  - dwell time
  - revisit count
  - slow-zone time
  - inferred relevance
  - thread pull
- **Soft visual linking** across related cards (thread/tag/conceptual neighbors).
- **Lock selection** to freeze the current anchor.
- **Reveal related** to surface 3–5 linked memories.
- **Start recall session** to log deliberate retrieval paths.
- **Retrieval modes**:
  - Free drift
  - Focused recall
  - Weak memory mode
- **Field organization modes**:
  - by thread
  - by emotional state
  - by time
  - by inferred relevance
- **Why this was surfaced** block in detail view.
- **Subjective outcome capture**: “Did this help you retrieve something?” (No / Partly / Yes).

---

## Core theory (grounded experimental framing)

V2 uses a rule-based cognitive interaction hypothesis:

1. Recognition can emerge before explicit verbal recall.
2. Movement dynamics (dwell, revisits, hesitation) provide early relevance signals.
3. Search-box-first interactions can increase load during fragile retrieval.
4. Transparent movement-first ranking can support better early retrieval orientation.

This is an experimental interaction model, not a diagnostic claim.

---

## Interaction model

### 1) Live signal visibility
The app continuously displays movement-derived metrics for the current lead/anchor item so users can see why one memory is currently winning.

### 2) Retrieval modes
Mode behavior is controlled through a central config map in `app.js`.

- **Free drift**: balanced baseline weighting.
- **Focused recall**: higher revisit/anchor stability emphasis.
- **Weak memory mode**: reduced visual clutter (fewer cards shown), softer transitions.

### 3) Lock / freeze behavior
- **Lock selection** freezes anchor selection so lead updates do not replace it.
- **Unlock** returns to dynamic movement-led leading.

### 4) Recall cascade mechanic
When an anchor is selected/locked:

`anchor → neighbor → confirmation → expansion`

- Related neighbors are surfaced.
- User can follow related chips in detail panel.
- Path steps are timestamped when session logging is active.

### 5) Why this was surfaced
The detail panel includes rule-based reasons such as:

- high dwell time
- repeated revisits
- slowed movement nearby
- tag overlap with recently attended items
- same thread as recently attended items

No black-box model is used.

---

## Session logging structure (localStorage)

Logs are written to localStorage key:

- `memorygate_v2_session_logs`

At minimum each log snapshot includes:

- `eventType`
- timestamp (`at`)
- retrieval `mode`
- `selectedId` / `lockedId` / `anchorId`
- `sessionDurationMs`
- `relatedRevealed`
- subjective `outcome`
- `topCandidates` (top inferred items)
- `totalsByItem`:
  - dwellMs
  - revisitCount
  - slowNearMs
  - noteAdded
- `recallPath` sequence with per-step timestamps

Notes remain stored at:

- `memorygate_v1_notes`

---

## File structure

Repository root (GitHub Pages compatible):

- `index.html`
- `style.css`
- `app.js`
- `README.md`

No build step or backend is required.

---

## Run locally

Open `index.html` directly in a browser, or run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

---

## Persistence and deployment notes

- Notes are persisted in browser localStorage at `memorygate_v1_notes`.
- Session snapshots are persisted in browser localStorage at `memorygate_v2_session_logs`.
- The app is fully static (`index.html`, `style.css`, `app.js`) and requires no backend.
- GitHub Pages can serve it directly from repository root with no build step.

---

## GitHub Pages deployment

1. Push repository to GitHub.
2. Go to **Settings → Pages**.
3. Set source to deploy from repo root (`/ (root)`) on your chosen branch.
4. Save; `index.html` is served directly.

---

## Next steps for eye tracking + formal experiment use

- Add optional webcam gaze estimation with explicit consent and local-only processing mode.
- Replace mouse proxy signals with fixation/saccade measures.
- Add calibration routines for per-user thresholds.
- Add session export tools (JSON/CSV) for study pipelines.
- Add condition tagging for within-subject experiment designs.
- Add reliability checks comparing mouse-proxy vs gaze signal agreement.
