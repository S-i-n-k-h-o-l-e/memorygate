const NODE_TYPES = ['memory', 'person', 'place', 'object', 'song', 'phrase', 'event', 'date'];
const CUE_TYPES = ['object', 'song', 'place', 'person', 'phrase', 'thought', 'date/time', 'event', 'other'];

const config = {
  movement: { proximityRadiusPx: 120, dwellThresholdMs: 1200, slowSpeedThresholdPxPerMs: 0.22 },
  scoring: { dwellBonus: 1.2, revisitBonus: 0.45, slowBonus: 0.9, recencyBonus: 0.7, cueBonus: 1, linkBonus: 0.7, tagBonus: 0.55 },
  storage: {
    profilesKey: 'memorygate_profiles',
    activeProfileKey: 'memorygate_active_profile',
    userDataPrefix: 'memorygate_user_data',
  },
};

const storageEngine = {
  getItem(key) { return localStorage.getItem(key); },
  setItem(key, value) { localStorage.setItem(key, value); },
  removeItem(key) { localStorage.removeItem(key); },
};

const createLocalProfileAuthRepository = (engine, cfg) => ({
  loadProfiles() {
    try {
      return JSON.parse(engine.getItem(cfg.storage.profilesKey) || '[]');
    } catch {
      return [];
    }
  },
  saveProfiles(profiles) {
    engine.setItem(cfg.storage.profilesKey, JSON.stringify(profiles));
  },
  listProfiles() {
    return this.loadProfiles().sort((a, b) => a.name.localeCompare(b.name));
  },
  createProfile(name) {
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (!normalized) throw new Error('Profile name is required.');
    const profiles = this.loadProfiles();
    const exists = profiles.some((p) => p.name.toLowerCase() === normalized.toLowerCase());
    if (exists) throw new Error('That profile already exists.');
    const profile = { id: uid('usr'), name: normalized, createdAt: nowIso() };
    profiles.push(profile);
    this.saveProfiles(profiles);
    this.setActiveProfileId(profile.id);
    return profile;
  },
  setActiveProfileId(profileId) {
    if (!profileId) {
      engine.removeItem(cfg.storage.activeProfileKey);
      return;
    }
    engine.setItem(cfg.storage.activeProfileKey, profileId);
  },
  getActiveProfileId() {
    return engine.getItem(cfg.storage.activeProfileKey);
  },
  getActiveProfile() {
    const id = this.getActiveProfileId();
    if (!id) return null;
    return this.loadProfiles().find((profile) => profile.id === id) || null;
  },
  signIn(profileId) {
    const profile = this.loadProfiles().find((item) => item.id === profileId);
    if (!profile) throw new Error('Profile not found.');
    this.setActiveProfileId(profile.id);
    return profile;
  },
  signOut() {
    this.setActiveProfileId(null);
  },
});

const createNamespacedMemoryRepository = (engine, cfg) => ({
  key(userId) {
    return `${cfg.storage.userDataPrefix}:${userId}`;
  },
  loadUserData(userId) {
    if (!userId) return defaultUserData();
    try {
      const raw = engine.getItem(this.key(userId));
      return raw ? { ...defaultUserData(), ...JSON.parse(raw) } : defaultUserData();
    } catch {
      return defaultUserData();
    }
  },
  saveUserData(userId, payload) {
    if (!userId) return;
    engine.setItem(this.key(userId), JSON.stringify(payload));
  },
});

const authRepository = createLocalProfileAuthRepository(storageEngine, config);
const memoryRepository = createNamespacedMemoryRepository(storageEngine, config);

function defaultUserData() {
  return {
    nodes: [],
    memories: [],
    sessions: [],
    settings: { pointerSlowThreshold: 0.22, recoverLimit: 10 },
  };
}

const state = {
  route: 'home',
  cueType: 'object',
  cue: '',
  recencyDays: 'all',
  selectedId: null,
  editingId: null,
  currentUser: null,
  profiles: [],
  nodes: [],
  memories: [],
  sessions: [],
  settings: { pointerSlowThreshold: 0.22, recoverLimit: 10 },
  session: null,
  movement: { lastX: null, lastY: null, lastTimestamp: null, avgSpeed: 0, sampleCount: 0 },
  metricsById: {},
  positions: {},
};

const el = {
  pages: {
    auth: document.getElementById('authPage'),
    home: document.getElementById('homePage'),
    recover: document.getElementById('recoverPage'),
    memoryNet: document.getElementById('memoryNetPage'),
    timeline: document.getElementById('timelinePage'),
    settings: document.getElementById('settingsPage'),
  },
  userMenu: document.getElementById('userMenu'),
  currentUserLabel: document.getElementById('currentUserLabel'),
  signOutBtn: document.getElementById('signOutBtn'),
  signInForm: document.getElementById('signInForm'),
  signInProfileSelect: document.getElementById('signInProfileSelect'),
  createProfileForm: document.getElementById('createProfileForm'),
  createProfileName: document.getElementById('createProfileName'),
  authFeedback: document.getElementById('authFeedback'),
  typeSelector: document.getElementById('typeSelector'),
  cueInput: document.getElementById('cueInput'),
  recencyFilter: document.getElementById('recencyFilter'),
  recoverZone: document.getElementById('recoverZone'),
  recoverLinks: document.getElementById('recoverLinks'),
  candidateStrip: document.getElementById('candidateStrip'),
  recoverDetail: document.getElementById('recoverDetail'),
  cascadeList: document.getElementById('cascadeList'),
  recoverTelemetry: document.getElementById('recoverTelemetry'),
  netField: document.getElementById('netField'),
  netLinks: document.getElementById('netLinks'),
  nodeList: document.getElementById('nodeList'),
  memoryForm: document.getElementById('memoryForm'),
  anchorForm: document.getElementById('anchorForm'),
  eventForm: document.getElementById('eventForm'),
  editorForm: document.getElementById('editorForm'),
  deleteNodeBtn: document.getElementById('deleteNodeBtn'),
  linkForm: document.getElementById('linkForm'),
  eventTimeline: document.getElementById('eventTimeline'),
  dateClusters: document.getElementById('dateClusters'),
  timelineDetail: document.getElementById('timelineDetail'),
  slowThresholdInput: document.getElementById('slowThresholdInput'),
  nodeLimitInput: document.getElementById('nodeLimitInput'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
};

const parseCsv = (value) => (value || '').split(',').map((v) => v.trim()).filter(Boolean);
const nowIso = () => new Date().toISOString();
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const allNodes = () => state.nodes;
const memoryNodes = () => state.nodes.filter((n) => n.nodeType === 'memory');
const eventNodes = () => state.nodes.filter((n) => n.nodeType === 'event');
const byId = (id) => state.nodes.find((n) => n.id === id);

function isAuthenticated() {
  return Boolean(state.currentUser);
}

function setAuthFeedback(message) {
  el.authFeedback.textContent = message || '';
}

function resetTransientState() {
  state.selectedId = null;
  state.editingId = null;
  state.session = null;
  state.metricsById = {};
  state.positions = {};
  state.movement = { lastX: null, lastY: null, lastTimestamp: null, avgSpeed: 0, sampleCount: 0 };
  el.editorForm.classList.add('hidden');
}

function loadCurrentUserData() {
  const data = memoryRepository.loadUserData(state.currentUser?.id);
  state.nodes = data.nodes || [];
  state.memories = data.memories || [];
  state.sessions = data.sessions || [];
  state.settings = { pointerSlowThreshold: 0.22, recoverLimit: 10, ...(data.settings || {}) };
  config.movement.slowSpeedThresholdPxPerMs = state.settings.pointerSlowThreshold;
}

function persistAll() {
  if (!isAuthenticated()) return;
  state.memories = memoryNodes();
  memoryRepository.saveUserData(state.currentUser.id, {
    nodes: state.nodes,
    memories: state.memories,
    sessions: state.sessions,
    settings: state.settings,
  });
}

function ensureModel() {
  state.nodes = state.nodes.map((n) => ({ linkedNodeIds: [], tags: [], ...n }));
  state.memories.forEach((memory) => {
    if (!byId(memory.id)) {
      state.nodes.push({ ...memory, nodeType: 'memory', linkedNodeIds: memory.linkedNodeIds || [] });
    }
  });
  allNodes().forEach((node, idx) => {
    if (!state.metricsById[node.id]) state.metricsById[node.id] = { dwellMs: 0, revisitCount: 0, slowNearMs: 0, inferredScore: 0.4, isNear: false, wasNear: false };
    if (!state.positions[node.id]) state.positions[node.id] = { x: ((idx * 19) % 80) + 10, y: ((idx * 31) % 70) + 12 };
  });
  persistAll();
}

function setRoute(route) {
  if (!isAuthenticated()) route = 'auth';
  const prev = state.route;
  state.route = route;
  if (prev !== 'recover' && route === 'recover') state.session = { startedAt: nowIso(), selectedNode: null, dwellPerNode: {}, revisitCounts: {}, sessionDurationMs: 0, recallPath: [], retrievalOutcome: 'Partly' };
  if (prev === 'recover' && route !== 'recover' && state.session) finalizeSession();

  Object.entries(el.pages).forEach(([key, page]) => page.classList.toggle('hidden', (key === 'memoryNet' ? 'memory-net' : key) !== route));
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const disabled = !isAuthenticated();
    btn.disabled = disabled;
    btn.classList.toggle('is-active', btn.dataset.route === route && !disabled);
  });
  if (route !== 'auth') location.hash = route;
}

function ageDays(timestamp) { return (Date.now() - new Date(timestamp || nowIso()).getTime()) / 86400000; }
function searchableText(node) {
  return [node.title, node.label, node.fragment, node.notes, node.location, (node.people || []).join(' '), (node.tags || []).join(' '), node.memoryType, node.thread].join(' ').toLowerCase();
}

function recoverPool() {
  const cue = state.cue.toLowerCase().trim();
  return allNodes().filter((node) => {
    const cueTypeMatch = state.cueType === 'date/time' ? node.nodeType === 'date' : node.nodeType === state.cueType || (state.cueType === 'event' && node.nodeType === 'event');
    const cueTextMatch = !cue || searchableText(node).includes(cue);
    const recencyMatch = state.recencyDays === 'all' || ageDays(node.rememberedAt || node.createdAt) <= Number(state.recencyDays);
    return cueTypeMatch || (cueTextMatch && recencyMatch);
  });
}

function scoreNode(node) {
  const metric = state.metricsById[node.id];
  const cue = state.cue.toLowerCase().trim();
  const cueMatch = cue && searchableText(node).includes(cue) ? 1 : 0;
  const recencyFactor = Math.max(0, 1 - ageDays(node.rememberedAt || node.createdAt) / 90);
  const selected = byId(state.selectedId);
  const linkedMatch = selected && ((selected.linkedNodeIds || []).includes(node.id) || (node.linkedNodeIds || []).includes(selected.id)) ? 1 : 0;
  const tagMatch = cue && (node.tags || []).some((tag) => tag.toLowerCase().includes(cue)) ? 1 : 0;
  const movement = (metric.dwellMs / config.movement.dwellThresholdMs) * config.scoring.dwellBonus + metric.revisitCount * config.scoring.revisitBonus + (metric.slowNearMs / config.movement.dwellThresholdMs) * config.scoring.slowBonus;
  const retrieval = cueMatch * config.scoring.cueBonus + recencyFactor * config.scoring.recencyBonus + linkedMatch * config.scoring.linkBonus + tagMatch * config.scoring.tagBonus;
  metric.inferredScore = metric.inferredScore * 0.68 + (movement + retrieval) * 0.32;
  return metric.inferredScore;
}

function topRecoverCandidates() {
  return recoverPool().map((node) => ({ node, score: scoreNode(node) })).sort((a, b) => b.score - a.score).slice(0, state.settings.recoverLimit).map((x) => x.node);
}

function renderLinks(svg, sourceNodes, inRecover = false) {
  svg.innerHTML = '';
  sourceNodes.forEach((source) => {
    (source.linkedNodeIds || []).forEach((targetId) => {
      const target = byId(targetId);
      if (!target) return;
      if (inRecover && !sourceNodes.some((n) => n.id === targetId)) return;
      const from = state.positions[source.id];
      const to = state.positions[target.id];
      if (!from || !to) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${from.x}%`);
      line.setAttribute('y1', `${from.y}%`);
      line.setAttribute('x2', `${to.x}%`);
      line.setAttribute('y2', `${to.y}%`);
      line.setAttribute('stroke', '#8ecbff');
      line.setAttribute('stroke-opacity', '0.26');
      svg.appendChild(line);
    });
  });
}

function nodeLabel(node) { return node.title || node.label || 'Untitled'; }

function renderRecover() {
  if (!isAuthenticated()) return;
  const candidates = topRecoverCandidates();
  el.recoverZone.querySelectorAll('.graph-node').forEach((n) => n.remove());
  candidates.forEach((node) => {
    const pos = state.positions[node.id];
    const metric = state.metricsById[node.id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `graph-node ${node.nodeType}`;
    if (metric.inferredScore > 2.2) btn.classList.add('promoted');
    if (state.selectedId === node.id) btn.classList.add('active');
    btn.style.left = `${pos.x}%`;
    btn.style.top = `${pos.y}%`;
    btn.innerHTML = `<strong>${nodeLabel(node)}</strong><div class="muted">${node.nodeType}</div>`;
    btn.addEventListener('click', () => selectNode(node.id));
    el.recoverZone.appendChild(btn);
  });
  renderLinks(el.recoverLinks, candidates, true);

  el.candidateStrip.innerHTML = candidates.map((n) => `<button type="button" class="candidate-pill" data-pick="${n.id}">${nodeLabel(n)}</button>`).join('') || '<p class="muted">No saved nodes match this cue yet.</p>';
  el.candidateStrip.querySelectorAll('button[data-pick]').forEach((btn) => btn.addEventListener('click', () => selectNode(btn.dataset.pick)));

  const selected = byId(state.selectedId);
  if (!selected) {
    el.recoverDetail.innerHTML = '<p class="muted">Select a node.</p>';
    el.cascadeList.innerHTML = '<p class="muted">Select a node to see linked paths.</p>';
    return;
  }

  el.recoverDetail.innerHTML = `<strong>${nodeLabel(selected)}</strong><div class="muted">${selected.nodeType}</div><p>${selected.fragment || selected.notes || ''}</p><p class="muted">tags: ${(selected.tags || []).join(', ') || 'none'}</p>`;
  const cascade = (selected.linkedNodeIds || []).map(byId).filter(Boolean).slice(0, 8);
  el.cascadeList.innerHTML = cascade.map((n) => `<button type="button" class="candidate-pill" data-cascade="${n.id}">${nodeLabel(n)}</button>`).join('') || '<p class="muted">No linked nodes yet.</p>';
  el.cascadeList.querySelectorAll('button[data-cascade]').forEach((btn) => btn.addEventListener('click', () => selectNode(btn.dataset.cascade)));

  const metric = state.metricsById[selected.id];
  const reasons = [];
  if (state.cue && searchableText(selected).includes(state.cue.toLowerCase())) reasons.push('cue overlap');
  if (metric.revisitCount) reasons.push(`revisited ${metric.revisitCount}x`);
  if (metric.dwellMs > 400) reasons.push(`dwell ${Math.round(metric.dwellMs)}ms`);
  if (metric.slowNearMs) reasons.push(`slow movement ${Math.round(metric.slowNearMs)}ms`);
  if ((selected.linkedNodeIds || []).length) reasons.push(`${selected.linkedNodeIds.length} graph links`);
  el.recoverTelemetry.innerHTML = `<div>Why this surfaced: ${reasons.join(' · ') || 'No strong signals yet'}</div><div>Current score: ${metric.inferredScore.toFixed(2)}</div><div>Avg pointer speed: ${state.movement.avgSpeed.toFixed(2)} px/ms</div>`;
}

function selectNode(id) {
  state.selectedId = id;
  if (state.session) {
    state.session.selectedNode = id;
    if (!state.session.recallPath.length || state.session.recallPath[state.session.recallPath.length - 1] !== id) state.session.recallPath.push(id);
  }
  renderRecover();
  renderMemoryNet();
}

function renderMemoryNet() {
  if (!isAuthenticated()) return;
  el.nodeList.innerHTML = '';
  el.netField.querySelectorAll('.graph-node').forEach((n) => n.remove());
  allNodes().forEach((node) => {
    const item = document.createElement('article');
    item.className = 'node-item';
    item.innerHTML = `<strong>${nodeLabel(node)}</strong><div class="muted">${node.nodeType}</div><div class="item-actions"><button type="button" data-edit="${node.id}">Edit</button><button type="button" data-select="${node.id}">Open</button></div>`;
    el.nodeList.appendChild(item);

    const pos = state.positions[node.id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `graph-node ${node.nodeType}`;
    if (state.selectedId === node.id) btn.classList.add('active');
    btn.style.left = `${pos.x}%`;
    btn.style.top = `${pos.y}%`;
    btn.innerHTML = `<strong>${nodeLabel(node)}</strong><div class="muted">${node.nodeType}</div>`;
    btn.addEventListener('click', () => {
      state.selectedId = node.id;
      openEditor(node.id);
      renderMemoryNet();
    });
    el.netField.appendChild(btn);
  });
  renderLinks(el.netLinks, allNodes(), false);

  const options = allNodes().map((n) => `<option value="${n.id}">${nodeLabel(n)} (${n.nodeType})</option>`).join('');
  el.linkForm.sourceId.innerHTML = `<option value="">source</option>${options}`;
  el.linkForm.targetId.innerHTML = `<option value="">target</option>${options}`;
}

function renderTimeline() {
  if (!isAuthenticated()) return;
  const events = eventNodes().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  el.eventTimeline.innerHTML = events.map((event) => `<button type="button" class="node-item" data-event="${event.id}"><strong>${event.title}</strong><div class="muted">${new Date(event.startTime).toLocaleString()}</div></button>`).join('') || '<p class="muted">No events yet.</p>';

  const clusters = memoryNodes().reduce((acc, memory) => {
    const date = (memory.rememberedAt || memory.createdAt || nowIso()).slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(memory);
    return acc;
  }, {});

  el.dateClusters.innerHTML = Object.entries(clusters).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => `<button type="button" class="node-item" data-date="${date}"><strong>${date}</strong><div class="muted">${items.length} memories</div></button>`).join('') || '<p class="muted">No memories yet.</p>';

  el.eventTimeline.querySelectorAll('button[data-event]').forEach((btn) => btn.addEventListener('click', () => showTimelineDetail(byId(btn.dataset.event))));
  el.dateClusters.querySelectorAll('button[data-date]').forEach((btn) => btn.addEventListener('click', () => showDateCluster(btn.dataset.date)));
}

function showTimelineDetail(eventNode) {
  if (!eventNode) return;
  const linked = (eventNode.linkedNodeIds || []).map(byId).filter(Boolean);
  el.timelineDetail.innerHTML = `<strong>${eventNode.title}</strong><div class="muted">${new Date(eventNode.startTime).toLocaleString()}${eventNode.endTime ? ` → ${new Date(eventNode.endTime).toLocaleString()}` : ''}</div><p>${eventNode.notes || ''}</p><h3>Linked nodes</h3>${linked.map((n) => `<div>${nodeLabel(n)} <span class="muted">(${n.nodeType})</span></div>`).join('') || '<p class="muted">None linked.</p>'}`;
}

function showDateCluster(date) {
  const matched = memoryNodes().filter((memory) => (memory.rememberedAt || memory.createdAt || '').slice(0, 10) === date);
  el.timelineDetail.innerHTML = `<strong>${date}</strong>${matched.map((m) => `<div>${nodeLabel(m)} <span class="muted">${m.memoryType || 'memory'}</span></div>`).join('')}`;
}

function openEditor(id) {
  const node = byId(id);
  if (!node) return;
  state.editingId = id;
  el.editorForm.classList.remove('hidden');
  el.editorForm.title.value = node.title || node.label || '';
  el.editorForm.fragment.value = node.fragment || '';
  el.editorForm.tags.value = (node.tags || []).join(', ');
  el.editorForm.thread.value = node.thread || '';
  el.editorForm.notes.value = node.notes || '';
}

function upsertNode(node) {
  const idx = state.nodes.findIndex((n) => n.id === node.id);
  if (idx >= 0) state.nodes[idx] = { ...state.nodes[idx], ...node };
  else state.nodes.unshift(node);
  ensureModel();
  renderMemoryNet();
  renderRecover();
  renderTimeline();
}

function deleteNode(id) {
  state.nodes = state.nodes.filter((n) => n.id !== id).map((n) => ({ ...n, linkedNodeIds: (n.linkedNodeIds || []).filter((lid) => lid !== id) }));
  state.selectedId = state.selectedId === id ? null : state.selectedId;
  state.editingId = null;
  el.editorForm.classList.add('hidden');
  ensureModel();
  renderMemoryNet();
  renderRecover();
  renderTimeline();
}

function finalizeSession() {
  state.session.sessionDurationMs = Math.max(0, Date.now() - new Date(state.session.startedAt).getTime());
  Object.entries(state.metricsById).forEach(([id, metric]) => {
    if (metric.dwellMs > 0) state.session.dwellPerNode[id] = Math.round(metric.dwellMs);
    if (metric.revisitCount > 0) state.session.revisitCounts[id] = metric.revisitCount;
  });
  state.session.endedAt = nowIso();
  state.sessions.push(state.session);
  state.session = null;
  persistAll();
}

function onRecoverMove(event) {
  if (!isAuthenticated()) return;
  const b = el.recoverZone.getBoundingClientRect();
  const x = event.clientX - b.left;
  const y = event.clientY - b.top;
  if (x < 0 || y < 0 || x > b.width || y > b.height) return;

  const now = performance.now();
  let dt = 0;
  let speed = 0;
  if (state.movement.lastTimestamp != null) {
    dt = now - state.movement.lastTimestamp;
    const dx = x - state.movement.lastX;
    const dy = y - state.movement.lastY;
    speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
    state.movement.sampleCount += 1;
    state.movement.avgSpeed += (speed - state.movement.avgSpeed) / state.movement.sampleCount;
  }
  state.movement.lastX = x;
  state.movement.lastY = y;
  state.movement.lastTimestamp = now;

  topRecoverCandidates().forEach((node) => {
    const pos = state.positions[node.id];
    const metric = state.metricsById[node.id];
    const nx = (pos.x / 100) * b.width;
    const ny = (pos.y / 100) * b.height;
    const dist = Math.hypot(x - nx, y - ny);
    metric.wasNear = metric.isNear;
    metric.isNear = dist <= config.movement.proximityRadiusPx;
    if (metric.isNear && dt > 0) {
      metric.dwellMs += dt;
      if (speed > 0 && speed < config.movement.slowSpeedThresholdPxPerMs) metric.slowNearMs += dt;
    }
    if (!metric.wasNear && metric.isNear) metric.revisitCount += 1;
  });

  renderRecover();
}

function renderAuth() {
  state.profiles = authRepository.listProfiles();
  el.signInProfileSelect.innerHTML = '<option value="">Select profile</option>' + state.profiles.map((profile) => `<option value="${profile.id}">${profile.name}</option>`).join('');
  el.signInForm.querySelector('button[type="submit"]').disabled = state.profiles.length === 0;
  if (state.profiles.length === 0) setAuthFeedback('Create your first profile to start.');
}

function onSignedIn(profile) {
  state.currentUser = profile;
  resetTransientState();
  loadCurrentUserData();
  ensureModel();
  el.currentUserLabel.textContent = `Signed in as ${profile.name}`;
  el.userMenu.classList.remove('hidden');
  renderMemoryNet();
  renderRecover();
  renderTimeline();
  setAuthFeedback('');
  const valid = ['home', 'recover', 'memory-net', 'timeline', 'settings'];
  const route = location.hash.replace('#', '');
  setRoute(valid.includes(route) ? route : 'home');
  el.slowThresholdInput.value = state.settings.pointerSlowThreshold;
  el.nodeLimitInput.value = state.settings.recoverLimit;
}

function signOut() {
  if (state.route === 'recover' && state.session) finalizeSession();
  authRepository.signOut();
  state.currentUser = null;
  state.nodes = [];
  state.memories = [];
  state.sessions = [];
  state.settings = { pointerSlowThreshold: 0.22, recoverLimit: 10 };
  resetTransientState();
  el.userMenu.classList.add('hidden');
  setRoute('auth');
  renderAuth();
}

function wireEvents() {
  document.querySelectorAll('[data-route]').forEach((btn) => btn.addEventListener('click', () => setRoute(btn.dataset.route)));

  CUE_TYPES.forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = type;
    button.classList.toggle('is-active', type === state.cueType);
    button.addEventListener('click', () => {
      state.cueType = type;
      el.typeSelector.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
      button.classList.add('is-active');
      renderRecover();
    });
    el.typeSelector.appendChild(button);
  });

  el.memoryForm.memoryType.innerHTML = '<option value="">memory type</option>' + NODE_TYPES.filter((type) => !['memory', 'event'].includes(type)).map((type) => `<option value="${type}">${type}</option>`).join('');
  el.anchorForm.nodeType.innerHTML = '<option value="">anchor type</option>' + NODE_TYPES.filter((type) => !['memory', 'event'].includes(type)).map((type) => `<option value="${type}">${type}</option>`).join('') + '<option value="date">date</option>';

  el.createProfileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const profile = authRepository.createProfile(el.createProfileName.value);
      el.createProfileName.value = '';
      renderAuth();
      onSignedIn(profile);
    } catch (err) {
      setAuthFeedback(err.message || 'Could not create profile.');
    }
  });

  el.signInForm.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const profile = authRepository.signIn(el.signInProfileSelect.value);
      onSignedIn(profile);
    } catch (err) {
      setAuthFeedback(err.message || 'Could not sign in.');
    }
  });

  el.signOutBtn.addEventListener('click', () => signOut());

  el.cueInput.addEventListener('input', () => { state.cue = el.cueInput.value; renderRecover(); });
  el.recencyFilter.addEventListener('change', () => { state.recencyDays = el.recencyFilter.value; renderRecover(); });

  el.memoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    upsertNode({ id: uid('mem'), nodeType: 'memory', title: el.memoryForm.title.value.trim(), fragment: el.memoryForm.fragment.value.trim(), memoryType: el.memoryForm.memoryType.value, createdAt: nowIso(), rememberedAt: nowIso(), tags: parseCsv(el.memoryForm.tags.value), thread: el.memoryForm.thread.value.trim(), linkedNodeIds: [], notes: el.memoryForm.notes.value.trim(), sourceType: 'manual', sourceRef: null });
    el.memoryForm.reset();
    persistAll();
  });

  el.anchorForm.addEventListener('submit', (e) => {
    e.preventDefault();
    upsertNode({ id: uid('anc'), nodeType: el.anchorForm.nodeType.value, label: el.anchorForm.label.value.trim(), tags: parseCsv(el.anchorForm.tags.value), linkedNodeIds: [] });
    el.anchorForm.reset();
    persistAll();
  });

  el.eventForm.addEventListener('submit', (e) => {
    e.preventDefault();
    upsertNode({ id: uid('evt'), nodeType: 'event', title: el.eventForm.title.value.trim(), startTime: new Date(el.eventForm.startTime.value).toISOString(), endTime: el.eventForm.endTime.value ? new Date(el.eventForm.endTime.value).toISOString() : null, location: el.eventForm.location.value.trim(), people: parseCsv(el.eventForm.people.value), notes: el.eventForm.notes.value.trim(), linkedNodeIds: [], sourceType: 'manual' });
    el.eventForm.reset();
    persistAll();
  });

  el.nodeList.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    const select = e.target.closest('[data-select]');
    if (edit) openEditor(edit.dataset.edit);
    if (select) {
      state.selectedId = select.dataset.select;
      setRoute('recover');
      renderRecover();
    }
  });

  el.editorForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const node = byId(state.editingId);
    if (!node) return;
    const title = el.editorForm.title.value.trim();
    upsertNode({ id: node.id, title, label: title, fragment: el.editorForm.fragment.value.trim(), tags: parseCsv(el.editorForm.tags.value), thread: el.editorForm.thread.value.trim(), notes: el.editorForm.notes.value.trim() });
    persistAll();
  });

  el.deleteNodeBtn.addEventListener('click', () => {
    if (state.editingId) deleteNode(state.editingId);
    persistAll();
  });

  el.linkForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const source = byId(el.linkForm.sourceId.value);
    const target = byId(el.linkForm.targetId.value);
    if (!source || !target || source.id === target.id) return;
    source.linkedNodeIds = Array.from(new Set([...(source.linkedNodeIds || []), target.id]));
    target.linkedNodeIds = Array.from(new Set([...(target.linkedNodeIds || []), source.id]));
    ensureModel();
    renderMemoryNet();
    renderRecover();
    renderTimeline();
  });

  el.recoverZone.addEventListener('mousemove', onRecoverMove);
  window.addEventListener('mouseleave', () => { state.movement.lastTimestamp = null; });

  document.querySelectorAll('.outcome-btn').forEach((btn) => btn.addEventListener('click', () => {
    if (state.session) state.session.retrievalOutcome = btn.dataset.outcome;
    document.querySelectorAll('.outcome-btn').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  }));

  el.saveSettingsBtn.addEventListener('click', () => {
    state.settings.pointerSlowThreshold = Number(el.slowThresholdInput.value) || 0.22;
    state.settings.recoverLimit = Number(el.nodeLimitInput.value) || 10;
    config.movement.slowSpeedThresholdPxPerMs = state.settings.pointerSlowThreshold;
    persistAll();
    renderRecover();
  });
}

function init() {
  wireEvents();
  renderAuth();
  const current = authRepository.getActiveProfile();
  if (current) onSignedIn(current);
  else setRoute('auth');
}

init();
