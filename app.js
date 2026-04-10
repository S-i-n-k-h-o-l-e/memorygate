/*
MemoryGate V2: movement-led retrieval experiment
Modules: config, data, storage, state, rendering, movement tracking,
inference, recall cascade, logging, UI interactions.
*/

// ---------- config ----------
const config = {
  movement: {
    proximityRadiusPx: 145,
    dwellDecayOutside: 0.994,
    slowSpeedThresholdPxPerMs: 0.2,
  },
  scoring: {
    baseScoreDecay: 0.985,
    baseSalienceWeight: 1,
    dwellWeight: 1.35,
    revisitWeight: 0.95,
    slowWeight: 1.1,
    threadPullWeight: 0.46,
    tagOverlapWeight: 0.38,
    conceptualNeighborWeight: 0.28,
  },
  ui: {
    renderIntervalMs: 160,
    metricsIntervalMs: 400,
    revealRelatedCount: 4,
    maxVisibleWeakMode: 5,
  },
  modes: {
    freeDrift: {
      dwellMultiplier: 1,
      revisitMultiplier: 1,
      slowMultiplier: 1,
      anchorStabilityBonus: 1,
      weakClutterReduction: false,
    },
    focusedRecall: {
      dwellMultiplier: 1,
      revisitMultiplier: 1.35,
      slowMultiplier: 1,
      anchorStabilityBonus: 1.35,
      weakClutterReduction: false,
    },
    weakMemory: {
      dwellMultiplier: 0.9,
      revisitMultiplier: 1.1,
      slowMultiplier: 0.95,
      anchorStabilityBonus: 1.2,
      weakClutterReduction: true,
    },
  },
  storage: {
    notesKey: 'memorygate_v1_notes',
    sessionLogsKey: 'memorygate_v2_session_logs',
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
  loadJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  },
  saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

// ---------- state ----------
const state = {
  selectedId: null,
  leadId: null,
  lockedId: null,
  revealRelated: false,
  mode: 'freeDrift',
  fieldSortMode: 'relevance',
  notesById: storage.loadJson(config.storage.notesKey, {}),
  sessionLogs: storage.loadJson(config.storage.sessionLogsKey, []),
  session: {
    active: false,
    startedAt: null,
    anchorId: null,
    path: [],
    relatedRevealed: false,
    noteAddedById: {},
    outcome: null,
  },
  movement: {
    lastX: null,
    lastY: null,
    lastTimestamp: null,
    avgSpeed: 0,
    sampleCount: 0,
    slowZoneEvents: 0,
  },
  metricsById: {},
  recentlyAttendedIds: [],
};

memoryEntries.forEach((entry) => {
  state.metricsById[entry.id] = {
    dwellMs: 0,
    revisitCount: 0,
    proximityMs: 0,
    slowNearMs: 0,
    inferredScore: entry.salience_score,
    threadPull: 0,
    isNear: false,
    wasNear: false,
    wasLead: false,
    leadStreak: 0,
    reasons: [],
  };
  if (state.notesById[entry.id]) {
    entry.notes = state.notesById[entry.id];
  }
});

// ---------- dom refs ----------
const dom = {
  memoryField: document.getElementById('memoryField'),
  detail: document.getElementById('detailContent'),
  status: document.getElementById('statusStrip'),
  liveSignal: document.getElementById('liveSignalBlock'),
  modeSelect: document.getElementById('modeSelect'),
  fieldSortSelect: document.getElementById('fieldSortSelect'),
  lockBtn: document.getElementById('lockBtn'),
  revealBtn: document.getElementById('revealBtn'),
  sessionBtn: document.getElementById('sessionBtn'),
};

// ---------- helpers ----------
function getModeConfig() {
  return config.modes[state.mode] || config.modes.freeDrift;
}

function findEntry(id) {
  return memoryEntries.find((entry) => entry.id === id);
}

function maxByScore(items) {
  return [...items].sort((a, b) => state.metricsById[b.id].inferredScore - state.metricsById[a.id].inferredScore)[0];
}

function pushRecentAttention(id) {
  state.recentlyAttendedIds = [id, ...state.recentlyAttendedIds.filter((x) => x !== id)].slice(0, 5);
}

function pairTagOverlap(a, b) {
  const setB = new Set(b.tags);
  return a.tags.filter((tag) => setB.has(tag)).length;
}

function conceptualNeighborScore(a, b) {
  let score = 0;
  if (a.thread === b.thread) score += 2;
  if (a.emotional_state === b.emotional_state) score += 1;
  score += pairTagOverlap(a, b) * 1.4;
  const daysApart = Math.abs(Date.parse(a.timestamp) - Date.parse(b.timestamp)) / (1000 * 60 * 60 * 24);
  if (daysApart < 30) score += 0.7;
  return score;
}

function relatedCandidates(anchorId, count = config.ui.revealRelatedCount) {
  const anchor = findEntry(anchorId);
  if (!anchor) return [];
  return memoryEntries
    .filter((entry) => entry.id !== anchorId)
    .map((entry) => ({ id: entry.id, score: conceptualNeighborScore(anchor, entry) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((item) => item.id);
}

function getDominantThread() {
  const bucket = {};
  memoryEntries.forEach((entry) => {
    bucket[entry.thread] = (bucket[entry.thread] || 0) + state.metricsById[entry.id].inferredScore;
  });
  return Object.entries(bucket).sort((a, b) => b[1] - a[1])[0] || null;
}

function getAnchorId() {
  return state.lockedId || state.selectedId || state.leadId;
}

function updateBodyModeClass() {
  document.body.classList.toggle('weak-memory', state.mode === 'weakMemory');
}

// ---------- field organization ----------
function orderedEntries() {
  if (state.fieldSortMode === 'thread') {
    return [...memoryEntries].sort((a, b) => `${a.thread}-${a.title}`.localeCompare(`${b.thread}-${b.title}`));
  }

  if (state.fieldSortMode === 'emotional_state') {
    return [...memoryEntries].sort((a, b) => `${a.emotional_state}-${a.title}`.localeCompare(`${b.emotional_state}-${b.title}`));
  }

  if (state.fieldSortMode === 'time') {
    return [...memoryEntries].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }

  return [...memoryEntries].sort((a, b) => state.metricsById[b.id].inferredScore - state.metricsById[a.id].inferredScore);
}

function buildDisplayPositions(entries) {
  const cols = 4;
  return entries.reduce((acc, entry, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 15 + col * 23;
    const y = 17 + row * 30;
    acc[entry.id] = { x, y };
    return acc;
  }, {});
}

function getVisibleEntries() {
  const ordered = orderedEntries();
  const modeCfg = getModeConfig();
  if (!modeCfg.weakClutterReduction) return ordered;

  const anchorId = getAnchorId();
  const shortlist = ordered.slice(0, config.ui.maxVisibleWeakMode);
  if (anchorId && !shortlist.some((entry) => entry.id === anchorId)) {
    const anchor = findEntry(anchorId);
    if (anchor) shortlist[shortlist.length - 1] = anchor;
  }
  return shortlist;
}

// ---------- inference ----------
function recomputeScores() {
  const modeCfg = getModeConfig();

  memoryEntries.forEach((entry) => {
    const m = state.metricsById[entry.id];
    const base = entry.salience_score * config.scoring.baseSalienceWeight;
    const dwell = (m.dwellMs / 1200) * config.scoring.dwellWeight * modeCfg.dwellMultiplier;
    const revisit = m.revisitCount * config.scoring.revisitWeight * modeCfg.revisitMultiplier * 0.34;
    const slow = (m.slowNearMs / 900) * config.scoring.slowWeight * modeCfg.slowMultiplier;

    m.inferredScore = Math.max(
      0.18,
      m.inferredScore * config.scoring.baseScoreDecay + (base + dwell + revisit + slow) * (1 - config.scoring.baseScoreDecay)
    );
    m.threadPull = 0;
  });

  const dominantThread = getDominantThread();
  if (dominantThread) {
    const [threadName, threadScore] = dominantThread;
    const pull = Math.min(1, threadScore / 9) * config.scoring.threadPullWeight;
    memoryEntries.forEach((entry) => {
      if (entry.thread === threadName) {
        state.metricsById[entry.id].threadPull = pull;
        state.metricsById[entry.id].inferredScore += pull;
      }
    });
  }

  applyRecencyContextBoosts();
  updateLeadItem();
  updateReasons();
}

function applyRecencyContextBoosts() {
  if (!state.recentlyAttendedIds.length) return;

  const attendedEntries = state.recentlyAttendedIds.map(findEntry).filter(Boolean);
  memoryEntries.forEach((entry) => {
    const m = state.metricsById[entry.id];
    attendedEntries.forEach((attended) => {
      if (entry.id === attended.id) return;

      if (entry.thread === attended.thread) {
        m.inferredScore += config.scoring.threadPullWeight * 0.12;
      }

      const overlap = pairTagOverlap(entry, attended);
      if (overlap > 0) {
        m.inferredScore += overlap * config.scoring.tagOverlapWeight * 0.06;
      }

      const neighbor = conceptualNeighborScore(entry, attended);
      m.inferredScore += neighbor * config.scoring.conceptualNeighborWeight * 0.02;
    });
  });
}

function updateLeadItem() {
  if (state.lockedId) {
    state.leadId = state.lockedId;
    return;
  }

  const nextLead = maxByScore(memoryEntries);
  state.leadId = nextLead ? nextLead.id : null;
}

function updateReasons() {
  const attendedSet = new Set(state.recentlyAttendedIds);

  memoryEntries.forEach((entry) => {
    const m = state.metricsById[entry.id];
    const reasons = [];

    if (m.dwellMs > 1200) reasons.push('high dwell time near item');
    if (m.revisitCount >= 2) reasons.push('repeated revisits');
    if (m.slowNearMs > 700) reasons.push('slowed movement nearby');

    const relatedToRecent = memoryEntries.some((other) => {
      if (!attendedSet.has(other.id) || other.id === entry.id) return false;
      return pairTagOverlap(entry, other) > 0;
    });
    if (relatedToRecent) reasons.push('tag overlap with recently attended items');

    const sameThreadRecent = memoryEntries.some((other) => {
      if (!attendedSet.has(other.id) || other.id === entry.id) return false;
      return other.thread === entry.thread;
    });
    if (sameThreadRecent) reasons.push('same thread as recently attended items');

    if (!reasons.length) reasons.push('baseline salience and current movement context');
    m.reasons = reasons;
  });
}

// ---------- movement tracking ----------
function onMouseMove(event) {
  const bounds = dom.memoryField.getBoundingClientRect();
  const pointerX = event.clientX - bounds.left;
  const pointerY = event.clientY - bounds.top;
  if (pointerX < 0 || pointerY < 0 || pointerX > bounds.width || pointerY > bounds.height) return;

  const now = performance.now();
  let dt = 0;
  let speed = 0;

  if (state.movement.lastTimestamp !== null) {
    dt = now - state.movement.lastTimestamp;
    const dx = pointerX - state.movement.lastX;
    const dy = pointerY - state.movement.lastY;
    speed = dt > 0 ? Math.sqrt(dx * dx + dy * dy) / dt : 0;

    state.movement.sampleCount += 1;
    state.movement.avgSpeed += (speed - state.movement.avgSpeed) / state.movement.sampleCount;
  }

  state.movement.lastX = pointerX;
  state.movement.lastY = pointerY;
  state.movement.lastTimestamp = now;

  const entries = getVisibleEntries();
  const positions = buildDisplayPositions(entries);

  entries.forEach((entry) => {
    const m = state.metricsById[entry.id];
    const pos = positions[entry.id] || { x: entry.x, y: entry.y };
    const itemX = (pos.x / 100) * bounds.width;
    const itemY = (pos.y / 100) * bounds.height;
    const distance = Math.hypot(pointerX - itemX, pointerY - itemY);

    m.wasNear = m.isNear;
    m.isNear = distance <= config.movement.proximityRadiusPx;

    if (m.isNear && dt > 0) {
      m.proximityMs += dt;
      m.dwellMs += dt;
      if (speed > 0 && speed < config.movement.slowSpeedThresholdPxPerMs) {
        m.slowNearMs += dt;
        state.movement.slowZoneEvents += 1;
      }
    } else {
      m.dwellMs *= config.movement.dwellDecayOutside;
    }

    if (!m.wasNear && m.isNear) {
      m.revisitCount += 1;
      pushRecentAttention(entry.id);
    }
  });
}

// ---------- recall cascade ----------
function revealRelatedFromAnchor(anchorId, shouldRecord = true) {
  if (!anchorId) return [];
  state.revealRelated = true;
  const related = relatedCandidates(anchorId);
  if (state.session.active && shouldRecord) {
    state.session.relatedRevealed = true;
  }
  return related;
}

function registerPathStep(id, source) {
  if (!state.session.active) return;
  state.session.path.push({ id, source, at: new Date().toISOString() });
}

function startRecallSession() {
  const anchorId = getAnchorId();
  if (!anchorId) return;

  state.session = {
    active: true,
    startedAt: new Date().toISOString(),
    anchorId,
    path: [{ id: anchorId, source: 'anchor', at: new Date().toISOString() }],
    relatedRevealed: false,
    noteAddedById: {},
    outcome: null,
  };

  revealRelatedFromAnchor(anchorId, true);
  registerPathStep(anchorId, 'session-start');
  persistSessionSnapshot('session_started');
}

function persistSessionSnapshot(eventType) {
  const sessionDurationMs = state.session.startedAt ? Date.now() - Date.parse(state.session.startedAt) : 0;
  const topCandidates = [...memoryEntries]
    .sort((a, b) => state.metricsById[b.id].inferredScore - state.metricsById[a.id].inferredScore)
    .slice(0, 5)
    .map((entry) => ({ id: entry.id, score: Number(state.metricsById[entry.id].inferredScore.toFixed(3)) }));

  const log = {
    eventType,
    at: new Date().toISOString(),
    mode: state.mode,
    selectedId: state.selectedId,
    lockedId: state.lockedId,
    anchorId: getAnchorId(),
    sessionDurationMs,
    relatedRevealed: state.revealRelated || state.session.relatedRevealed,
    outcome: state.session.outcome,
    topCandidates,
    totalsByItem: memoryEntries.reduce((acc, entry) => {
      const m = state.metricsById[entry.id];
      acc[entry.id] = {
        dwellMs: Math.round(m.dwellMs),
        revisitCount: m.revisitCount,
        slowNearMs: Math.round(m.slowNearMs),
        noteAdded: Boolean(state.session.noteAddedById[entry.id] || state.notesById[entry.id]),
      };
      return acc;
    }, {}),
    recallPath: [...state.session.path],
  };

  state.sessionLogs = [...state.sessionLogs, log].slice(-80);
  storage.saveJson(config.storage.sessionLogsKey, state.sessionLogs);
}

// ---------- rendering ----------
function renderMemoryField() {
  const entries = getVisibleEntries();
  const positions = buildDisplayPositions(entries);
  const relatedIds = state.revealRelated ? relatedCandidates(getAnchorId()) : [];

  dom.memoryField.innerHTML = '';

  const maxScore = Math.max(...entries.map((entry) => state.metricsById[entry.id].inferredScore), 1);

  entries.forEach((entry) => {
    const m = state.metricsById[entry.id];
    const isLeading = state.leadId === entry.id;
    const isSelected = state.selectedId === entry.id;
    const isLocked = state.lockedId === entry.id;
    const isRelated = relatedIds.includes(entry.id);

    const scoreFactor = 0.9 + (m.inferredScore / maxScore) * 0.36;
    const leadBoost = isLeading ? 0.09 : 0;
    const relatedBoost = isRelated ? 0.04 : 0;

    const card = document.createElement('article');
    card.className = 'memory-item';
    card.dataset.id = entry.id;
    card.style.left = `${positions[entry.id].x}%`;
    card.style.top = `${positions[entry.id].y}%`;
    card.style.transform = `translate(-50%, -50%) scale(${(scoreFactor + leadBoost + relatedBoost).toFixed(3)})`;

    if (isLeading) card.classList.add('leading');
    if (isSelected) card.classList.add('selected');
    if (isLocked) card.classList.add('locked');
    if (isRelated) card.classList.add('related');
    if (state.mode === 'weakMemory' && !isLeading && !isSelected && !isLocked && !isRelated) {
      card.classList.add('dimmed');
    }

    const threadMarker = m.threadPull > 0 ? `thread+${m.threadPull.toFixed(2)}` : 'thread+0';
    card.innerHTML = `
      <h3>${entry.title}</h3>
      <p>${entry.fragment.slice(0, 72)}${entry.fragment.length > 72 ? '…' : ''}</p>
      <div class="meta">${entry.timestamp.slice(0, 10)} · ${entry.tags.join(', ')} · ${threadMarker}</div>
    `;

    card.addEventListener('click', () => selectItem(entry.id, 'manual'));
    dom.memoryField.appendChild(card);
  });
}

function renderLiveSignalBlock() {
  const currentId = getAnchorId() || state.leadId;
  if (!currentId) {
    dom.liveSignal.innerHTML = '<p class="muted">Live signal will appear when movement starts.</p>';
    return;
  }

  const entry = findEntry(currentId);
  const m = state.metricsById[currentId];
  dom.liveSignal.innerHTML = `
    <div class="signal-title">Live signal · ${entry.title}</div>
    <div class="signal-grid">
      <span>dwell: ${Math.round(m.dwellMs)}ms</span>
      <span>revisits: ${m.revisitCount}</span>
      <span>slow-zone: ${Math.round(m.slowNearMs)}ms</span>
      <span>score: ${m.inferredScore.toFixed(2)}</span>
      <span>thread pull: ${m.threadPull.toFixed(2)}</span>
      <span>state: ${state.lockedId ? 'locked-anchor' : 'dynamic lead'}</span>
    </div>
  `;
}

function renderWhySurfaced(entryId) {
  const m = state.metricsById[entryId];
  const reasons = m.reasons.slice(0, 5);
  return `
    <div class="why-block">
      <h4>Why this was surfaced</h4>
      <ul>${reasons.map((reason) => `<li>${reason}</li>`).join('')}</ul>
    </div>
  `;
}

function renderRelatedList(entryId) {
  const related = relatedCandidates(entryId, 5);
  return `
    <div class="related-list">
      <h4>Recall cascade neighbors</h4>
      <ul>
        ${related
          .map((id) => `<li><button class="related-chip" data-related-id="${id}" type="button">${findEntry(id).title}</button></li>`)
          .join('')}
      </ul>
    </div>
  `;
}

function renderOutcomePrompt() {
  const selected = state.session.outcome;
  return `
    <div class="outcome-block">
      <h4>Did this help you retrieve something?</h4>
      <div class="outcome-buttons">
        ${['No', 'Partly', 'Yes']
          .map((option) => `<button class="outcome-btn ${selected === option ? 'active' : ''}" data-outcome="${option}" type="button">${option}</button>`)
          .join('')}
      </div>
    </div>
  `;
}

function renderDetailPanel() {
  const selectedId = state.selectedId || state.leadId;
  if (!selectedId) {
    dom.detail.innerHTML = '<p class="muted">Click a memory item to inspect details and add a note.</p>';
    return;
  }

  const entry = findEntry(selectedId);
  const m = state.metricsById[selectedId];

  dom.detail.innerHTML = `
    <div class="detail-row"><strong>Title:</strong> ${entry.title}</div>
    <div class="detail-row"><strong>Timestamp:</strong> ${entry.timestamp}</div>
    <div class="detail-row"><strong>Thread:</strong> ${entry.thread}</div>
    <div class="detail-row"><strong>Tags:</strong> ${entry.tags.join(', ')}</div>
    <div class="detail-row"><strong>Emotional state:</strong> ${entry.emotional_state}</div>
    <div class="detail-row"><strong>Fragment:</strong> ${entry.fragment}</div>
    <div class="detail-row"><strong>Inferred relevance:</strong> ${m.inferredScore.toFixed(2)}
      <span class="muted">(dwell ${Math.round(m.dwellMs)}ms · revisits ${m.revisitCount} · slow ${Math.round(m.slowNearMs)}ms)</span>
    </div>

    ${renderWhySurfaced(selectedId)}
    ${renderRelatedList(selectedId)}

    <label for="noteInput" class="detail-row"><strong>Optional reflection note</strong></label>
    <textarea id="noteInput" placeholder="Add a short note after inspecting this memory..."></textarea>
    <button id="saveNoteBtn" type="button">Save note</button>

    ${renderOutcomePrompt()}
    <p class="muted">Typing remains secondary; movement and revisit dynamics drive surfacing.</p>
  `;

  const noteInput = document.getElementById('noteInput');
  const saveBtn = document.getElementById('saveNoteBtn');
  noteInput.value = entry.notes || '';

  saveBtn.addEventListener('click', () => {
    entry.notes = noteInput.value.trim();
    state.notesById[entry.id] = entry.notes;
    storage.saveJson(config.storage.notesKey, state.notesById);
    if (state.session.active) {
      state.session.noteAddedById[entry.id] = Boolean(entry.notes);
      persistSessionSnapshot('note_saved');
    }
    saveBtn.textContent = 'Saved';
    setTimeout(() => {
      saveBtn.textContent = 'Save note';
    }, 900);
  });

  dom.detail.querySelectorAll('[data-related-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-related-id');
      selectItem(id, 'related-neighbor');
    });
  });

  dom.detail.querySelectorAll('[data-outcome]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const outcome = btn.getAttribute('data-outcome');
      state.session.outcome = outcome;
      persistSessionSnapshot('outcome_selected');
      renderDetailPanel();
    });
  });
}

function renderStatusStrip() {
  const tracked = Object.values(state.metricsById).filter((m) => m.proximityMs > 0 || m.dwellMs > 0).length;
  dom.status.innerHTML = `
    <span>mode: ${state.mode}</span>
    <span>selected: ${state.selectedId || 'none'}</span>
    <span>lead: ${state.leadId || 'none'}</span>
    <span>locked: ${state.lockedId || 'none'}</span>
    <span>tracked items: ${tracked}</span>
    <span>avg speed: ${state.movement.avgSpeed.toFixed(2)} px/ms</span>
    <span>slow-zone events: ${state.movement.slowZoneEvents}</span>
    <span>session: ${state.session.active ? 'active' : 'idle'}</span>
  `;

  dom.lockBtn.textContent = state.lockedId ? 'Unlock selection' : 'Lock selection';
  dom.lockBtn.classList.toggle('active', Boolean(state.lockedId));
  dom.revealBtn.classList.toggle('active', state.revealRelated);
  dom.sessionBtn.classList.toggle('active', state.session.active);
}

// ---------- interactions ----------
function selectItem(id, source = 'manual') {
  state.selectedId = id;
  pushRecentAttention(id);
  if (state.session.active) {
    registerPathStep(id, source);
    persistSessionSnapshot('path_step');
  }
  renderDetailPanel();
  renderMemoryField();
  renderLiveSignalBlock();
  renderStatusStrip();
}

function toggleLockSelection() {
  if (state.lockedId) {
    state.lockedId = null;
    persistSessionSnapshot('anchor_unlocked');
  } else {
    const anchor = getAnchorId();
    if (!anchor) return;
    state.lockedId = anchor;
    selectItem(anchor, 'locked_anchor');
    persistSessionSnapshot('anchor_locked');
  }
}

function toggleRevealRelated() {
  const anchor = getAnchorId();
  if (!anchor) return;

  state.revealRelated = !state.revealRelated;
  if (state.revealRelated) {
    revealRelatedFromAnchor(anchor, true);
    if (state.session.active) registerPathStep(anchor, 'related_reveal');
    persistSessionSnapshot('related_reveal_toggled_on');
  } else {
    persistSessionSnapshot('related_reveal_toggled_off');
  }
}

function onModeChange(newMode) {
  if (!config.modes[newMode]) return;
  state.mode = newMode;
  updateBodyModeClass();
  persistSessionSnapshot('mode_changed');
}

function onFieldSortChange(mode) {
  state.fieldSortMode = mode;
  renderMemoryField();
  renderStatusStrip();
}

function startLoops() {
  setInterval(() => {
    recomputeScores();
    renderMemoryField();
    renderLiveSignalBlock();
    if (!state.selectedId) renderDetailPanel();
  }, config.ui.renderIntervalMs);

  setInterval(() => {
    renderStatusStrip();
  }, config.ui.metricsIntervalMs);
}

function bindUI() {
  dom.memoryField.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseleave', () => {
    state.movement.lastTimestamp = null;
  });

  dom.modeSelect.addEventListener('change', (event) => {
    onModeChange(event.target.value);
  });

  dom.fieldSortSelect.addEventListener('change', (event) => {
    onFieldSortChange(event.target.value);
  });

  dom.lockBtn.addEventListener('click', toggleLockSelection);
  dom.revealBtn.addEventListener('click', toggleRevealRelated);
  dom.sessionBtn.addEventListener('click', () => {
    if (!state.session.active) {
      startRecallSession();
      dom.sessionBtn.textContent = 'Session active';
    } else {
      persistSessionSnapshot('session_checkpoint');
    }
    renderMemoryField();
    renderDetailPanel();
    renderLiveSignalBlock();
    renderStatusStrip();
  });
}

// ---------- boot ----------
updateBodyModeClass();
recomputeScores();
renderMemoryField();
renderLiveSignalBlock();
renderDetailPanel();
renderStatusStrip();
bindUI();
startLoops();
