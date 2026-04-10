# MemoryGate

MemoryGate is a static GitHub Pages-compatible personal memory system built with plain HTML, CSS, and vanilla JavaScript.

## What changed in V2

MemoryGate now works as a persistent user memory archive instead of a static prototype.

- **Memory Net stores your own memories locally** (create, edit, delete, link).
- **Recover reads from stored memories only** (no static/mock memory dataset).
- **Movement-based ranking** (dwell, revisit, slow movement) helps surface likely matches.
- **Recall cascade** supports anchor → related → next exploration.
- **Session logging** stores recall behavior and outcomes.

## App structure

### 1) Home
Minimal launcher with only:
- Recover a memory
- Memory Net

### 2) Recover
Recovery flow:

`stored memories → cue filter → movement ranking → candidate selection → recall cascade`

UI includes:
- recovery type selector
- optional cue input
- retrieval field
- candidate panel
- detail panel
- recall cascade panel
- optional "Why this surfaced" details

Recover filters and ranks based on:
- type
- cue overlap across title/fragment/tags/anchors/thread/notes
- anchor/tags data
- recency
- movement signals (dwell, revisit, slow-zone)

### 3) Memory Net
Storage and browse flow:

`add memory → store locally → retrieve later in Recover`

Each memory uses this model:

```js
{
  id: string,
  title: string,
  fragment: string,
  type: string, // object, song, location, name, phrase, thought, other
  timestamp: string,
  tags: string[],
  thread: string,
  anchors: {
    object: string[],
    song: string[],
    location: string[],
    person: string[],
    phrase: string[]
  },
  linkedIds: string[],
  notes: string
}
```

## Local storage keys

- `memorygate_memories`: persistent memory archive
- `memorygate_sessions`: recovery session logs

Session logs include:
- selected memory
- dwell stats
- revisit counts
- session duration
- recall path
- retrieval outcome (`No`, `Partly`, `Yes`)

## Why localStorage now, and IndexedDB later

### Current choice: localStorage (V1 persistence)
- easy to implement in a fully static app
- good for small/medium personal memory archives
- GitHub Pages friendly

### Upgrade path: IndexedDB
Move to IndexedDB when the archive grows and you need:
- larger capacity
- indexed/queryable structured records
- non-blocking async storage

The storage logic is isolated in store adapters (`memoryStore`, `sessionStore`) so replacing localStorage with IndexedDB can happen without a full UI rewrite.

## Future cloud sync extension

To extend beyond local-only storage later:
1. keep the same memory/session data model
2. add an optional sync adapter (REST/API or edge function)
3. use local-first conflict handling (local write, then sync)
4. keep Recover ranking local so retrieval works offline

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
