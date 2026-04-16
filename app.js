const NODE_TYPES = ['memory', 'person', 'place', 'object', 'song', 'event'];
const CUE_TYPES = ['object', 'song', 'place', 'person', 'date/time', 'event', 'other'];

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
  loadProfiles() { try { return JSON.parse(engine.getItem(cfg.storage.profilesKey) || '[]'); } catch { return []; } },
  saveProfiles(profiles) { engine.setItem(cfg.storage.profilesKey, JSON.stringify(profiles)); },
  listProfiles() { return this.loadProfiles().sort((a, b) => a.name.localeCompare(b.name)); },
  createProfile(name) {
    const normalized = name.trim().replace(/\s+/g, ' ');
    if (!normalized) throw new Error('Profile name is required.');
    const profiles = this.loadProfiles();
    if (profiles.some((p) => p.name.toLowerCase() === normalized.toLowerCase())) throw new Error('That profile already exists.');
    const profile = { id: uid('usr'), name: normalized, createdAt: nowIso() };
    profiles.push(profile);
    this.saveProfiles(profiles);
    this.setActiveProfileId(profile.id);
    return profile;
  },
  setActiveProfileId(profileId) { profileId ? engine.setItem(cfg.storage.activeProfileKey, profileId) : engine.removeItem(cfg.storage.activeProfileKey); },
  getActiveProfileId() { return engine.getItem(cfg.storage.activeProfileKey); },
  getActiveProfile() { return this.loadProfiles().find((p) => p.id === this.getActiveProfileId()) || null; },
  signIn(profileId) {
    const profile = this.loadProfiles().find((item) => item.id === profileId);
    if (!profile) throw new Error('Profile not found.');
    this.setActiveProfileId(profile.id);
    return profile;
  },
  signOut() { this.setActiveProfileId(null); },
});

const createNamespacedMemoryRepository = (engine, cfg) => ({
  key(userId) { return `${cfg.storage.userDataPrefix}:${userId}`; },
  loadUserData(userId) {
    if (!userId) return defaultUserData();
    try {
      const raw = engine.getItem(this.key(userId));
      return raw ? { ...defaultUserData(), ...JSON.parse(raw) } : defaultUserData();
    } catch { return defaultUserData(); }
  },
  saveUserData(userId, payload) { if (userId) engine.setItem(this.key(userId), JSON.stringify(payload)); },
});

const authRepository = createLocalProfileAuthRepository(storageEngine, config);
const memoryRepository = createNamespacedMemoryRepository(storageEngine, config);

function defaultUserData() {
  return { nodes: [], memories: [], sessions: [], settings: { pointerSlowThreshold: 0.22, recoverLimit: 10 } };
}

const state = {
  route: 'memory-net',
  cueType: 'object',
  cue: '',
  recencyDays: 'all',
  selectedId: null,
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
  nodeDetailPanel: document.getElementById('nodeDetailPanel'),
  linkedNodeSummary: document.getElementById('linkedNodeSummary'),
  openComposerBtn: document.getElementById('openComposerBtn'),
  memoryComposer: document.getElementById('memoryComposer'),
  cancelComposerBtn: document.getElementById('cancelComposerBtn'),
  memoryForm: document.getElementById('memoryForm'),
  editorForm: document.getElementById('editorForm'),
  quickLinkBtn: document.getElementById('quickLinkBtn'),
  deleteNodeBtn: document.getElementById('deleteNodeBtn'),
  eventTimeline: document.getElementById('eventTimeline'),
  dateClusters: document.getElementById('dateClusters'),
  timelineDetail: document.getElementById('timelineDetail'),
  slowThresholdInput: document.getElementById('slowThresholdInput'),
  nodeLimitInput: document.getElementById('nodeLimitInput'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
};

const parseCsv = (value) => (value || '').split(',').map((v) => v.trim()).filter(Boolean);
const nowIso = () => new Date().toISOString();
const todayString = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const byId = (id) => state.nodes.find((n) => n.id === id);
const isAuthenticated = () => Boolean(state.currentUser);
const nodeLabel = (node) => node.title || node.label || 'Untitled';

function nodeDateIso(node) {
  const raw = node.rememberedAt || node.date || node.startTime || node.createdAt || nowIso();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? nowIso() : d.toISOString();
}

function formatShortDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString();
}

function setAuthFeedback(message) { el.authFeedback.textContent = message || ''; }

function resetTransientState() {
  state.selectedId = null;
  state.session = null;
  state.metricsById = {};
  state.positions = {};
  state.movement = { lastX: null, lastY: null, lastTimestamp: null, avgSpeed: 0, sampleCount: 0 };
  el.nodeDetailPanel.classList.add('hidden');
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
  state.memories = state.nodes.filter((n) => n.nodeType === 'memory');
  memoryRepository.saveUserData(state.currentUser.id, { nodes: state.nodes, memories: state.memories, sessions: state.sessions, settings: state.settings });
}

function ensureModel() {
  state.nodes = state.nodes.map((node) => ({
    linkedNodeIds: [],
    tags: [],
    nodeType: node.nodeType || 'memory',
    ...node,
    date: node.date || node.rememberedAt || node.createdAt || todayString(),
  }));
  state.nodes.forEach((node) => {
    if (!state.metricsById[node.id]) state.metricsById[node.id] = { dwellMs: 0, revisitCount: 0, slowNearMs: 0, inferredScore: 0.4, isNear: false, wasNear: false };
  });
  computeNetLayout();
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
    btn.disabled = !isAuthenticated();
    btn.classList.toggle('is-active', btn.dataset.route === route && isAuthenticated());
  });
  if (route !== 'auth') location.hash = route;
}

function ageDays(timestamp) { return (Date.now() - new Date(timestamp || nowIso()).getTime()) / 86400000; }
function searchableText(node) { return [node.title, node.label, node.fragment, node.notes, (node.tags || []).join(' '), node.nodeType].join(' ').toLowerCase(); }

function recoverPool() {
  const cue = state.cue.toLowerCase().trim();
  return state.nodes.filter((node) => {
    const cueTypeMatch = state.cueType === 'date/time' ? node.nodeType === 'event' || node.nodeType === 'memory' : node.nodeType === state.cueType || state.cueType === 'other';
    const cueTextMatch = !cue || searchableText(node).includes(cue);
    const recencyMatch = state.recencyDays === 'all' || ageDays(nodeDateIso(node)) <= Number(state.recencyDays);
    return cueTypeMatch && cueTextMatch && recencyMatch;
  });
}

function scoreNode(node) {
  const metric = state.metricsById[node.id];
  const cue = state.cue.toLowerCase().trim();
  const cueMatch = cue && searchableText(node).includes(cue) ? 1 : 0;
  const recencyFactor = Math.max(0, 1 - ageDays(nodeDateIso(node)) / 90);
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

function computeNetLayout() {
  const nodes = state.nodes;
  if (!nodes.length) return;
  const sorted = [...nodes].sort((a, b) => new Date(nodeDateIso(a)).getTime() - new Date(nodeDateIso(b)).getTime());
  const times = sorted.map((n) => new Date(nodeDateIso(n)).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const span = Math.max(maxT - minT, 1);
  const groups = [...new Set(sorted.map((n) => n.thread || n.memoryType || n.nodeType))];

  sorted.forEach((node, idx) => {
    const t = new Date(nodeDateIso(node)).getTime();
    const x = 8 + ((t - minT) / span) * 84;
    const g = groups.indexOf(node.thread || node.memoryType || node.nodeType);
    const band = (g + 1) / (groups.length + 1);
    const jitter = (((idx * 37) % 17) - 8) * 0.6;
    state.positions[node.id] = { x, y: 10 + band * 80 + jitter };
  });

  for (let i = 0; i < 80; i += 1) {
    const forces = Object.fromEntries(nodes.map((n) => [n.id, { x: 0, y: 0 }]));
    for (let a = 0; a < nodes.length; a += 1) {
      for (let b = a + 1; b < nodes.length; b += 1) {
        const na = nodes[a];
        const nb = nodes[b];
        const pa = state.positions[na.id];
        const pb = state.positions[nb.id];
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dist = Math.max(Math.hypot(dx, dy), 0.01);
        if (dist < 12) {
          const repel = (12 - dist) * 0.07;
          const ux = dx / dist;
          const uy = dy / dist;
          forces[na.id].x += ux * repel;
          forces[na.id].y += uy * repel;
          forces[nb.id].x -= ux * repel;
          forces[nb.id].y -= uy * repel;
        }
      }
    }

    nodes.forEach((node) => {
      const from = state.positions[node.id];
      (node.linkedNodeIds || []).forEach((targetId) => {
        const to = state.positions[targetId];
        if (!to) return;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        forces[node.id].x += dx * 0.004;
        forces[node.id].y += dy * 0.004;
      });
    });

    nodes.forEach((node) => {
      const p = state.positions[node.id];
      p.x = Math.min(95, Math.max(5, p.x + forces[node.id].x));
      p.y = Math.min(93, Math.max(7, p.y + forces[node.id].y));
    });
  }
}

function renderLinks(svg, sourceNodes, inRecover = false) {
  const selected = byId(state.selectedId);
  const selectedLinks = new Set([...(selected?.linkedNodeIds || []), selected?.id]);
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
      const active = selected && selectedLinks.has(source.id) && selectedLinks.has(target.id);
      line.setAttribute('stroke', active ? '#92d3ff' : '#8ecbff');
      line.setAttribute('stroke-opacity', active ? '0.65' : '0.22');
      line.setAttribute('stroke-width', active ? '1.8' : '1');
      svg.appendChild(line);
    });
  });
}

function openNodeDetail(id) {
  const node = byId(id);
  if (!node) return;
  state.selectedId = id;
  el.nodeDetailPanel.classList.remove('hidden');
  el.editorForm.title.value = nodeLabel(node);
  el.editorForm.fragment.value = node.fragment || '';
  el.editorForm.date.value = nodeDateIso(node).slice(0, 10);
  el.editorForm.tags.value = (node.tags || []).join(', ');

  const linked = (node.linkedNodeIds || []).map(byId).filter(Boolean);
  el.linkedNodeSummary.textContent = linked.length ? `Linked: ${linked.map((n) => nodeLabel(n)).join(', ')}` : 'Linked: none';
  el.editorForm.linkTargetId.innerHTML = '<option value="">Link to node...</option>' + state.nodes.filter((n) => n.id !== node.id).map((n) => `<option value="${n.id}">${nodeLabel(n)} (${n.nodeType})</option>`).join('');
}

function renderMemoryNet() {
  if (!isAuthenticated()) return;
  computeNetLayout();
  el.netField.querySelectorAll('.graph-node').forEach((n) => n.remove());
  const selected = byId(state.selectedId);
  const related = new Set([...(selected?.linkedNodeIds || []), selected?.id]);

  state.nodes.forEach((node) => {
    const pos = state.positions[node.id];
    if (!pos) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `graph-node ${node.nodeType}`;
    if (state.selectedId === node.id) btn.classList.add('active');
    if (selected && related.has(node.id) && node.id !== selected.id) btn.classList.add('related');
    if (selected && !related.has(node.id)) btn.classList.add('dimmed');
    btn.style.left = `${pos.x}%`;
    btn.style.top = `${pos.y}%`;
    const fragment = (node.fragment || '').slice(0, 68);
    btn.innerHTML = `<strong>${nodeLabel(node)}</strong>${fragment ? `<div class="node-fragment">${fragment}${node.fragment.length > 68 ? '…' : ''}</div>` : ''}<div class="node-date">${formatShortDate(nodeDateIso(node))}</div>`;
    btn.addEventListener('click', () => {
      openNodeDetail(node.id);
      renderMemoryNet();
    });
    el.netField.appendChild(btn);
  });
  renderLinks(el.netLinks, state.nodes, false);

  el.memoryForm.linkToId.innerHTML = '<option value="">Optional link</option>' + state.nodes.map((n) => `<option value="${n.id}">${nodeLabel(n)} (${n.nodeType})</option>`).join('');
  if (!selected) el.nodeDetailPanel.classList.add('hidden');
}

function renderRecover() {
  if (!isAuthenticated()) return;
  const candidates = topRecoverCandidates();
  el.recoverZone.querySelectorAll('.graph-node').forEach((n) => n.remove());
  candidates.forEach((node) => {
    const pos = state.positions[node.id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `graph-node ${node.nodeType}`;
    if (state.selectedId === node.id) btn.classList.add('active');
    btn.style.left = `${pos.x}%`;
    btn.style.top = `${pos.y}%`;
    btn.innerHTML = `<strong>${nodeLabel(node)}</strong><div class="node-date">${formatShortDate(nodeDateIso(node))}</div>`;
    btn.addEventListener('click', () => selectRecoverNode(node.id));
    el.recoverZone.appendChild(btn);
  });
  renderLinks(el.recoverLinks, candidates, true);
  el.candidateStrip.innerHTML = candidates.map((n) => `<button type="button" class="candidate-pill" data-pick="${n.id}">${nodeLabel(n)}</button>`).join('') || '<p class="muted">No saved nodes match this cue yet.</p>';
  el.candidateStrip.querySelectorAll('button[data-pick]').forEach((btn) => btn.addEventListener('click', () => selectRecoverNode(btn.dataset.pick)));

  const selected = byId(state.selectedId);
  if (!selected) {
    el.recoverDetail.innerHTML = '<p class="muted">Select a node.</p>';
    el.cascadeList.innerHTML = '<p class="muted">Select a node to see linked paths.</p>';
    return;
  }

  el.recoverDetail.innerHTML = `<strong>${nodeLabel(selected)}</strong><div class="muted">${selected.nodeType} · ${formatShortDate(nodeDateIso(selected))}</div><p>${selected.fragment || selected.notes || ''}</p><p class="muted">tags: ${(selected.tags || []).join(', ') || 'none'}</p>`;
  const cascade = (selected.linkedNodeIds || []).map(byId).filter(Boolean).slice(0, 8);
  el.cascadeList.innerHTML = cascade.map((n) => `<button type="button" class="candidate-pill" data-cascade="${n.id}">${nodeLabel(n)}</button>`).join('') || '<p class="muted">No linked nodes yet.</p>';
  el.cascadeList.querySelectorAll('button[data-cascade]').forEach((btn) => btn.addEventListener('click', () => selectRecoverNode(btn.dataset.cascade)));

  const metric = state.metricsById[selected.id];
  el.recoverTelemetry.innerHTML = `<div>Current score: ${metric.inferredScore.toFixed(2)}</div><div>Avg pointer speed: ${state.movement.avgSpeed.toFixed(2)} px/ms</div>`;
}

function selectRecoverNode(id) {
  state.selectedId = id;
  if (state.session) {
    state.session.selectedNode = id;
    if (!state.session.recallPath.length || state.session.recallPath[state.session.recallPath.length - 1] !== id) state.session.recallPath.push(id);
  }
  renderRecover();
}

function renderTimeline() {
  if (!isAuthenticated()) return;
  const events = state.nodes.filter((n) => n.nodeType === 'event').sort((a, b) => new Date(nodeDateIso(a)).getTime() - new Date(nodeDateIso(b)).getTime());
  el.eventTimeline.innerHTML = events.map((event) => `<button type="button" class="panel" data-event="${event.id}"><strong>${nodeLabel(event)}</strong><div class="muted">${new Date(nodeDateIso(event)).toLocaleString()}</div></button>`).join('') || '<p class="muted">No events yet.</p>';

  const clusters = state.nodes.reduce((acc, node) => {
    const date = nodeDateIso(node).slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(node);
    return acc;
  }, {});

  el.dateClusters.innerHTML = Object.entries(clusters).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => `<button type="button" class="panel" data-date="${date}"><strong>${date}</strong><div class="muted">${items.length} nodes</div></button>`).join('') || '<p class="muted">No memories yet.</p>';
  el.eventTimeline.querySelectorAll('button[data-event]').forEach((btn) => btn.addEventListener('click', () => showTimelineDetail(byId(btn.dataset.event))));
  el.dateClusters.querySelectorAll('button[data-date]').forEach((btn) => btn.addEventListener('click', () => showDateCluster(btn.dataset.date)));
}

function showTimelineDetail(eventNode) {
  if (!eventNode) return;
  const linked = (eventNode.linkedNodeIds || []).map(byId).filter(Boolean);
  el.timelineDetail.innerHTML = `<strong>${nodeLabel(eventNode)}</strong><div class="muted">${new Date(nodeDateIso(eventNode)).toLocaleString()}</div><p>${eventNode.fragment || eventNode.notes || ''}</p><h3>Linked nodes</h3>${linked.map((n) => `<div>${nodeLabel(n)} <span class="muted">(${n.nodeType})</span></div>`).join('') || '<p class="muted">None linked.</p>'}`;
}

function showDateCluster(date) {
  const matched = state.nodes.filter((node) => nodeDateIso(node).slice(0, 10) === date);
  el.timelineDetail.innerHTML = `<strong>${date}</strong>${matched.map((m) => `<div>${nodeLabel(m)} <span class="muted">${m.nodeType}</span></div>`).join('')}`;
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

function addBidirectionalLink(a, b) {
  if (!a || !b || a.id === b.id) return;
  a.linkedNodeIds = Array.from(new Set([...(a.linkedNodeIds || []), b.id]));
  b.linkedNodeIds = Array.from(new Set([...(b.linkedNodeIds || []), a.id]));
}

function deleteNode(id) {
  state.nodes = state.nodes.filter((n) => n.id !== id).map((n) => ({ ...n, linkedNodeIds: (n.linkedNodeIds || []).filter((lid) => lid !== id) }));
  state.selectedId = state.selectedId === id ? null : state.selectedId;
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
  setAuthFeedback('');
  renderMemoryNet();
  renderRecover();
  renderTimeline();
  const valid = ['recover', 'memory-net', 'timeline', 'settings'];
  const route = location.hash.replace('#', '');
  setRoute(valid.includes(route) ? route : 'memory-net');
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

  el.memoryForm.memoryType.innerHTML = '<option value="">Type</option>' + NODE_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('');
  el.memoryForm.date.value = todayString();

  el.createProfileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const profile = authRepository.createProfile(el.createProfileName.value);
      el.createProfileName.value = '';
      renderAuth();
      onSignedIn(profile);
    } catch (err) { setAuthFeedback(err.message || 'Could not create profile.'); }
  });

  el.signInForm.addEventListener('submit', (e) => {
    e.preventDefault();
    try { onSignedIn(authRepository.signIn(el.signInProfileSelect.value)); } catch (err) { setAuthFeedback(err.message || 'Could not sign in.'); }
  });

  el.signOutBtn.addEventListener('click', signOut);

  el.openComposerBtn.addEventListener('click', () => {
    el.memoryForm.date.value = todayString();
    el.memoryComposer.showModal();
  });
  el.cancelComposerBtn.addEventListener('click', () => el.memoryComposer.close());

  el.cueInput.addEventListener('input', () => { state.cue = el.cueInput.value; renderRecover(); });
  el.recencyFilter.addEventListener('change', () => { state.recencyDays = el.recencyFilter.value; renderRecover(); });

  el.memoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const node = {
      id: uid('mem'),
      nodeType: el.memoryForm.memoryType.value || 'memory',
      title: el.memoryForm.title.value.trim(),
      fragment: el.memoryForm.fragment.value.trim(),
      date: el.memoryForm.date.value || todayString(),
      rememberedAt: new Date(el.memoryForm.date.value || todayString()).toISOString(),
      createdAt: nowIso(),
      tags: parseCsv(el.memoryForm.tags.value),
      linkedNodeIds: [],
      sourceType: 'manual',
    };
    const linkId = el.memoryForm.linkToId.value;
    upsertNode(node);
    if (linkId) {
      const source = byId(node.id);
      const target = byId(linkId);
      addBidirectionalLink(source, target);
      ensureModel();
      renderMemoryNet();
      renderRecover();
    }
    persistAll();
    el.memoryForm.reset();
    el.memoryForm.date.value = todayString();
    el.memoryComposer.close();
    openNodeDetail(node.id);
    renderMemoryNet();
  });

  el.editorForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const node = byId(state.selectedId);
    if (!node) return;
    const title = el.editorForm.title.value.trim();
    upsertNode({
      id: node.id,
      title,
      label: title,
      fragment: el.editorForm.fragment.value.trim(),
      date: el.editorForm.date.value || todayString(),
      rememberedAt: new Date(el.editorForm.date.value || todayString()).toISOString(),
      tags: parseCsv(el.editorForm.tags.value),
    });
    persistAll();
    openNodeDetail(node.id);
  });

  el.quickLinkBtn.addEventListener('click', () => {
    const source = byId(state.selectedId);
    const target = byId(el.editorForm.linkTargetId.value);
    addBidirectionalLink(source, target);
    ensureModel();
    renderMemoryNet();
    renderRecover();
    renderTimeline();
    if (source) openNodeDetail(source.id);
  });

  el.deleteNodeBtn.addEventListener('click', () => {
    if (!state.selectedId) return;
    deleteNode(state.selectedId);
    persistAll();
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
