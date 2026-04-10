const config = {
  movement: {
    proximityRadiusPx: 130,
    dwellThresholdMs: 1200,
    slowSpeedThresholdPxPerMs: 0.2,
  },
  scoring: {
    dwellBonus: 1.2,
    revisitBonus: 0.45,
    slowBonus: 0.85,
    recencyBonus: 0.75,
    tagBonus: 0.55,
    cueBonus: 0.8,
    linkBonus: 0.65,
    threadBonus: 0.5,
  },
  storage: {
    memoriesKey: 'memorygate_memories',
    sessionsKey: 'memorygate_sessions',
  },
};

const memoryStore = {
  key: config.storage.memoriesKey,
  load() {
    return this.loadJson(this.key, []);
  },
  save(memories) {
    this.saveJson(this.key, memories);
  },
  loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  },
  saveJson(key, payload) {
    localStorage.setItem(key, JSON.stringify(payload));
  },
};

const sessionStore = {
  key: config.storage.sessionsKey,
  load() {
    return memoryStore.loadJson(this.key, []);
  },
  append(session) {
    const sessions = this.load();
    sessions.push(session);
    memoryStore.saveJson(this.key, sessions);
  },
};

const state = {
  route: 'home',
  recoverType: 'object',
  cue: '',
  selectedId: null,
  editingId: null,
  memories: memoryStore.load(),
  sessions: sessionStore.load(),
  session: null,
  movement: { lastX: null, lastY: null, lastTimestamp: null, avgSpeed: 0, sampleCount: 0 },
  metricsById: {},
  positions: {},
};

const pageEls = {
  home: document.getElementById('homePage'),
  recover: document.getElementById('recoverPage'),
  memoryNet: document.getElementById('memoryNetPage'),
};

const recoverZoneEl = document.getElementById('recoverZone');
const recoverLinksEl = document.getElementById('recoverLinks');
const candidateListEl = document.getElementById('candidateList');
const recoverDetailEl = document.getElementById('recoverDetail');
const recoverTelemetryEl = document.getElementById('recoverTelemetry');
const cascadeListEl = document.getElementById('cascadeList');
const cueInputEl = document.getElementById('cueInput');
const retrievalFieldEl = document.getElementById('retrievalField');
const memoryListEl = document.getElementById('memoryList');
const netFieldEl = document.getElementById('netField');
const memoryFormEl = document.getElementById('memoryForm');

function parseCsv(value) {
  return (value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function ensureMetrics() {
  state.memories.forEach((entry, idx) => {
    if (!state.metricsById[entry.id]) {
      state.metricsById[entry.id] = {
        dwellMs: 0,
        revisitCount: 0,
        slowNearMs: 0,
        inferredScore: 0.4,
        isNear: false,
        wasNear: false,
      };
    }

    if (!state.positions[entry.id]) {
      state.positions[entry.id] = {
        x: ((idx * 17) % 80) + 10,
        y: ((idx * 29) % 70) + 14,
      };
    }
  });
}

function saveMemories() {
  memoryStore.save(state.memories);
}

function setRoute(route) {
  const previous = state.route;
  state.route = route;

  if (previous !== route && route === 'recover') {
    startSession();
  }

  if (previous === 'recover' && route !== 'recover') {
    finalizeSession();
  }

  Object.entries(pageEls).forEach(([key, el]) => {
    const mapped = key === 'memoryNet' ? 'memory-net' : key;
    el.classList.toggle('hidden', mapped !== route);
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.route === route);
  });

  location.hash = route;
}

function ageInDays(timestamp) {
  const time = new Date(timestamp).getTime();
  if (!time) return 999;
  return (Date.now() - time) / (1000 * 60 * 60 * 24);
}

function cueText(entry) {
  return [
    entry.title,
    entry.fragment,
    entry.type,
    (entry.tags || []).join(' '),
    Object.values(entry.anchors || {}).flat().join(' '),
    entry.thread,
    entry.notes,
  ]
    .join(' ')
    .toLowerCase();
}

function filteredMemories() {
  const cue = state.cue.trim().toLowerCase();
  return state.memories.filter((entry) => {
    const typeMatch = entry.type === state.recoverType;
    const cueMatch = !cue || cueText(entry).includes(cue);
    return typeMatch || cueMatch;
  });
}

function scoreMemory(entry) {
  const metric = state.metricsById[entry.id] || { dwellMs: 0, revisitCount: 0, slowNearMs: 0, inferredScore: 0.4 };
  const cue = state.cue.trim().toLowerCase();
  const sameType = entry.type === state.recoverType ? 1 : 0;
  const cueMatch = cue && cueText(entry).includes(cue) ? 1 : 0;
  const tagMatch = cue
    ? (entry.tags || []).some((tag) => tag.toLowerCase().includes(cue))
      ? 1
      : 0
    : 0;

  const recencyFactor = Math.max(0, 1 - ageInDays(entry.timestamp) / 45);
  const selected = state.memories.find((x) => x.id === state.selectedId);
  const threadMatch = selected && selected.thread && selected.thread === entry.thread ? 1 : 0;
  const linkedMatch = selected && (selected.linkedIds || []).includes(entry.id) ? 1 : 0;

  const movementScore =
    (metric.dwellMs / config.movement.dwellThresholdMs) * config.scoring.dwellBonus +
    metric.revisitCount * config.scoring.revisitBonus +
    (metric.slowNearMs / config.movement.dwellThresholdMs) * config.scoring.slowBonus;

  const retrievalScore =
    sameType +
    cueMatch * config.scoring.cueBonus +
    tagMatch * config.scoring.tagBonus +
    recencyFactor * config.scoring.recencyBonus +
    threadMatch * config.scoring.threadBonus +
    linkedMatch * config.scoring.linkBonus;

  const score = movementScore + retrievalScore;
  metric.inferredScore = metric.inferredScore * 0.7 + score * 0.3;
  state.metricsById[entry.id] = metric;
  return metric.inferredScore;
}

function topCandidates(limit = 6) {
  return filteredMemories()
    .map((entry) => ({ entry, score: scoreMemory(entry) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}

function relatedMemories(memory, limit = 5) {
  if (!memory) return [];
  return state.memories
    .filter((candidate) => candidate.id !== memory.id)
    .map((candidate) => {
      let relationScore = 0;
      if ((memory.thread || '') && memory.thread === candidate.thread) relationScore += 2;
      if ((memory.linkedIds || []).includes(candidate.id) || (candidate.linkedIds || []).includes(memory.id)) relationScore += 3;
      const sharedTags = (memory.tags || []).filter((tag) => (candidate.tags || []).includes(tag));
      relationScore += Math.min(2, sharedTags.length);
      return { candidate, relationScore };
    })
    .filter((x) => x.relationScore > 0)
    .sort((a, b) => b.relationScore - a.relationScore)
    .slice(0, limit)
    .map((x) => x.candidate);
}

function drawLinks(candidates) {
  recoverLinksEl.innerHTML = '';
  if (!state.selectedId) return;
  const source = state.memories.find((entry) => entry.id === state.selectedId);
  if (!source) return;

  candidates.forEach((target) => {
    const linked = (source.linkedIds || []).includes(target.id) || source.thread === target.thread;
    if (target.id === source.id || !linked) return;

    const from = state.positions[source.id];
    const to = state.positions[target.id];
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', `${from.x}%`);
    line.setAttribute('y1', `${from.y}%`);
    line.setAttribute('x2', `${to.x}%`);
    line.setAttribute('y2', `${to.y}%`);
    line.setAttribute('stroke', '#88b7ff');
    line.setAttribute('stroke-opacity', '0.35');
    recoverLinksEl.appendChild(line);
  });
}

function renderRecoverZone() {
  recoverZoneEl.querySelectorAll('.memory-node').forEach((el) => el.remove());
  const candidates = topCandidates();

  candidates.forEach((entry) => {
    const pos = state.positions[entry.id];
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'memory-node';
    if (state.selectedId === entry.id) node.classList.add('active');

    const score = state.metricsById[entry.id].inferredScore;
    if (score > 2.2) node.classList.add('promoted');

    node.style.left = `${pos.x}%`;
    node.style.top = `${pos.y}%`;
    node.innerHTML = `<strong>${entry.title}</strong><div class="muted">${entry.type} · ${(entry.tags || []).slice(0, 2).join(' · ')}</div>`;
    node.addEventListener('click', () => selectCandidate(entry.id));
    recoverZoneEl.appendChild(node);
  });

  drawLinks(candidates);
}

function renderCandidates() {
  candidateListEl.innerHTML = '';
  const candidates = topCandidates();
  if (!candidates.length) {
    candidateListEl.innerHTML = '<p class="muted">No stored memories match this cue yet.</p>';
    return;
  }

  candidates.forEach((entry) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'candidate-btn';
    if (state.selectedId === entry.id) btn.classList.add('is-active');
    btn.innerHTML = `<strong>${entry.title}</strong><span class="muted">${entry.type}</span>`;
    btn.addEventListener('click', () => selectCandidate(entry.id));
    candidateListEl.appendChild(btn);
  });
}

function renderCascade() {
  cascadeListEl.innerHTML = '';
  const selected = state.memories.find((m) => m.id === state.selectedId);
  if (!selected) {
    cascadeListEl.innerHTML = '<p class="muted">Select a memory.</p>';
    return;
  }

  relatedMemories(selected, 5).forEach((memory) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'candidate-btn';
    btn.textContent = memory.title;
    btn.addEventListener('click', () => selectCandidate(memory.id));
    cascadeListEl.appendChild(btn);
  });
}

function renderTelemetry() {
  const selected = state.memories.find((m) => m.id === state.selectedId);
  if (!selected) {
    recoverTelemetryEl.innerHTML = '<div class="muted">Movement metrics appear after you select a candidate.</div>';
    return;
  }

  const metric = state.metricsById[selected.id];
  const reasons = [];
  if (selected.type === state.recoverType) reasons.push(`type matched ${state.recoverType}`);
  if (state.cue && cueText(selected).includes(state.cue.toLowerCase())) reasons.push('cue overlap');
  if (metric.revisitCount > 0) reasons.push(`revisited ${metric.revisitCount} times`);
  if (metric.dwellMs > 500) reasons.push(`dwell ${Math.round(metric.dwellMs)}ms`);
  if (metric.slowNearMs > 0) reasons.push(`slow-zone ${Math.round(metric.slowNearMs)}ms`);

  recoverTelemetryEl.innerHTML = `
    <div>Reasons: ${reasons.join(' · ') || 'none yet'}</div>
    <div>Avg pointer speed: ${state.movement.avgSpeed.toFixed(2)} px/ms</div>
    <div>Current score: ${metric.inferredScore.toFixed(2)}</div>
  `;
}

function selectCandidate(id) {
  state.selectedId = id;
  const entry = state.memories.find((m) => m.id === id);
  if (!entry) return;

  if (state.session && (!state.session.recallPath.length || state.session.recallPath[state.session.recallPath.length - 1] !== id)) {
    state.session.recallPath.push(id);
  }

  recoverDetailEl.innerHTML = `
    <div><strong>${entry.title}</strong></div>
    <div class="muted">${entry.timestamp.slice(0, 10)} · ${entry.type}</div>
    <p>${entry.fragment}</p>
    <p class="muted">thread: ${entry.thread || 'none'} | tags: ${(entry.tags || []).join(', ') || 'none'}</p>
    ${entry.notes ? `<p>${entry.notes}</p>` : ''}
  `;

  renderRecover();
}

function renderRecover() {
  renderCandidates();
  renderRecoverZone();
  renderCascade();
  renderTelemetry();
}

function memoryItemTemplate(entry) {
  return `
    <strong>${entry.title}</strong>
    <div class="muted">${entry.type} · ${entry.thread || 'threadless'}</div>
    <p>${entry.fragment}</p>
    <div class="chip-row">${(entry.tags || []).map((t) => `<span class="chip">${t}</span>`).join('')}</div>
    <div class="item-actions">
      <button type="button" data-action="edit" data-id="${entry.id}">Edit</button>
      <button type="button" data-action="delete" data-id="${entry.id}">Delete</button>
      <button type="button" data-action="link" data-id="${entry.id}">Link</button>
      <button type="button" data-action="recover" data-id="${entry.id}">Recover</button>
    </div>
  `;
}

function renderMemoryNet() {
  memoryListEl.innerHTML = '';
  netFieldEl.innerHTML = '';

  if (!state.memories.length) {
    memoryListEl.innerHTML = '<p class="muted">No memories saved yet.</p>';
    return;
  }

  state.memories.forEach((entry) => {
    const item = document.createElement('article');
    item.className = 'memory-list-item';
    item.innerHTML = memoryItemTemplate(entry);
    memoryListEl.appendChild(item);

    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'memory-node';
    const pos = state.positions[entry.id];
    node.style.left = `${pos.x}%`;
    node.style.top = `${pos.y}%`;
    node.innerHTML = `<strong>${entry.title}</strong><div class="muted">${entry.type}</div>`;
    node.addEventListener('click', () => {
      setRoute('recover');
      selectCandidate(entry.id);
    });
    netFieldEl.appendChild(node);
  });
}

function buildMemoryFromForm(form) {
  const existing = state.memories.find((m) => m.id === state.editingId);
  return {
    id: existing ? existing.id : `m-${Date.now()}`,
    title: form.memoryTitle.value.trim(),
    fragment: form.memoryFragment.value.trim(),
    type: form.memoryType.value,
    timestamp: existing ? existing.timestamp : new Date().toISOString(),
    tags: parseCsv(form.memoryTags.value),
    thread: form.memoryThread.value.trim(),
    anchors: {
      object: parseCsv(form.anchorObject.value),
      song: parseCsv(form.anchorSong.value),
      location: parseCsv(form.anchorLocation.value),
      person: parseCsv(form.anchorPerson.value),
      phrase: parseCsv(form.anchorPhrase.value),
    },
    linkedIds: existing ? existing.linkedIds || [] : [],
    notes: form.memoryNotes.value.trim(),
  };
}

function fillForm(entry) {
  memoryFormEl.memoryTitle.value = entry.title;
  memoryFormEl.memoryFragment.value = entry.fragment;
  memoryFormEl.memoryType.value = entry.type;
  memoryFormEl.memoryTags.value = (entry.tags || []).join(', ');
  memoryFormEl.memoryThread.value = entry.thread || '';
  memoryFormEl.anchorObject.value = (entry.anchors?.object || []).join(', ');
  memoryFormEl.anchorSong.value = (entry.anchors?.song || []).join(', ');
  memoryFormEl.anchorLocation.value = (entry.anchors?.location || []).join(', ');
  memoryFormEl.anchorPerson.value = (entry.anchors?.person || []).join(', ');
  memoryFormEl.anchorPhrase.value = (entry.anchors?.phrase || []).join(', ');
  memoryFormEl.memoryNotes.value = entry.notes || '';
}

function clearEditing() {
  state.editingId = null;
  memoryFormEl.reset();
}

function linkMemory(sourceId) {
  const source = state.memories.find((m) => m.id === sourceId);
  if (!source) return;

  const targetTitle = prompt('Link to memory title (exact):');
  if (!targetTitle) return;

  const target = state.memories.find((m) => m.title.toLowerCase() === targetTitle.toLowerCase());
  if (!target || target.id === source.id) return;

  source.linkedIds = Array.from(new Set([...(source.linkedIds || []), target.id]));
  target.linkedIds = Array.from(new Set([...(target.linkedIds || []), source.id]));
  saveMemories();
  renderMemoryNet();
  renderRecover();
}

function startSession() {
  state.session = {
    startedAt: new Date().toISOString(),
    selectedMemory: null,
    dwellStats: {},
    revisitCounts: {},
    sessionDurationMs: 0,
    recallPath: [],
    retrievalOutcome: 'Partly',
  };
}

function finalizeSession() {
  if (!state.session) return;

  const endedAt = new Date().toISOString();
  const started = new Date(state.session.startedAt).getTime();
  state.session.sessionDurationMs = Math.max(0, Date.now() - started);
  state.session.endedAt = endedAt;
  state.session.selectedMemory = state.selectedId;

  Object.entries(state.metricsById).forEach(([id, metric]) => {
    if (metric.dwellMs > 0) state.session.dwellStats[id] = Math.round(metric.dwellMs);
    if (metric.revisitCount > 0) state.session.revisitCounts[id] = metric.revisitCount;
  });

  sessionStore.append(state.session);
  state.sessions = sessionStore.load();
  state.session = null;
}

function onRecoverMove(event) {
  const now = performance.now();
  const bounds = recoverZoneEl.getBoundingClientRect();
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

  state.memories.forEach((entry) => {
    const pos = state.positions[entry.id];
    const metric = state.metricsById[entry.id];
    if (!pos || !metric) return;

    const itemX = (pos.x / 100) * bounds.width;
    const itemY = (pos.y / 100) * bounds.height;
    const distance = Math.hypot(pointerX - itemX, pointerY - itemY);

    metric.wasNear = metric.isNear;
    metric.isNear = distance <= config.movement.proximityRadiusPx;

    if (metric.isNear && dt > 0) {
      metric.dwellMs += dt;
      if (speed > 0 && speed < config.movement.slowSpeedThresholdPxPerMs) {
        metric.slowNearMs += dt;
      }
    }

    if (!metric.wasNear && metric.isNear) {
      metric.revisitCount += 1;
    }
  });

  renderRecover();
}

function wireEvents() {
  document.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => setRoute(el.dataset.route));
  });

  document.querySelectorAll('#typeSelector button').forEach((button) => {
    button.addEventListener('click', () => {
      state.recoverType = button.dataset.type;
      document.querySelectorAll('#typeSelector button').forEach((b) => b.classList.remove('is-active'));
      button.classList.add('is-active');
      renderRecover();
    });
  });

  cueInputEl.addEventListener('input', () => {
    state.cue = cueInputEl.value;
    renderRecover();
  });

  retrievalFieldEl.addEventListener('input', () => {
    const current = retrievalFieldEl.value.trim();
    if (current.length > 6 && !state.cue) {
      state.cue = current.split(' ').slice(-2).join(' ');
      cueInputEl.value = state.cue;
      renderRecover();
    }
  });

  memoryFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const built = buildMemoryFromForm(memoryFormEl);
    if (!built.title || !built.fragment || !built.type) return;

    const idx = state.memories.findIndex((m) => m.id === built.id);
    if (idx >= 0) {
      state.memories[idx] = { ...state.memories[idx], ...built };
    } else {
      state.memories.unshift(built);
    }

    ensureMetrics();
    saveMemories();
    clearEditing();
    renderMemoryNet();
    renderRecover();
  });

  memoryListEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    const entry = state.memories.find((m) => m.id === id);
    if (!entry) return;

    if (action === 'edit') {
      state.editingId = id;
      fillForm(entry);
      return;
    }

    if (action === 'delete') {
      state.memories = state.memories.filter((m) => m.id !== id).map((m) => ({
        ...m,
        linkedIds: (m.linkedIds || []).filter((linkedId) => linkedId !== id),
      }));
      saveMemories();
      renderMemoryNet();
      renderRecover();
      return;
    }

    if (action === 'link') {
      linkMemory(id);
      return;
    }

    if (action === 'recover') {
      setRoute('recover');
      selectCandidate(id);
    }
  });

  recoverZoneEl.addEventListener('mousemove', onRecoverMove);
  window.addEventListener('mouseleave', () => {
    state.movement.lastTimestamp = null;
  });

  document.querySelectorAll('.outcome-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.session) state.session.retrievalOutcome = btn.dataset.outcome;
      document.querySelectorAll('.outcome-btn').forEach((x) => x.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });
}

function init() {
  ensureMetrics();
  wireEvents();
  renderMemoryNet();
  renderRecover();

  const initial = location.hash.replace('#', '');
  const valid = ['home', 'recover', 'memory-net'];
  setRoute(valid.includes(initial) ? initial : 'home');

  const firstType = document.querySelector('#typeSelector button[data-type="object"]');
  if (firstType) firstType.classList.add('is-active');
}

init();
