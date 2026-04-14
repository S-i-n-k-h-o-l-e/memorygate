# MemoryGate

MemoryGate is a **persistent personal memory graph and recovery system** built for static hosting (GitHub Pages friendly).

- Plain HTML
- Plain CSS
- Vanilla JavaScript
- No framework
- No build step
- No backend

## Product structure

MemoryGate now has 4 main views:

1. **Home**
2. **Recover**
3. **Memory Net**
4. **Timeline**

## Core model: graph-first memory

MemoryGate stores linked nodes, not isolated cards.

Supported node types:

- `memory`
- `person`
- `place`
- `object`
- `song`
- `phrase`
- `event`
- `date`

### Memory node

```js
{
  id,
  nodeType: "memory",
  title,
  fragment,
  memoryType,
  createdAt,
  rememberedAt,
  tags,
  thread,
  linkedNodeIds,
  notes,
  sourceType,
  sourceRef
}
```

### Anchor node

```js
{
  id,
  nodeType,
  label,
  tags,
  linkedNodeIds
}
```

### Event node

```js
{
  id,
  nodeType: "event",
  title,
  startTime,
  endTime,
  location,
  people,
  notes,
  linkedNodeIds,
  sourceType: "manual" | "calendar_import"
}
```

## View behavior

### Home
Minimal launcher: Recover, Memory Net, Timeline, Settings.

### Recover
Recover operates over saved user graph data.

- Cue type selector
- Cue input
- Optional recency filter
- Movement-led candidate field
- Compact candidate strip
- Detail drawer for selected node
- Recall cascade (linked nodes)
- Hidden-by-default advanced telemetry

Ranking combines:

- cue overlap
- tag overlap
- recency
- graph links
- movement signals (dwell, revisit, slow movement)

Mouse movement remains the proxy for future eye tracking.

### Memory Net
Memory Net is where users build and manage graph structure.

- Add memory nodes
- Add anchor nodes
- Add event nodes
- Edit nodes
- Delete nodes
- Link nodes bidirectionally
- Browse as a network field

### Timeline
Timeline offers time/event-based access.

- Event timeline
- Date clusters from saved memory nodes
- Click event/date to reveal linked memories/nodes

## Persistence keys

The app stores data in browser storage with an adapter design that can be upgraded to IndexedDB later.

- `memorygate_memories`
- `memorygate_nodes`
- `memorygate_sessions`
- `memorygate_settings`

## Session logging

Recover sessions log:

- selected node
- dwell per node
- revisit counts
- session duration
- recall path
- retrieval outcome

## Calendar direction

Current implementation is calendar-ready, not full live calendar sync.

- Event nodes are first-class
- Manual event creation is supported
- `sourceType` supports future imports (`manual` / `calendar_import`)

Live Google Calendar auth/sync is a future extension.

## Run locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy

Deploy repository root directly with GitHub Pages. No build step required.
