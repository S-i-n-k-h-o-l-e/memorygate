/* ==============================
   MemoryGate V1 - Static Prototype
   Modules: config, data, storage,
   rendering, movement tracking,
   inference, ui interactions.
================================= */

// ---------- config ----------
const config = {
  movement: {
    proximityRadiusPx: 145,
    dwellThresholdMs: 1400,
    slowSpeedThresholdPxPerMs: 0.2,
    slowNearItemThresholdMs: 850,
  },
  scoring: {
    dwellBonus: 1.4,
    revisitBonus: 1.1,
    slowBonus: 1.2,
    threadBonus: 0.55,
    baseScoreDecay: 0.985,
    promoteAtScore: 2.2,
    threadPromoteAtScore: 1.2,
  },
  ui: {
    renderIntervalMs: 140,
    metricsIntervalMs: 500,
  },
  storage: {
    notesKey: 'memorygate_v1_notes',
  },
};

// ---------- mock data ----------
const memoryEntries = [
  {
    id: 'm1',
    timestamp: '2026-03-30T08:12:00Z',
    title: 'First week at lab bench',
    fragment: 'Oscilloscope hum, coffee smell, and the click of probe switches.',
    tags: ['lab', 'learning', 'electronics'],
    emotional_state: 'focused',
    thread: 'research-origin',
    salience_score: 0.62,
    notes: '',
    x: 8,
    y: 12,
  },
  {
    id: 'm2',
    timestamp: '2026-03-11T22:04:00Z',
    title: 'Night walk after presentation',
    fragment: 'Replayed key questions while pacing around the block.',
    tags: ['walking', 'reflection'],
    emotional_state: 'alert',
    thread: 'research-origin',
    salience_score: 0.59,
    notes: '',
    x: 36,
    y: 18,
  },
  {
    id: 'm3',
    timestamp: '2026-02-19T14:33:00Z',
    title: 'Whiteboard disagreement',
    fragment: 'Two arrows erased, one stayed, and the model finally simplified.',
    tags: ['team', 'modeling'],
    emotional_state: 'tense',
    thread: 'method-shift',
    salience_score: 0.65,
    notes: '',
    x: 62,
    y: 14,
  },
  {
    id: 'm4',
    timestamp: '2026-02-26T06:47:00Z',
    title: 'Early train notebook page',
    fragment: 'A sketch tied motor attention to recall confidence.',
    tags: ['travel', 'notebook', 'insight'],
    emotional_state: 'curious',
    thread: 'method-shift',
    salience_score: 0.71,
    notes: '',
    x: 16,
    y: 52,
  },
  {
    id: 'm5',
    timestamp: '2026-01-22T10:20:00Z',
    title: 'Code review loop',
    fragment: 'Found a bug only after tracing user movement logs manually.',
    tags: ['coding', 'logs'],
    emotional_state: 'determined',
    thread: 'tooling',
    salience_score: 0.56,
    notes: '',
    x: 42,
    y: 57,
  },
  {
    id: 'm6',
    timestamp: '2026-03-03T17:16:00Z',
    title: 'Campus stairs realization',
    fragment: 'Recognition arrives before naming when body pace slows.',
    tags: ['movement', 'recall'],
    emotional_state: 'surprised',
    thread: 'movement-hypothesis',
    salience_score: 0.78,
    notes: '',
    x: 68,
    y: 48,
  },
  {
    id: 'm7',
    timestamp: '2026-03-25T13:52:00Z',
    title: 'Archive room revisit',
    fragment: 'Old folder labels triggered a forgotten project branch.',
    tags: ['archive', 'revisit'],
    emotional_state: 'engaged',
    thread: 'movement-hypothesis',
    salience_score: 0.73,
    notes: '',
    x: 26,
    y: 76,
  },
  {
    id: 'm8',
    timestamp: '2026-01-06T21:40:00Z',
    title: 'Post-interview decompression',
    fragment: 'Hand gestures while talking helped retrieve missing example.',
    tags: ['interview', 'gesture'],
    emotional_state: 'relieved',
    thread: 'movement-hypothesis',
    salience_score: 0.68,
    notes: '',
    x: 59,
    y: 76,
  },
];

// ---------- storage ----------
const storage = {
  loadNotes() {
    try {
      return JSON.parse(localStorage.getItem(config.storage.notesKey) || '{}');
    } catch {
      return {};
    }
  },
  saveNotes(notesById) {
    localStorage.setItem(config.storage.notesKey, JSON.stringify(notesById));
  },
};

// ---------- app state ----------
const state = {
  selectedId: null,
  notesById: storage.loadNotes(),
  movement: {
    lastX: null,
    lastY: null,
    lastTimestamp: null,
    avgSpeed: 0,
    sampleCount: 0,
    slowZoneEvents: 0,
  },
  metricsById: {},
  selectionHistory: [],
};

memoryEntries.forEach((entry) => {
  state.metricsById[entry.id] = {
    dwellMs: 0,
    revisitCount: 0,
    proximityMs: 0,
    slowNearMs: 0,
    inferredScore: entry.salience_score,
    isNear: false,
    wasNear: false,
  };
  if (state.notesById[entry.id]) {
    entry.notes = state.notesById[entry.id];
  }
});

// ---------- rendering ----------
const memoryFieldEl = document.getElementById('memoryField');
const detailContentEl = document.getElementById('detailContent');
const statusStripEl = document.getElementById('statusStrip');

function renderMemoryField() {
  memoryFieldEl.innerHTML = '';

  const maxScore = Math.max(...memoryEntries.map((e) => state.metricsById[e.id].inferredScore));

  memoryEntries.forEach((entry) => {
    const metrics = state.metricsById[entry.id];
    const item = document.createElement('article');
    item.className = 'memory-item';
    item.dataset.id = entry.id;

    const scoreFactor = Math.min(1.35, 0.95 + (metrics.inferredScore / Math.max(maxScore, 0.1)) * 0.45);
    item.style.left = `${entry.x}%`;
    item.style.top = `${entry.y}%`;
    item.style.transform = `translate(-50%, -50%) scale(${scoreFactor.toFixed(3)})`;

    if (metrics.inferredScore >= config.scoring.promoteAtScore) {
      item.classList.add('promoted');
    }

    if (state.selectedId === entry.id) {
      item.classList.add('selected');
    }

    if (isThreadPromoted(entry.thread, entry.id)) {
      item.classList.add('thread-promoted');
    }

    item.innerHTML = `
      <h3>${entry.title}</h3>
      <p>${entry.fragment.slice(0, 75)}${entry.fragment.length > 75 ? '…' : ''}</p>
      <div class="meta">${entry.timestamp.slice(0, 10)} · ${entry.tags.join(', ')}</div>
    `;

    item.addEventListener('click', () => selectItem(entry.id));
    memoryFieldEl.appendChild(item);
  });
}

function renderDetailPanel() {
  if (!state.selectedId) {
    detailContentEl.innerHTML = '<p class="muted">Click a memory item to inspect details and add a note.</p>';
    return;
  }

  const entry = memoryEntries.find((m) => m.id === state.selectedId);
  const metrics = state.metricsById[entry.id];

  detailContentEl.innerHTML = `
    <div class="detail-row"><strong>Title:</strong> ${entry.title}</div>
    <div class="detail-row"><strong>Timestamp:</strong> ${entry.timestamp}</div>
    <div class="detail-row"><strong>Thread:</strong> ${entry.thread}</div>
    <div class="detail-row"><strong>Tags:</strong> ${entry.tags.join(', ')}</div>
    <div class="detail-row"><strong>Emotional state:</strong> ${entry.emotional_state}</div>
    <div class="detail-row"><strong>Fragment:</strong> ${entry.fragment}</div>
    <div class="detail-row">
      <strong>Inferred relevance:</strong> ${metrics.inferredScore.toFixed(2)}
      <span class="muted">(dwell ${Math.round(metrics.dwellMs)}ms · revisits ${metrics.revisitCount} · slow-near ${Math.round(metrics.slowNearMs)}ms)</span>
    </div>
    <label for="noteInput" class="detail-row"><strong>Optional reflection note</strong></label>
    <textarea id="noteInput" placeholder="Add a short note after inspecting this memory..."></textarea>
    <button id="saveNoteBtn" type="button">Save note</button>
    <p class="muted">Typing is intentionally secondary; movement-based signals drive ranking first.</p>
  `;

  const noteInput = document.getElementById('noteInput');
  const saveBtn = document.getElementById('saveNoteBtn');

  noteInput.value = entry.notes || '';

  saveBtn.addEventListener('click', () => {
    entry.notes = noteInput.value.trim();
    state.notesById[entry.id] = entry.notes;
    storage.saveNotes(state.notesById);
    saveBtn.textContent = 'Saved';
    setTimeout(() => {
      saveBtn.textContent = 'Save note';
    }, 900);
  });
}

function renderStatusStrip() {
  const tracked = Object.values(state.metricsById).filter((m) => m.proximityMs > 0 || m.dwellMs > 0).length;
  statusStripEl.innerHTML = `
    <span>selected: ${state.selectedId || 'none'}</span>
    <span>tracked items: ${tracked}</span>
    <span>avg speed: ${state.movement.avgSpeed.toFixed(2)} px/ms</span>
    <span>slow-zone events: ${state.movement.slowZoneEvents}</span>
  `;
}

// ---------- inference ----------
function recomputeInferredScores() {
  const decay = config.scoring.baseScoreDecay;

  memoryEntries.forEach((entry) => {
    const m = state.metricsById[entry.id];

    const dwellPoints = (m.dwellMs / config.movement.dwellThresholdMs) * config.scoring.dwellBonus;
    const revisitPoints = m.revisitCount * config.scoring.revisitBonus * 0.45;
    const slowPoints = (m.slowNearMs / config.movement.slowNearItemThresholdMs) * config.scoring.slowBonus;

    const fresh = entry.salience_score + dwellPoints + revisitPoints + slowPoints;
    m.inferredScore = Math.max(0.2, m.inferredScore * decay + fresh * (1 - decay));
  });

  boostRelatedThreads();
}

function boostRelatedThreads() {
  const threadScores = {};

  memoryEntries.forEach((entry) => {
    const m = state.metricsById[entry.id];
    threadScores[entry.thread] = (threadScores[entry.thread] || 0) + m.inferredScore;
  });

  const maxThread = Object.entries(threadScores).sort((a, b) => b[1] - a[1])[0];
  if (!maxThread) return;

  const [dominantThread, dominantScore] = maxThread;

  memoryEntries.forEach((entry) => {
    if (entry.thread !== dominantThread) return;
    const m = state.metricsById[entry.id];
    const threadStrength = Math.min(1, dominantScore / 8);
    m.inferredScore += config.scoring.threadBonus * threadStrength;
  });
}

function isThreadPromoted(threadName, id) {
  const item = memoryEntries.find((e) => e.id === id);
  if (!item || item.thread !== threadName) return false;
  const m = state.metricsById[id];
  return m.inferredScore >= config.scoring.threadPromoteAtScore;
}

// ---------- movement tracking ----------
function onMouseMove(event) {
  const now = performance.now();
  const bounds = memoryFieldEl.getBoundingClientRect();
  const pointerX = event.clientX - bounds.left;
  const pointerY = event.clientY - bounds.top;

  if (pointerX < 0 || pointerY < 0 || pointerX > bounds.width || pointerY > bounds.height) {
    return;
  }

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
    const itemX = (entry.x / 100) * bounds.width;
    const itemY = (entry.y / 100) * bounds.height;
    const dx = pointerX - itemX;
    const dy = pointerY - itemY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    metric.wasNear = metric.isNear;
    metric.isNear = distance <= config.movement.proximityRadiusPx;

    if (metric.isNear && dt > 0) {
      metric.proximityMs += dt;
      metric.dwellMs += dt;

      if (speed > 0 && speed < config.movement.slowSpeedThresholdPxPerMs) {
        metric.slowNearMs += dt;
        state.movement.slowZoneEvents += 1;
      }
    }

    if (!metric.isNear) {
      metric.dwellMs *= 0.994;
    }

    if (!metric.wasNear && metric.isNear) {
      metric.revisitCount += 1;
    }
  });
}

// ---------- UI interactions ----------
function selectItem(id) {
  state.selectedId = id;
  state.selectionHistory.push({ id, at: new Date().toISOString() });
  renderDetailPanel();
  renderMemoryField();
  renderStatusStrip();
}

function startLoops() {
  setInterval(() => {
    recomputeInferredScores();
    renderMemoryField();
  }, config.ui.renderIntervalMs);

  setInterval(() => {
    renderStatusStrip();
  }, config.ui.metricsIntervalMs);
}

memoryFieldEl.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseleave', () => {
  state.movement.lastTimestamp = null;
});

renderMemoryField();
renderDetailPanel();
renderStatusStrip();
startLoops();
