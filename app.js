const NODE_TYPES = ['memory', 'person', 'place', 'object', 'song', 'event'];

const config = {
  storage: {
    profilesKey: 'memorygate_profiles',
    activeProfileKey: 'memorygate_active_profile',
    userDataPrefix: 'memorygate_user_data',
  },
  recover: {
    dwellMs: 1700,
    minWords: 20,
    maxWords: 34,
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
  selectedId: null,
  currentUser: null,
  profiles: [],
  nodes: [],
  memories: [],
  sessions: [],
  settings: { pointerSlowThreshold: 0.22, recoverLimit: 10 },
  positions: {},
  recover: {
    seed: '',
    history: [],
    engine: null,
    clouds: [],
    hoverTimer: null,
    hoverWord: null,
    previewNodeId: null,
  },
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
  recoverInput: document.getElementById('recoverInput'),
  recoverTrail: document.getElementById('recoverTrail'),
  recoverZone: document.getElementById('recoverZone'),
  recoverPreview: document.getElementById('recoverPreview'),
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
  state.positions = {};
  state.recover = { seed: '', history: [], engine: null, clouds: [], hoverTimer: null, hoverWord: null, previewNodeId: null };
  el.nodeDetailPanel.classList.add('hidden');
}

function loadCurrentUserData() {
  const data = memoryRepository.loadUserData(state.currentUser?.id);
  state.nodes = data.nodes || [];
  state.memories = data.memories || [];
  state.sessions = data.sessions || [];
  state.settings = { pointerSlowThreshold: 0.22, recoverLimit: 10, ...(data.settings || {}) };
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
  computeNetLayout();
  state.recover.engine = null;
  persistAll();
}

function setRoute(route) {
  if (!isAuthenticated()) route = 'auth';
  state.route = route;
  Object.entries(el.pages).forEach(([key, page]) => page.classList.toggle('hidden', (key === 'memoryNet' ? 'memory-net' : key) !== route));
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.disabled = !isAuthenticated();
    btn.classList.toggle('is-active', btn.dataset.route === route && isAuthenticated());
  });
  if (route !== 'auth') location.hash = route;
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
}

function renderLinks(svg, sourceNodes) {
  const selected = byId(state.selectedId);
  const selectedLinks = new Set([...(selected?.linkedNodeIds || []), selected?.id]);
  svg.innerHTML = '';
  sourceNodes.forEach((source) => {
    (source.linkedNodeIds || []).forEach((targetId) => {
      const target = byId(targetId);
      if (!target || !sourceNodes.some((n) => n.id === targetId)) return;
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

  renderLinks(el.netLinks, state.nodes);
  el.memoryForm.linkToId.innerHTML = '<option value="">Optional link</option>' + state.nodes.map((n) => `<option value="${n.id}">${nodeLabel(n)} (${n.nodeType})</option>`).join('');
  if (!selected) el.nodeDetailPanel.classList.add('hidden');
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'have', 'about', 'into', 'were', 'been', 'there', 'after', 'before', 'then', 'when', 'what', 'where', 'while', 'just', 'over', 'under', 'them', 'they', 'you', 'our', 'his', 'her', 'its', 'was', 'are', 'but', 'not', 'too', 'very', 'also', 'did', 'had', 'has', 'all', 'any', 'off', 'out', 'one', 'two', 'she', 'him', 'who', 'why', 'how']);

const CONTEXT_HINTS = {
  train: ['station', 'platform', 'ticket', 'window', 'rush', 'coffee', 'commute', 'arrival', 'track'],
  notebook: ['margin', 'ink', 'scribble', 'lecture', 'desk', 'paper', 'idea', 'list', 'sketch'],
  sketch: ['pencil', 'eraser', 'outline', 'shade', 'canvas', 'studio', 'gesture', 'draft', 'shape'],
  kitchen: ['kettle', 'counter', 'spice', 'sink', 'fridge', 'morning', 'recipe', 'steam', 'warmth'],
  beach: ['sand', 'salt', 'towel', 'waves', 'breeze', 'sunset', 'footprints', 'boardwalk', 'shell'],
};

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function getRecoverEngine() {
  if (state.recover.engine) return state.recover.engine;
  const neighbors = new Map();
  const memoryHits = new Map();
  const nodeWords = new Map();

  state.nodes.forEach((node) => {
    const anchors = Array.isArray(node.anchors) ? node.anchors.join(' ') : '';
    const words = Array.from(new Set(tokenize(`${node.title || ''} ${node.fragment || ''} ${(node.tags || []).join(' ')} ${anchors}`))).slice(0, 30);
    nodeWords.set(node.id, words);
    words.forEach((word) => {
      if (!memoryHits.has(word)) memoryHits.set(word, []);
      memoryHits.get(word).push(node.id);
    });
    for (let i = 0; i < words.length; i += 1) {
      for (let j = i + 1; j < words.length; j += 1) {
        const a = words[i];
        const b = words[j];
        if (!neighbors.has(a)) neighbors.set(a, new Map());
        if (!neighbors.has(b)) neighbors.set(b, new Map());
        neighbors.get(a).set(b, (neighbors.get(a).get(b) || 0) + 1);
        neighbors.get(b).set(a, (neighbors.get(b).get(a) || 0) + 1);
      }
    }
  });

  state.recover.engine = { neighbors, memoryHits, nodeWords };
  return state.recover.engine;
}

function pickAssociationWords(seed) {
  const cleanSeed = tokenize(seed)[0] || seed.toLowerCase().trim();
  const engine = getRecoverEngine();
  const weighted = new Map();
  const direct = engine.neighbors.get(cleanSeed) || new Map();

  direct.forEach((value, word) => weighted.set(word, (weighted.get(word) || 0) + value * 2.4));

  (CONTEXT_HINTS[cleanSeed] || []).forEach((word, i) => weighted.set(word, (weighted.get(word) || 0) + (1.8 - i * 0.1)));

  (engine.memoryHits.get(cleanSeed) || []).slice(0, 8).forEach((nodeId) => {
    (engine.nodeWords.get(nodeId) || []).forEach((word, idx) => {
      if (word === cleanSeed) return;
      weighted.set(word, (weighted.get(word) || 0) + Math.max(0.3, 1.4 - idx * 0.05));
    });
  });

  if (weighted.size < config.recover.minWords) {
    engine.neighbors.forEach((_links, word) => {
      if (word.startsWith(cleanSeed.slice(0, 2)) && word !== cleanSeed) weighted.set(word, (weighted.get(word) || 0) + 0.55);
    });
  }

  const results = Array.from(weighted.entries())
    .map(([word, score]) => {
      const memoryIds = engine.memoryHits.get(word) || [];
      return {
        word,
        score: score + Math.min(2.5, memoryIds.length * 0.45),
        memoryIds,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, config.recover.maxWords);

  if (!results.length) {
    return [{ word: cleanSeed, score: 2, memoryIds: engine.memoryHits.get(cleanSeed) || [] }];
  }

  return results;
}

function makeCloudLayout(items) {
  const width = el.recoverZone.clientWidth || 900;
  const height = el.recoverZone.clientHeight || 520;
  const maxScore = Math.max(...items.map((i) => i.score));
  const placed = [];

  items.forEach((item, idx) => {
    const strength = item.score / maxScore;
    const fontSize = 14 + Math.round(strength * 14);
    const itemWidth = Math.max(56, item.word.length * (fontSize * 0.56));
    const itemHeight = fontSize + 14;
    const baseRadius = 40 + (1 - strength) * (Math.min(width, height) * 0.36);
    const cluster = idx % 4;
    const clusterAngle = (Math.PI / 2) * cluster + (Math.random() - 0.5) * 0.45;

    let best = null;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const angle = clusterAngle + (Math.random() - 0.5) * Math.PI * (0.35 + attempt / 80);
      const radius = baseRadius + (Math.random() - 0.5) * 28 + attempt * 0.75;
      const x = width / 2 + Math.cos(angle) * radius;
      const y = height / 2 + Math.sin(angle) * radius;
      const box = { x: x - itemWidth / 2, y: y - itemHeight / 2, w: itemWidth, h: itemHeight };
      if (box.x < 8 || box.y < 8 || box.x + box.w > width - 8 || box.y + box.h > height - 8) continue;
      const overlap = placed.some((p) => !(box.x + box.w < p.x || box.x > p.x + p.w || box.y + box.h < p.y || box.y > p.y + p.h));
      if (!overlap) {
        best = { x, y, box };
        break;
      }
      if (!best) best = { x, y, box };
    }

    const finalPick = best || { x: width / 2, y: height / 2, box: { x: width / 2 - itemWidth / 2, y: height / 2 - itemHeight / 2, w: itemWidth, h: itemHeight } };
    placed.push(finalPick.box);
    item.x = (finalPick.x / width) * 100;
    item.y = (finalPick.y / height) * 100;
    item.fontSize = fontSize;
    item.strength = strength;
  });

  return items;
}

function clearRecoverHover() {
  if (state.recover.hoverTimer) clearTimeout(state.recover.hoverTimer);
  state.recover.hoverTimer = null;
  state.recover.hoverWord = null;
}

function showRecoverPreview(nodeId) {
  const node = byId(nodeId);
  state.recover.previewNodeId = node?.id || null;
  if (!node) {
    el.recoverPreview.innerHTML = '<span class="muted">Memory previews appear here when associations match your saved nodes.</span>';
    return;
  }
  const snippet = (node.fragment || '').slice(0, 140);
  el.recoverPreview.innerHTML = `<div><strong>${nodeLabel(node)}</strong> <span class="muted">${node.nodeType}</span></div><div class="muted">${snippet}${(node.fragment || '').length > 140 ? '…' : ''}</div><button type="button" id="openPreviewMemoryBtn">Open memory</button>`;
  const openBtn = document.getElementById('openPreviewMemoryBtn');
  openBtn?.addEventListener('click', () => {
    openNodeDetail(node.id);
    setRoute('memory-net');
    renderMemoryNet();
  });
}

function renderBreadcrumbs() {
  el.recoverTrail.innerHTML = '';
  if (!state.recover.history.length) {
    el.recoverTrail.innerHTML = '<span class="muted">Start with one word and press Enter.</span>';
    return;
  }
  state.recover.history.forEach((word, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recover-crumb';
    btn.textContent = word;
    btn.addEventListener('click', () => {
      const nextHistory = state.recover.history.slice(0, idx + 1);
      state.recover.history = nextHistory;
      generateRecoverCloud(word, { updateHistory: false });
    });
    el.recoverTrail.appendChild(btn);
    if (idx < state.recover.history.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'muted';
      sep.textContent = '→';
      el.recoverTrail.appendChild(sep);
    }
  });
}

function generateRecoverCloud(seedWord, { updateHistory = true } = {}) {
  const cleanSeed = tokenize(seedWord)[0] || seedWord.trim().toLowerCase();
  if (!cleanSeed) return;
  clearRecoverHover();
  state.recover.seed = cleanSeed;
  if (updateHistory) {
    if (!state.recover.history.length || state.recover.history[state.recover.history.length - 1] !== cleanSeed) {
      state.recover.history.push(cleanSeed);
    }
  }

  const base = pickAssociationWords(cleanSeed).slice(0, Math.max(config.recover.minWords, config.recover.maxWords - 2));
  const cloudWords = [{ word: cleanSeed, score: (base[0]?.score || 2) + 1.6, memoryIds: getRecoverEngine().memoryHits.get(cleanSeed) || [], isSeed: true }, ...base.filter((w) => w.word !== cleanSeed)].slice(0, config.recover.maxWords);
  const layout = makeCloudLayout(cloudWords);

  state.recover.clouds = [{ seed: cleanSeed, words: layout, createdAt: Date.now() }, ...state.recover.clouds.slice(0, 1)];
  renderRecover();
}

function renderRecoverCloudLayer(cloud, isCurrent) {
  const layer = document.createElement('div');
  layer.className = `recover-cloud-layer ${isCurrent ? 'is-current' : 'is-previous'}`;

  cloud.words.forEach((entry) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recover-word';
    if (entry.isSeed) btn.classList.add('seed-word');
    if (entry.memoryIds.length) btn.classList.add('memory-hit');
    btn.textContent = entry.word;
    btn.style.left = `${entry.x}%`;
    btn.style.top = `${entry.y}%`;
    btn.style.fontSize = `${entry.fontSize}px`;
    btn.style.opacity = `${0.55 + entry.strength * 0.45}`;

    if (isCurrent) {
      btn.addEventListener('mouseenter', () => {
        clearRecoverHover();
        state.recover.hoverWord = entry.word;
        state.recover.hoverTimer = setTimeout(() => {
          if (state.recover.hoverWord === entry.word) generateRecoverCloud(entry.word);
        }, config.recover.dwellMs);
      });
      btn.addEventListener('mouseleave', clearRecoverHover);
      btn.addEventListener('click', () => {
        generateRecoverCloud(entry.word);
        if (entry.memoryIds.length) showRecoverPreview(entry.memoryIds[0]);
      });
    }

    layer.appendChild(btn);
  });
  return layer;
}

function renderRecover() {
  if (!isAuthenticated()) return;
  renderBreadcrumbs();
  if (!state.recover.clouds.length) {
    el.recoverZone.innerHTML = '<div class="recover-empty muted">Enter one word and press Enter to begin a recall cascade.</div>';
    showRecoverPreview(null);
    return;
  }

  el.recoverZone.innerHTML = '';
  state.recover.clouds.slice().reverse().forEach((cloud, idx, arr) => {
    const isCurrent = idx === arr.length - 1;
    el.recoverZone.appendChild(renderRecoverCloudLayer(cloud, isCurrent));
  });
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

  el.recoverInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    generateRecoverCloud(el.recoverInput.value, { updateHistory: true });
  });

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

  el.saveSettingsBtn.addEventListener('click', () => {
    state.settings.pointerSlowThreshold = Number(el.slowThresholdInput.value) || 0.22;
    state.settings.recoverLimit = Number(el.nodeLimitInput.value) || 10;
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
