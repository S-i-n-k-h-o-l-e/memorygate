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
    threadBonus: 0.35,
  },
  storage: {
    netKey: 'memorygate_memory_net_v1',
    notesKey: 'memorygate_v2_notes',
  },
};

const seedMemories = [
  { id: 'm1', title: 'First week at lab bench', fragment: 'Oscilloscope hum and coffee smell.', tags: ['object', 'lab'], thread: 'research-origin', category: 'work', timestamp: '2026-03-30T08:12:00Z', x: 10, y: 14, salience_score: 0.62 },
  { id: 'm2', title: 'Night walk after presentation', fragment: 'Replayed key questions while pacing.', tags: ['location', 'walking'], thread: 'research-origin', category: 'reflection', timestamp: '2026-03-11T22:04:00Z', x: 35, y: 22, salience_score: 0.59 },
  { id: 'm3', title: 'Whiteboard disagreement', fragment: 'One arrow stayed and the model simplified.', tags: ['phrase', 'team'], thread: 'method-shift', category: 'work', timestamp: '2026-02-19T14:33:00Z', x: 60, y: 18, salience_score: 0.65 },
  { id: 'm4', title: 'Early train notebook page', fragment: 'A sketch tied movement to confidence.', tags: ['lost thought', 'travel'], thread: 'method-shift', category: 'insight', timestamp: '2026-02-26T06:47:00Z', x: 18, y: 55, salience_score: 0.71 },
  { id: 'm5', title: 'Campus stairs realization', fragment: 'Recognition arrived before naming.', tags: ['name', 'movement'], thread: 'movement-hypothesis', category: 'insight', timestamp: '2026-03-03T17:16:00Z', x: 70, y: 52, salience_score: 0.78 },
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
  route: 'home',
  recoverType: 'object',
  cue: '',
  selectedId: null,
  movement: { lastX: null, lastY: null, lastTimestamp: null, avgSpeed: 0, sampleCount: 0 },
  metricsById: {},
  memoryNet: storage.loadJson(config.storage.netKey, []),
  notesById: storage.loadJson(config.storage.notesKey, {}),
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
const cueInputEl = document.getElementById('cueInput');
const retrievalFieldEl = document.getElementById('retrievalField');
const memoryListEl = document.getElementById('memoryList');
const netFieldEl = document.getElementById('netField');

function allMemories() {
  return [...seedMemories, ...state.memoryNet];
}

function ensureMetrics() {
  allMemories().forEach((entry, idx) => {
    if (!state.metricsById[entry.id]) {
      state.metricsById[entry.id] = { dwellMs: 0, revisitCount: 0, slowNearMs: 0, inferredScore: entry.salience_score || 0.45, isNear: false, wasNear: false };
      state.positions[entry.id] = { x: entry.x || ((idx * 17) % 80) + 10, y: entry.y || ((idx * 23) % 70) + 15 };
    }
  });
}

function setRoute(route) {
  state.route = route;
  Object.entries(pageEls).forEach(([key, el]) => {
    const mapped = key === 'memoryNet' ? 'memory-net' : key;
    el.classList.toggle('hidden', mapped !== route);
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.route === route);
  });
  location.hash = route;
}

function scoreMemory(entry) {
  const m = state.metricsById[entry.id];
  const dwell = (m.dwellMs / config.movement.dwellThresholdMs) * config.scoring.dwellBonus;
  const revisit = m.revisitCount * config.scoring.revisitBonus;
  const slow = (m.slowNearMs / config.movement.dwellThresholdMs) * config.scoring.slowBonus;
  const cue = state.cue.trim().toLowerCase();
  const cueMatch = cue && `${entry.title} ${entry.fragment} ${(entry.tags || []).join(' ')}`.toLowerCase().includes(cue) ? 0.45 : 0;
  const typeMatch = (entry.tags || []).includes(state.recoverType) ? 0.35 : 0;
  const threadMatch = state.selectedId && entry.thread === (allMemories().find((mry) => mry.id === state.selectedId)?.thread) ? config.scoring.threadBonus : 0;

  const nextScore = (entry.salience_score || 0.45) + dwell + revisit + slow + cueMatch + typeMatch + threadMatch;
  m.inferredScore = Math.max(0.2, m.inferredScore * 0.76 + nextScore * 0.24);
}

function topCandidates() {
  return allMemories()
    .map((entry) => {
      scoreMemory(entry);
      return entry;
    })
    .sort((a, b) => state.metricsById[b.id].inferredScore - state.metricsById[a.id].inferredScore)
    .slice(0, 6);
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
    node.style.left = `${pos.x}%`;
    node.style.top = `${pos.y}%`;
    node.innerHTML = `<strong>${entry.title}</strong><div class="muted">${(entry.tags || []).slice(0, 2).join(' · ')}</div>`;
    node.addEventListener('click', () => selectCandidate(entry.id));
    recoverZoneEl.appendChild(node);
  });

  drawLinks(candidates);
}

function drawLinks(candidates) {
  recoverLinksEl.innerHTML = '';
  if (!state.selectedId) return;
  const source = allMemories().find((entry) => entry.id === state.selectedId);
  if (!source) return;

  candidates.forEach((target) => {
    if (target.id === source.id || target.thread !== source.thread) return;
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

function renderCandidates() {
  candidateListEl.innerHTML = '';
  topCandidates().forEach((entry) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'candidate-btn';
    if (state.selectedId === entry.id) btn.classList.add('is-active');
    btn.textContent = `${entry.title}`;
    btn.addEventListener('click', () => selectCandidate(entry.id));
    candidateListEl.appendChild(btn);
  });
}

function selectCandidate(id) {
  state.selectedId = id;
  const entry = allMemories().find((m) => m.id === id);
  const metric = state.metricsById[id];
  const reasons = [];
  if ((entry.tags || []).includes(state.recoverType)) reasons.push(`Matched type: ${state.recoverType}`);
  if (state.cue && `${entry.title} ${entry.fragment}`.toLowerCase().includes(state.cue.toLowerCase())) reasons.push('Cue overlap detected');
  if (metric.revisitCount > 0) reasons.push(`Revisited ${metric.revisitCount} times during movement`);
  if (metric.dwellMs > 600) reasons.push(`High dwell (${Math.round(metric.dwellMs)}ms)`);

  recoverDetailEl.innerHTML = `
    <div><strong>${entry.title}</strong></div>
    <div class="muted">${entry.timestamp ? entry.timestamp.slice(0, 10) : 'saved'} · ${(entry.tags || []).join(', ')}</div>
    <p>${entry.fragment}</p>
    ${reasons.length ? `<div><strong>Why this surfaced</strong><ul>${reasons.map((r) => `<li>${r}</li>`).join('')}</ul></div>` : ''}
  `;

  renderRecover();
}

function renderTelemetry() {
  recoverTelemetryEl.innerHTML = `
    <div>Type: ${state.recoverType}</div>
    <div>Selected: ${state.selectedId || 'none'}</div>
    <div>Avg speed: ${state.movement.avgSpeed.toFixed(2)} px/ms</div>
  `;
}

function renderRecover() {
  renderCandidates();
  renderRecoverZone();
  renderTelemetry();
}

function renderMemoryNet() {
  memoryListEl.innerHTML = '';
  netFieldEl.innerHTML = '';

  state.memoryNet.forEach((entry, idx) => {
    const item = document.createElement('article');
    item.className = 'memory-list-item';
    item.innerHTML = `<strong>${entry.title}</strong><div class="muted">${entry.thread || 'threadless'} · ${entry.category || 'general'}</div><p>${entry.fragment}</p>`;
    memoryListEl.appendChild(item);

    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'memory-node';
    const pos = state.positions[entry.id] || { x: ((idx * 21) % 78) + 11, y: ((idx * 19) % 68) + 16 };
    state.positions[entry.id] = pos;
    node.style.left = `${pos.x}%`;
    node.style.top = `${pos.y}%`;
    node.innerHTML = `<strong>${entry.title}</strong><div class="muted">${(entry.tags || []).slice(0, 2).join(' · ')}</div>`;
    node.addEventListener('click', () => {
      setRoute('recover');
      selectCandidate(entry.id);
    });
    netFieldEl.appendChild(node);
  });
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

  allMemories().forEach((entry) => {
    const pos = state.positions[entry.id];
    if (!pos) return;
    const metric = state.metricsById[entry.id];
    const itemX = (pos.x / 100) * bounds.width;
    const itemY = (pos.y / 100) * bounds.height;
    const distance = Math.hypot(pointerX - itemX, pointerY - itemY);

    metric.wasNear = metric.isNear;
    metric.isNear = distance <= config.movement.proximityRadiusPx;

    if (metric.isNear && dt > 0) {
      metric.dwellMs += dt;
      if (speed > 0 && speed < config.movement.slowSpeedThresholdPxPerMs) metric.slowNearMs += dt;
    }

    if (!metric.wasNear && metric.isNear) metric.revisitCount += 1;
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
    if (current.length > 7 && !state.cue) {
      state.cue = current.split(' ').slice(-3).join(' ');
      cueInputEl.value = state.cue;
    }
  });

  document.getElementById('memoryForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = document.getElementById('memoryTitle').value.trim();
    const fragment = document.getElementById('memoryFragment').value.trim();
    if (!title || !fragment) return;

    const tags = document.getElementById('memoryTags').value.split(',').map((t) => t.trim()).filter(Boolean);
    const thread = document.getElementById('memoryThread').value.trim();
    const category = document.getElementById('memoryCategory').value.trim();

    const entry = {
      id: `net-${Date.now()}`,
      title,
      fragment,
      tags,
      thread,
      category,
      timestamp: new Date().toISOString(),
      salience_score: 0.52,
    };

    state.memoryNet.unshift(entry);
    storage.saveJson(config.storage.netKey, state.memoryNet);
    ensureMetrics();
    event.target.reset();
    renderMemoryNet();
    renderRecover();
  });

  recoverZoneEl.addEventListener('mousemove', onRecoverMove);
  window.addEventListener('mouseleave', () => {
    state.movement.lastTimestamp = null;
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
