const config = {
  movement: {
    proximityRadiusPx: 140,
    dwellThresholdMs: 1400,
    slowSpeedThresholdPxPerMs: 0.2,
  },
  scoring: {
    dwellBonus: 1.3,
    revisitBonus: 0.6,
    slowBonus: 1.0,
    threadBonus: 0.35,
    promoteAtScore: 2.1,
  },
  storage: {
    notesKey: 'memorygate_notes_v3',
    memoriesKey: 'memorygate_memories_v3',
    logsKey: 'memorygate_logs_v3',
  },
};

const seededMemories = [
  { id: 'm1', timestamp: '2026-03-30T08:12:00Z', title: 'First week at lab bench', fragment: 'Oscilloscope hum, coffee smell, and the click of probe switches.', tags: ['lab', 'learning', 'electronics'], thread: 'research-origin', category: 'work', emotional_state: 'focused', salience_score: 0.62, x: 8, y: 12, notes: '' },
  { id: 'm2', timestamp: '2026-03-11T22:04:00Z', title: 'Night walk after presentation', fragment: 'Replayed key questions while pacing around the block.', tags: ['walking', 'reflection'], thread: 'research-origin', category: 'walk', emotional_state: 'alert', salience_score: 0.59, x: 36, y: 18, notes: '' },
  { id: 'm3', timestamp: '2026-02-19T14:33:00Z', title: 'Whiteboard disagreement', fragment: 'Two arrows erased, one stayed, and the model finally simplified.', tags: ['team', 'modeling'], thread: 'method-shift', category: 'work', emotional_state: 'tense', salience_score: 0.65, x: 62, y: 14, notes: '' },
  { id: 'm4', timestamp: '2026-02-26T06:47:00Z', title: 'Early train notebook page', fragment: 'A sketch tied motor attention to recall confidence.', tags: ['travel', 'notebook', 'insight'], thread: 'method-shift', category: 'travel', emotional_state: 'curious', salience_score: 0.71, x: 16, y: 52, notes: '' },
  { id: 'm5', timestamp: '2026-01-22T10:20:00Z', title: 'Code review loop', fragment: 'Found a bug only after tracing user movement logs manually.', tags: ['coding', 'logs'], thread: 'tooling', category: 'work', emotional_state: 'determined', salience_score: 0.56, x: 42, y: 57, notes: '' },
  { id: 'm6', timestamp: '2026-03-03T17:16:00Z', title: 'Campus stairs realization', fragment: 'Recognition arrives before naming when body pace slows.', tags: ['movement', 'recall'], thread: 'movement-hypothesis', category: 'insight', emotional_state: 'surprised', salience_score: 0.78, x: 68, y: 48, notes: '' },
];

const storage = {
  load(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  },
  save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

const stored = storage.load(config.storage.memoriesKey, null);
const memories = stored && stored.length ? stored : seededMemories;

const state = {
  view: 'homeView',
  selectedRecoverId: null,
  selectedNetId: null,
  revealRecoverRelated: false,
  cueType: 'object',
  cueText: '',
  recoverMovement: { lastX: null, lastY: null, lastTimestamp: null, avgSpeed: 0, sampleCount: 0, slowZoneEvents: 0 },
  netMovement: { lastX: null, lastY: null, lastTimestamp: null, avgSpeed: 0, sampleCount: 0, slowZoneEvents: 0 },
  metricsById: {},
  session: {
    id: `session-${Date.now()}`,
    startedAt: new Date().toISOString(),
    selectedItem: null,
    dwellPerItem: {},
    revisitPerItem: {},
    cueType: 'object',
    cueText: '',
  },
};

memories.forEach((entry) => {
  state.metricsById[entry.id] = { dwellMs: 0, revisitCount: 0, slowNearMs: 0, inferredScore: entry.salience_score, threadPull: 0, isNear: false, wasNear: false };
});

const homeView = document.getElementById('homeView');
const recoverView = document.getElementById('recoverView');
const memoryNetView = document.getElementById('memoryNetView');
const recoverField = document.getElementById('recoverField');
const netField = document.getElementById('netField');
const recoverLinkLayer = document.getElementById('recoverLinkLayer');
const netLinkLayer = document.getElementById('netLinkLayer');
const candidateListEl = document.getElementById('candidateList');
const recoverDetailEl = document.getElementById('recoverDetail');
const recoverTelemetryEl = document.getElementById('recoverTelemetry');
const memoryListEl = document.getElementById('memoryList');
const netDetailEl = document.getElementById('netDetail');
const recoverTypeEl = document.getElementById('recoverType');
const recoverCueEl = document.getElementById('recoverCue');

function openView(id) {
  [homeView, recoverView, memoryNetView].forEach((view) => view.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  state.view = id;
  renderAll();
}

document.querySelectorAll('[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => openView(btn.dataset.go));
});

recoverTypeEl.addEventListener('change', () => {
  state.cueType = recoverTypeEl.value;
  state.session.cueType = state.cueType;
  recomputeScores();
  renderRecoverSide();
  renderField('recover');
});

recoverCueEl.addEventListener('input', () => {
  state.cueText = recoverCueEl.value.trim().toLowerCase();
  state.session.cueText = state.cueText;
  recomputeScores();
  renderRecoverSide();
  renderField('recover');
});

function cueBoost(entry) {
  if (!state.cueText) return 0;
  const hay = `${entry.title} ${entry.fragment} ${entry.tags.join(' ')} ${entry.thread} ${entry.category}`.toLowerCase();
  return hay.includes(state.cueText) ? 0.8 : 0;
}

function dominantThread() {
  const t = {};
  memories.forEach((entry) => { t[entry.thread] = (t[entry.thread] || 0) + state.metricsById[entry.id].inferredScore; });
  return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function recomputeScores() {
  const dom = dominantThread();
  memories.forEach((entry) => {
    const m = state.metricsById[entry.id];
    const dwell = (m.dwellMs / config.movement.dwellThresholdMs) * config.scoring.dwellBonus;
    const revisit = m.revisitCount * config.scoring.revisitBonus;
    const slow = (m.slowNearMs / config.movement.dwellThresholdMs) * config.scoring.slowBonus;
    const cue = cueBoost(entry);
    let score = entry.salience_score + dwell + revisit + slow + cue;
    m.threadPull = 0;
    if (dom && entry.thread === dom) {
      m.threadPull = config.scoring.threadBonus;
      score += m.threadPull;
    }
    m.inferredScore = Math.max(0.2, m.inferredScore * 0.8 + score * 0.2);
  });
}

function relationType(source, target) {
  if (!source || !target || source.id === target.id) return null;
  if (source.thread === target.thread) return 'thread';
  if (source.tags.some((tag) => target.tags.includes(tag))) return 'tag';
  if (source.category === target.category || source.emotional_state === target.emotional_state) return 'neighbor';
  return null;
}

function drawLinks(layerEl, selectedId) {
  layerEl.innerHTML = '';
  if (!selectedId) return;
  const source = memories.find((m) => m.id === selectedId);
  memories.forEach((entry) => {
    const type = relationType(source, entry);
    if (!type) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', `${source.x}%`);
    line.setAttribute('y1', `${source.y}%`);
    line.setAttribute('x2', `${entry.x}%`);
    line.setAttribute('y2', `${entry.y}%`);
    line.setAttribute('class', `link-line link-${type}`);
    layerEl.appendChild(line);
  });
}

function renderField(which) {
  const fieldEl = which === 'recover' ? recoverField : netField;
  const layerEl = which === 'recover' ? recoverLinkLayer : netLinkLayer;
  const selectedId = which === 'recover' ? state.selectedRecoverId : state.selectedNetId;

  fieldEl.querySelectorAll('.memory-item').forEach((el) => el.remove());

  const selectedEntry = memories.find((m) => m.id === selectedId);
  const linked = new Set(
    selectedEntry
      ? memories.filter((entry) => relationType(selectedEntry, entry)).map((entry) => entry.id)
      : []
  );

  memories.forEach((entry) => {
    const m = state.metricsById[entry.id];
    const card = document.createElement('article');
    card.className = 'memory-item';
    card.style.left = `${entry.x}%`;
    card.style.top = `${entry.y}%`;
    card.style.transform = `translate(-50%, -50%) scale(${Math.min(1.28, 0.92 + m.inferredScore * 0.15)})`;
    if (m.inferredScore >= config.scoring.promoteAtScore) card.classList.add('promoted');
    if (selectedId === entry.id) card.classList.add('selected');
    if (selectedId && linked.has(entry.id)) card.classList.add('linked');
    if (selectedId && !linked.has(entry.id) && entry.id !== selectedId) card.classList.add('dimmed');

    card.innerHTML = `<h3>${entry.title}</h3><p>${entry.fragment.slice(0, 72)}${entry.fragment.length > 72 ? '…' : ''}</p><div class="meta">${entry.tags.join(', ')}</div>`;
    card.addEventListener('click', () => {
      if (which === 'recover') {
        state.selectedRecoverId = entry.id;
        state.session.selectedItem = entry.id;
        renderRecoverSide();
      } else {
        state.selectedNetId = entry.id;
        renderNetSide();
      }
      renderField(which);
    });
    fieldEl.appendChild(card);
  });

  drawLinks(layerEl, selectedId);
}

function recoverTopCandidates() {
  return [...memories]
    .sort((a, b) => state.metricsById[b.id].inferredScore - state.metricsById[a.id].inferredScore)
    .slice(0, 6);
}

function renderRecoverSide() {
  const top = recoverTopCandidates();
  candidateListEl.innerHTML = top
    .map((entry) => `<button class="candidate-btn ${state.selectedRecoverId === entry.id ? 'active' : ''}" data-select="${entry.id}">${entry.title}</button>`)
    .join('');

  candidateListEl.querySelectorAll('[data-select]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedRecoverId = btn.dataset.select;
      renderRecoverSide();
      renderField('recover');
    });
  });

  if (!state.selectedRecoverId) {
    recoverDetailEl.innerHTML = '<p class="muted">Select a candidate.</p>';
  } else {
    const entry = memories.find((m) => m.id === state.selectedRecoverId);
    const metrics = state.metricsById[entry.id];
    recoverDetailEl.innerHTML = `
      <h2>${entry.title}</h2>
      <p>${entry.fragment}</p>
      <p class="muted">${entry.tags.join(', ')} · ${entry.thread}</p>
      <div class="why-block">
        <strong>Why this surfaced</strong>
        <ul>
          <li>Base salience ${entry.salience_score.toFixed(2)}</li>
          <li>Dwell ${Math.round(metrics.dwellMs)}ms · revisits ${metrics.revisitCount}</li>
          <li>Slow-zone ${Math.round(metrics.slowNearMs)}ms · thread pull ${metrics.threadPull.toFixed(2)}</li>
          ${state.cueText ? `<li>Cue match boost: ${cueBoost(entry).toFixed(2)}</li>` : ''}
        </ul>
      </div>
    `;
  }

  const movement = state.recoverMovement;
  recoverTelemetryEl.innerHTML = `
    <div>avg speed</div><div>${movement.avgSpeed.toFixed(2)} px/ms</div>
    <div>slow zones</div><div>${movement.slowZoneEvents}</div>
    <div>cue type</div><div>${state.cueType}</div>
    <div>tracked</div><div>${Object.values(state.metricsById).filter((m) => m.dwellMs > 0).length}</div>
  `;
}

function renderNetSide() {
  memoryListEl.innerHTML = memories
    .slice()
    .reverse()
    .map((entry) => `<button class="candidate-btn ${state.selectedNetId === entry.id ? 'active' : ''}" data-net="${entry.id}">${entry.title}</button>`)
    .join('');

  memoryListEl.querySelectorAll('[data-net]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedNetId = btn.dataset.net;
      renderNetSide();
      renderField('net');
    });
  });

  if (!state.selectedNetId) {
    netDetailEl.innerHTML = '<p class="muted">Select a memory.</p>';
    return;
  }

  const entry = memories.find((m) => m.id === state.selectedNetId);
  netDetailEl.innerHTML = `
    <h2>${entry.title}</h2>
    <p>${entry.fragment}</p>
    <p class="muted">${entry.tags.join(', ')} · ${entry.thread} · ${entry.category}</p>
  `;
}

function trackMovement(event, fieldEl, movementState) {
  const now = performance.now();
  const bounds = fieldEl.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return;

  let dt = 0;
  let speed = 0;
  if (movementState.lastTimestamp !== null) {
    dt = now - movementState.lastTimestamp;
    const dx = x - movementState.lastX;
    const dy = y - movementState.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    speed = dt > 0 ? dist / dt : 0;
    movementState.sampleCount += 1;
    movementState.avgSpeed += (speed - movementState.avgSpeed) / movementState.sampleCount;
  }
  movementState.lastX = x;
  movementState.lastY = y;
  movementState.lastTimestamp = now;

  memories.forEach((entry) => {
    const m = state.metricsById[entry.id];
    const itemX = (entry.x / 100) * bounds.width;
    const itemY = (entry.y / 100) * bounds.height;
    const distance = Math.hypot(x - itemX, y - itemY);

    m.wasNear = m.isNear;
    m.isNear = distance <= config.movement.proximityRadiusPx;

    if (m.isNear && dt > 0) {
      m.dwellMs += dt;
      if (speed > 0 && speed < config.movement.slowSpeedThresholdPxPerMs) {
        m.slowNearMs += dt;
        movementState.slowZoneEvents += 1;
      }
      state.session.dwellPerItem[entry.id] = Math.round(m.dwellMs);
    }

    if (!m.wasNear && m.isNear) {
      m.revisitCount += 1;
      state.session.revisitPerItem[entry.id] = m.revisitCount;
    }
  });
}

recoverField.addEventListener('mousemove', (event) => {
  if (state.view !== 'recoverView') return;
  trackMovement(event, recoverField, state.recoverMovement);
});

netField.addEventListener('mousemove', (event) => {
  if (state.view !== 'memoryNetView') return;
  trackMovement(event, netField, state.netMovement);
});

window.addEventListener('mouseleave', () => {
  state.recoverMovement.lastTimestamp = null;
  state.netMovement.lastTimestamp = null;
});

document.getElementById('memoryForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const title = document.getElementById('memTitle').value.trim();
  const fragment = document.getElementById('memFragment').value.trim();
  if (!title || !fragment) return;

  const tags = document.getElementById('memTags').value.split(',').map((s) => s.trim()).filter(Boolean);
  const thread = document.getElementById('memThread').value.trim() || 'untagged-thread';
  const category = document.getElementById('memCategory').value.trim() || 'general';

  const memory = {
    id: `m${Date.now()}`,
    timestamp: new Date().toISOString(),
    title,
    fragment,
    tags,
    thread,
    category,
    emotional_state: 'captured',
    salience_score: 0.55,
    x: 12 + Math.random() * 74,
    y: 12 + Math.random() * 74,
    notes: '',
  };

  memories.push(memory);
  state.metricsById[memory.id] = { dwellMs: 0, revisitCount: 0, slowNearMs: 0, inferredScore: memory.salience_score, threadPull: 0, isNear: false, wasNear: false };
  storage.save(config.storage.memoriesKey, memories);
  event.target.reset();
  renderNetSide();
  renderField('net');
});

function saveSessionLog() {
  const logs = storage.load(config.storage.logsKey, []);
  logs.push({
    id: state.session.id,
    startedAt: state.session.startedAt,
    endedAt: new Date().toISOString(),
    cueType: state.session.cueType,
    cueText: state.session.cueText,
    selectedItem: state.session.selectedItem,
    dwellPerItem: state.session.dwellPerItem,
    revisitPerItem: state.session.revisitPerItem,
    topCandidates: recoverTopCandidates().slice(0, 3).map((m) => m.id),
  });
  storage.save(config.storage.logsKey, logs);
}

window.addEventListener('beforeunload', () => {
  storage.save(config.storage.memoriesKey, memories);
  saveSessionLog();
});

function renderAll() {
  recomputeScores();
  renderField('recover');
  renderField('net');
  renderRecoverSide();
  renderNetSide();
}

setInterval(() => {
  recomputeScores();
  if (state.view === 'recoverView') {
    renderField('recover');
    renderRecoverSide();
  } else if (state.view === 'memoryNetView') {
    renderField('net');
    renderNetSide();
  }
}, 220);

renderAll();
