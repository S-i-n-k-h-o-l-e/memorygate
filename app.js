/* MemoryGate V2 - static vanilla JS prototype */

const config = {
  movement: {
    proximityRadiusPx: 140,
    dwellThresholdMs: 1400,
    slowSpeedThresholdPxPerMs: 0.2,
  },
  scoring: {
    dwellBonus: 1.35,
    revisitBonus: 0.55,
    slowBonus: 0.95,
    threadBonus: 0.42,
    weakModePenalty: 0.86,
    focusedBoost: 1.16,
    promoteAtScore: 2.25,
  },
  ui: {
    renderIntervalMs: 180,
    metricsIntervalMs: 420,
  },
  storage: {
    notesKey: 'memorygate_v2_notes',
    logKey: 'memorygate_v2_logs',
  },
};

const memoryEntries = [
  { id: 'm1', timestamp: '2026-03-30T08:12:00Z', title: 'First week at lab bench', fragment: 'Oscilloscope hum, coffee smell, and the click of probe switches.', tags: ['lab', 'learning', 'electronics'], emotional_state: 'focused', thread: 'research-origin', salience_score: 0.62, notes: '', x: 8, y: 12 },
  { id: 'm2', timestamp: '2026-03-11T22:04:00Z', title: 'Night walk after presentation', fragment: 'Replayed key questions while pacing around the block.', tags: ['walking', 'reflection'], emotional_state: 'alert', thread: 'research-origin', salience_score: 0.59, notes: '', x: 36, y: 18 },
  { id: 'm3', timestamp: '2026-02-19T14:33:00Z', title: 'Whiteboard disagreement', fragment: 'Two arrows erased, one stayed, and the model finally simplified.', tags: ['team', 'modeling'], emotional_state: 'tense', thread: 'method-shift', salience_score: 0.65, notes: '', x: 62, y: 14 },
  { id: 'm4', timestamp: '2026-02-26T06:47:00Z', title: 'Early train notebook page', fragment: 'A sketch tied motor attention to recall confidence.', tags: ['travel', 'notebook', 'insight'], emotional_state: 'curious', thread: 'method-shift', salience_score: 0.71, notes: '', x: 16, y: 52 },
  { id: 'm5', timestamp: '2026-01-22T10:20:00Z', title: 'Code review loop', fragment: 'Found a bug only after tracing user movement logs manually.', tags: ['coding', 'logs'], emotional_state: 'determined', thread: 'tooling', salience_score: 0.56, notes: '', x: 42, y: 57 },
  { id: 'm6', timestamp: '2026-03-03T17:16:00Z', title: 'Campus stairs realization', fragment: 'Recognition arrives before naming when body pace slows.', tags: ['movement', 'recall'], emotional_state: 'surprised', thread: 'movement-hypothesis', salience_score: 0.78, notes: '', x: 68, y: 48 },
  { id: 'm7', timestamp: '2026-03-25T13:52:00Z', title: 'Archive room revisit', fragment: 'Old folder labels triggered a forgotten project branch.', tags: ['archive', 'revisit'], emotional_state: 'engaged', thread: 'movement-hypothesis', salience_score: 0.73, notes: '', x: 26, y: 76 },
  { id: 'm8', timestamp: '2026-01-06T21:40:00Z', title: 'Post-interview decompression', fragment: 'Hand gestures while talking helped retrieve missing example.', tags: ['interview', 'gesture'], emotional_state: 'relieved', thread: 'movement-hypothesis', salience_score: 0.68, notes: '', x: 59, y: 76 },
];

const storage = {
  loadJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  },
  saveJson(key, payload) {
    localStorage.setItem(key, JSON.stringify(payload));
  },
};

const state = {
  selectedId: null,
  lockedId: null,
  revealRelated: false,
  recallSessionActive: false,
  retrievalMode: 'free-drift',
  organizationMode: 'default',
  notesById: storage.loadJson(config.storage.notesKey, {}),
  movement: { lastX: null, lastY: null, lastTimestamp: null, avgSpeed: 0, sampleCount: 0, slowZoneEvents: 0 },
  metricsById: {},
  selectionHistory: [],
  outcome: null,
  itemPositions: {},
  session: {
    id: `session-${Date.now()}`,
    startedAt: new Date().toISOString(),
    revealUsed: false,
    noteAdded: false,
    recallPath: [],
    perItemDwell: {},
    perItemRevisits: {},
    selectedItem: null,
  },
};

memoryEntries.forEach((entry) => {
  state.metricsById[entry.id] = { dwellMs: 0, revisitCount: 0, slowNearMs: 0, proximityMs: 0, inferredScore: entry.salience_score, wasNear: false, isNear: false, threadPull: 0 };
  state.itemPositions[entry.id] = { x: entry.x, y: entry.y };
  if (state.notesById[entry.id]) {
    entry.notes = state.notesById[entry.id];
  }
});

const memoryFieldEl = document.getElementById('memoryField');
const linkLayerEl = document.getElementById('linkLayer');
const detailContentEl = document.getElementById('detailContent');
const statusStripEl = document.getElementById('statusStrip');
const organizationSelectEl = document.getElementById('organizationMode');
const modeControlsEl = document.getElementById('modeControls');
const lockSelectionBtn = document.getElementById('lockSelectionBtn');
const revealRelatedBtn = document.getElementById('revealRelatedBtn');
const startRecallBtn = document.getElementById('startRecallBtn');

function activeId() {
  return state.lockedId || state.selectedId;
}

function organizePositions(mode) {
  const entries = [...memoryEntries];

  if (mode === 'default') {
    memoryEntries.forEach((entry) => {
      state.itemPositions[entry.id] = { x: entry.x, y: entry.y };
    });
    return;
  }

  if (mode === 'thread') {
    const groups = [...new Set(entries.map((e) => e.thread))];
    entries.forEach((entry, idx) => {
      const col = groups.indexOf(entry.thread);
      const row = idx % 3;
      state.itemPositions[entry.id] = { x: 14 + col * 23, y: 20 + row * 28 };
    });
  } else if (mode === 'emotion') {
    const groups = [...new Set(entries.map((e) => e.emotional_state))];
    entries.forEach((entry, idx) => {
      const col = groups.indexOf(entry.emotional_state) % 4;
      const row = Math.floor(groups.indexOf(entry.emotional_state) / 4) * 2 + (idx % 2);
      state.itemPositions[entry.id] = { x: 12 + col * 24, y: 20 + row * 28 };
    });
  } else if (mode === 'time') {
    entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    entries.forEach((entry, idx) => {
      state.itemPositions[entry.id] = { x: 12 + idx * 10.5, y: 50 + ((idx % 2) * 14 - 7) };
    });
  } else if (mode === 'relevance') {
    entries.sort((a, b) => state.metricsById[b.id].inferredScore - state.metricsById[a.id].inferredScore);
    entries.forEach((entry, idx) => {
      state.itemPositions[entry.id] = { x: 12 + idx * 10.5, y: 22 + idx * 7.5 };
    });
  }
}

function relationType(source, target) {
  if (!source || !target || source.id === target.id) return null;
  const sharedTags = source.tags.filter((tag) => target.tags.includes(tag));
  if (source.thread === target.thread) return 'thread';
  if (sharedTags.length) return 'tag';

  const emotionNeighbor = source.emotional_state === target.emotional_state;
  const recencyGap = Math.abs(new Date(source.timestamp) - new Date(target.timestamp)) / (1000 * 60 * 60 * 24);
  if (emotionNeighbor || recencyGap <= 30) return 'neighbor';

  return null;
}

function linkedIdsFor(sourceId) {
  const source = memoryEntries.find((entry) => entry.id === sourceId);
  if (!source) return [];

  return memoryEntries
    .filter((entry) => entry.id !== sourceId)
    .map((entry) => ({ id: entry.id, type: relationType(source, entry) }))
    .filter((it) => it.type);
}

function drawLinks() {
  const aid = activeId();
  linkLayerEl.innerHTML = '';
  if (!aid || (!state.revealRelated && !state.lockedId)) return;

  const sourcePos = state.itemPositions[aid];
  const links = linkedIdsFor(aid);

  links.forEach((link) => {
    const targetPos = state.itemPositions[link.id];
    if (!targetPos) return;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', `${sourcePos.x}%`);
    line.setAttribute('y1', `${sourcePos.y}%`);
    line.setAttribute('x2', `${targetPos.x}%`);
    line.setAttribute('y2', `${targetPos.y}%`);
    line.setAttribute('class', `link-line link-${link.type}`);
    linkLayerEl.appendChild(line);
  });
}

function renderMemoryField() {
  memoryFieldEl.querySelectorAll('.memory-item').forEach((el) => el.remove());

  const aid = activeId();
  const linked = aid ? linkedIdsFor(aid) : [];
  const linkedSet = new Set(linked.map((it) => it.id));

  memoryEntries.forEach((entry) => {
    const metrics = state.metricsById[entry.id];
    const item = document.createElement('article');
    item.className = 'memory-item';
    item.dataset.id = entry.id;

    const scoreFactor = Math.min(1.35, 0.92 + metrics.inferredScore * 0.18);
    const position = state.itemPositions[entry.id];
    item.style.left = `${position.x}%`;
    item.style.top = `${position.y}%`;
    item.style.transform = `translate(-50%, -50%) scale(${scoreFactor.toFixed(3)})`;

    if (metrics.inferredScore >= config.scoring.promoteAtScore) item.classList.add('promoted');
    if (state.selectedId === entry.id) item.classList.add('selected', 'pulse');
    if (state.lockedId === entry.id) item.classList.add('locked', 'pulse');

    if (aid && linkedSet.has(entry.id)) item.classList.add('linked');
    if (aid && state.revealRelated && entry.id !== aid && !linkedSet.has(entry.id)) item.classList.add('dimmed');

    item.innerHTML = `
      <h3>${entry.title}</h3>
      <p>${entry.fragment.slice(0, 75)}${entry.fragment.length > 75 ? '…' : ''}</p>
      <div class="meta">${entry.timestamp.slice(0, 10)} · ${entry.tags.join(', ')}</div>
    `;

    item.addEventListener('click', () => selectItem(entry.id));
    memoryFieldEl.appendChild(item);
  });

  drawLinks();
}

function rulesFor(entry) {
  const metrics = state.metricsById[entry.id];
  const dominantThread = dominantThreadInfo();
  const reasons = [
    `Base salience starts at ${entry.salience_score.toFixed(2)}.`,
    `Dwell contribution: ${(metrics.dwellMs / config.movement.dwellThresholdMs).toFixed(2)}x threshold.`,
    `Revisits seen: ${metrics.revisitCount}; slow-zone time: ${Math.round(metrics.slowNearMs)}ms.`,
  ];

  if (dominantThread.thread === entry.thread) {
    reasons.push(`Thread pull applied from dominant thread "${dominantThread.thread}" (+${metrics.threadPull.toFixed(2)}).`);
  }
  if (state.retrievalMode === 'focused-recall') reasons.push('Focused recall mode adds a small score boost for selected/locked context.');
  if (state.retrievalMode === 'weak-memory') reasons.push('Weak memory mode slightly softens score spikes to reduce overfitting.');

  return reasons;
}

function renderDetailPanel() {
  if (!state.selectedId) {
    detailContentEl.innerHTML = '<p class="muted">Click a memory item to inspect details and add a note.</p>';
    updateLiveSignals();
    return;
  }

  const entry = memoryEntries.find((m) => m.id === state.selectedId);
  const metrics = state.metricsById[entry.id];

  detailContentEl.innerHTML = `
    <div><strong>Title:</strong> ${entry.title}</div>
    <div><strong>Timestamp:</strong> ${entry.timestamp}</div>
    <div><strong>Thread:</strong> ${entry.thread}</div>
    <div><strong>Tags:</strong> ${entry.tags.join(', ')}</div>
    <div><strong>Emotional state:</strong> ${entry.emotional_state}</div>
    <div><strong>Fragment:</strong> ${entry.fragment}</div>
    <div><strong>Inferred relevance:</strong> ${metrics.inferredScore.toFixed(2)}</div>
    <label for="noteInput"><strong>Optional reflection note</strong></label>
    <textarea id="noteInput" placeholder="Add a short note after inspecting this memory..."></textarea>
    <button id="saveNoteBtn" type="button">Save note</button>
    <div class="why-block">
      <strong>Why this was surfaced</strong>
      <ul>${rulesFor(entry).map((reason) => `<li>${reason}</li>`).join('')}</ul>
    </div>
  `;

  const noteInput = document.getElementById('noteInput');
  const saveBtn = document.getElementById('saveNoteBtn');
  noteInput.value = entry.notes || '';

  saveBtn.addEventListener('click', () => {
    entry.notes = noteInput.value.trim();
    state.notesById[entry.id] = entry.notes;
    storage.saveJson(config.storage.notesKey, state.notesById);
    if (entry.notes) state.session.noteAdded = true;
    saveBtn.textContent = 'Saved';
    setTimeout(() => {
      saveBtn.textContent = 'Save note';
    }, 900);
  });

  updateLiveSignals();
}

function updateLiveSignals() {
  const ids = {
    dwell: document.getElementById('signalDwell'),
    revisit: document.getElementById('signalRevisit'),
    slow: document.getElementById('signalSlow'),
    score: document.getElementById('signalScore'),
    pull: document.getElementById('signalThreadPull'),
  };

  if (!state.selectedId) {
    ids.dwell.textContent = '0ms';
    ids.revisit.textContent = '0';
    ids.slow.textContent = '0ms';
    ids.score.textContent = '0.00';
    ids.pull.textContent = 'none';
    return;
  }

  const metrics = state.metricsById[state.selectedId];
  ids.dwell.textContent = `${Math.round(metrics.dwellMs)}ms`;
  ids.revisit.textContent = `${metrics.revisitCount}`;
  ids.slow.textContent = `${Math.round(metrics.slowNearMs)}ms`;
  ids.score.textContent = metrics.inferredScore.toFixed(2);
  ids.pull.textContent = metrics.threadPull > 0 ? `+${metrics.threadPull.toFixed(2)}` : 'none';
}

function renderStatusStrip() {
  const tracked = Object.values(state.metricsById).filter((m) => m.proximityMs > 0 || m.dwellMs > 0).length;
  const sessionSeconds = Math.round((Date.now() - new Date(state.session.startedAt).getTime()) / 1000);
  statusStripEl.innerHTML = `
    <span>selected: ${state.selectedId || 'none'}</span>
    <span>mode: ${state.retrievalMode}</span>
    <span>tracked items: ${tracked}</span>
    <span>avg speed: ${state.movement.avgSpeed.toFixed(2)} px/ms</span>
    <span>slow-zone events: ${state.movement.slowZoneEvents}</span>
    <span>session: ${sessionSeconds}s</span>
  `;
}

function dominantThreadInfo() {
  const totals = {};
  memoryEntries.forEach((entry) => {
    totals[entry.thread] = (totals[entry.thread] || 0) + state.metricsById[entry.id].inferredScore;
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return sorted.length ? { thread: sorted[0][0], score: sorted[0][1] } : { thread: null, score: 0 };
}

function recomputeInferredScores() {
  const dominant = dominantThreadInfo();

  memoryEntries.forEach((entry) => {
    const m = state.metricsById[entry.id];
    const dwell = (m.dwellMs / config.movement.dwellThresholdMs) * config.scoring.dwellBonus;
    const revisit = m.revisitCount * config.scoring.revisitBonus;
    const slow = (m.slowNearMs / config.movement.dwellThresholdMs) * config.scoring.slowBonus;

    let score = entry.salience_score + dwell + revisit + slow;

    m.threadPull = 0;
    if (entry.thread === dominant.thread && dominant.thread) {
      m.threadPull = config.scoring.threadBonus;
      score += m.threadPull;
    }

    if (state.retrievalMode === 'focused-recall' && (entry.id === state.selectedId || entry.id === state.lockedId)) {
      score *= config.scoring.focusedBoost;
    }

    if (state.retrievalMode === 'weak-memory') {
      score *= config.scoring.weakModePenalty;
    }

    m.inferredScore = Math.max(0.2, m.inferredScore * 0.78 + score * 0.22);
  });
}

function onMouseMove(event) {
  const now = performance.now();
  const bounds = memoryFieldEl.getBoundingClientRect();
  const pointerX = event.clientX - bounds.left;
  const pointerY = event.clientY - bounds.top;

  if (pointerX < 0 || pointerY < 0 || pointerX > bounds.width || pointerY > bounds.height) return;

  let dt = 0;
  let speed = 0;

  if (state.movement.lastTimestamp !== null) {
    dt = now - state.movement.lastTimestamp;
    const dx = pointerX - state.movement.lastX;
    const dy = pointerY - state.movement.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    speed = dt > 0 ? dist / dt : 0;

    state.movement.sampleCount += 1;
    state.movement.avgSpeed += (speed - state.movement.avgSpeed) / state.movement.sampleCount;
  }

  state.movement.lastX = pointerX;
  state.movement.lastY = pointerY;
  state.movement.lastTimestamp = now;

  memoryEntries.forEach((entry) => {
    const metric = state.metricsById[entry.id];
    const pos = state.itemPositions[entry.id];
    const itemX = (pos.x / 100) * bounds.width;
    const itemY = (pos.y / 100) * bounds.height;

    const dx = pointerX - itemX;
    const dy = pointerY - itemY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    metric.wasNear = metric.isNear;
    metric.isNear = distance <= config.movement.proximityRadiusPx;

    if (metric.isNear && dt > 0) {
      metric.proximityMs += dt;
      metric.dwellMs += dt;
      state.session.perItemDwell[entry.id] = Math.round(metric.dwellMs);

      if (speed > 0 && speed < config.movement.slowSpeedThresholdPxPerMs) {
        metric.slowNearMs += dt;
        state.movement.slowZoneEvents += 1;
      }
    }

    if (!metric.wasNear && metric.isNear) {
      metric.revisitCount += 1;
      state.session.perItemRevisits[entry.id] = metric.revisitCount;
    }
  });

  if (state.selectedId) updateLiveSignals();
}

function selectItem(id) {
  state.selectedId = id;
  state.session.selectedItem = id;
  state.selectionHistory.push({ id, at: new Date().toISOString() });

  if (state.recallSessionActive) {
    state.session.recallPath.push(id);
  }

  renderDetailPanel();
  renderMemoryField();
  renderStatusStrip();
}

function logSessionAndPersist() {
  const topRanked = [...memoryEntries]
    .sort((a, b) => state.metricsById[b.id].inferredScore - state.metricsById[a.id].inferredScore)
    .slice(0, 3)
    .map((entry) => ({ id: entry.id, title: entry.title, score: Number(state.metricsById[entry.id].inferredScore.toFixed(3)) }));

  const payload = {
    sessionId: state.session.id,
    startedAt: state.session.startedAt,
    endedAt: new Date().toISOString(),
    durationMs: Date.now() - new Date(state.session.startedAt).getTime(),
    selectedItem: state.session.selectedItem,
    dwellPerItem: state.session.perItemDwell,
    revisitCounts: state.session.perItemRevisits,
    finalTopRankedCandidates: topRanked,
    noteAdded: state.session.noteAdded,
    relatedItemsRevealed: state.session.revealUsed,
    retrievalMode: state.retrievalMode,
    recallPathSequence: state.session.recallPath,
    retrievalOutcome: state.outcome,
  };

  const logs = storage.loadJson(config.storage.logKey, []);
  logs.push(payload);
  storage.saveJson(config.storage.logKey, logs);
}

function wireControls() {
  organizationSelectEl.addEventListener('change', () => {
    state.organizationMode = organizationSelectEl.value;
    organizePositions(state.organizationMode);
    renderMemoryField();
  });

  modeControlsEl.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.retrievalMode = button.dataset.mode;
      modeControlsEl.querySelectorAll('.mode-btn').forEach((btn) => btn.classList.remove('is-active'));
      button.classList.add('is-active');
      renderDetailPanel();
      renderStatusStrip();
    });
  });

  lockSelectionBtn.addEventListener('click', () => {
    if (!state.selectedId) return;
    state.lockedId = state.lockedId === state.selectedId ? null : state.selectedId;
    lockSelectionBtn.setAttribute('aria-pressed', state.lockedId ? 'true' : 'false');
    renderMemoryField();
  });

  revealRelatedBtn.addEventListener('click', () => {
    state.revealRelated = !state.revealRelated;
    state.session.revealUsed = state.session.revealUsed || state.revealRelated;
    revealRelatedBtn.setAttribute('aria-pressed', String(state.revealRelated));
    renderMemoryField();
  });

  startRecallBtn.addEventListener('click', () => {
    state.recallSessionActive = !state.recallSessionActive;
    startRecallBtn.textContent = state.recallSessionActive ? 'Stop recall session' : 'Start recall session';
    if (!state.recallSessionActive) renderStatusStrip();
  });

  document.querySelectorAll('.outcome-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.outcome = button.dataset.outcome;
      document.querySelectorAll('.outcome-btn').forEach((btn) => btn.classList.remove('is-active'));
      button.classList.add('is-active');
    });
  });
}

function startLoops() {
  setInterval(() => {
    recomputeInferredScores();
    if (state.organizationMode === 'relevance') organizePositions('relevance');
    renderMemoryField();
  }, config.ui.renderIntervalMs);

  setInterval(() => {
    renderStatusStrip();
    updateLiveSignals();
  }, config.ui.metricsIntervalMs);
}

memoryFieldEl.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseleave', () => {
  state.movement.lastTimestamp = null;
});
window.addEventListener('beforeunload', logSessionAndPersist);

organizePositions('default');
wireControls();
renderMemoryField();
renderDetailPanel();
renderStatusStrip();
startLoops();
