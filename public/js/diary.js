// ── State ─────────────────────────────────────────────────────────
let entries = [];
let currentEntryId = null;
let selectedMood = 'neutral';
let sidebarOpen = false;
let csrfToken = null;

const MOOD_EMOJI = {
  happy: '😄',
  excited: '🤩',
  grateful: '🙏',
  neutral: '😐',
  anxious: '😰',
  sad: '😢'
};

// ── Init ──────────────────────────────────────────────────────────
(async function init() {
  const [meRes, csrfRes] = await Promise.all([
    fetch('/api/me'),
    fetch('/api/csrf-token')
  ]);
  const meData = await meRes.json();
  if (!meData.user) {
    window.location.href = '/';
    return;
  }
  const csrfData = await csrfRes.json();
  csrfToken = csrfData.csrfToken;
  document.getElementById('username-display').textContent = meData.user.username;
  await loadEntries();
  setupMoodPicker();
})();

// ── API helpers ───────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken || ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// ── Entries ───────────────────────────────────────────────────────
async function loadEntries() {
  entries = await api('GET', '/api/entries');
  renderSidebar();
}

function renderSidebar() {
  const list = document.getElementById('entry-list');
  if (entries.length === 0) {
    list.innerHTML = '<li class="entry-list-empty">No entries yet. Start writing!</li>';
    return;
  }
  list.innerHTML = entries.map(e => `
    <li class="entry-item ${e.id === currentEntryId ? 'active' : ''}" 
        onclick="openEntry(${e.id})" id="sidebar-item-${e.id}">
      <div class="entry-item-title">${escapeHtml(e.title)}</div>
      <div class="entry-item-meta">
        <span>${MOOD_EMOJI[e.mood] || '😐'}</span>
        <span>${formatDate(e.created_at)}</span>
      </div>
    </li>
  `).join('');
}

// ── Open / Read entry ─────────────────────────────────────────────
function openEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  currentEntryId = id;
  showView('read');
  renderSidebar();
  document.getElementById('read-title').textContent = entry.title;
  document.getElementById('read-mood').textContent = MOOD_EMOJI[entry.mood] || '😐';
  document.getElementById('read-date').textContent = formatDateFull(entry.created_at);
  document.getElementById('read-body').textContent = entry.content;
  document.getElementById('topbar-title').textContent = entry.title;
  if (window.innerWidth <= 700) closeSidebar();
}

// ── New entry editor ──────────────────────────────────────────────
function openEditor(entry) {
  currentEntryId = entry ? entry.id : null;
  showView('editor');
  document.getElementById('editor-heading').textContent = entry ? 'Edit Entry' : 'New Entry';
  document.getElementById('entry-title').value = entry ? entry.title : '';
  document.getElementById('entry-content').value = entry ? entry.content : '';
  document.getElementById('editor-error').classList.add('hidden');
  document.getElementById('topbar-title').textContent = entry ? 'Edit Entry' : 'New Entry';
  setMood(entry ? entry.mood : 'neutral');
  if (window.innerWidth <= 700) closeSidebar();
}

function cancelEdit() {
  if (currentEntryId) {
    openEntry(currentEntryId);
  } else {
    showView('welcome');
    document.getElementById('topbar-title').textContent = 'My Diary';
  }
}

async function saveEntry() {
  const title = document.getElementById('entry-title').value.trim();
  const content = document.getElementById('entry-content').value.trim();
  const errEl = document.getElementById('editor-error');
  errEl.classList.add('hidden');

  if (!title || !content) {
    errEl.textContent = 'Title and content are required.';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    let saved;
    if (currentEntryId) {
      saved = await api('PUT', `/api/entries/${currentEntryId}`, { title, content, mood: selectedMood });
      const idx = entries.findIndex(e => e.id === currentEntryId);
      if (idx !== -1) entries[idx] = saved;
    } else {
      saved = await api('POST', '/api/entries', { title, content, mood: selectedMood });
      entries.unshift(saved);
      currentEntryId = saved.id;
    }
    renderSidebar();
    openEntry(currentEntryId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

// ── Edit current entry ────────────────────────────────────────────
function editCurrentEntry() {
  const entry = entries.find(e => e.id === currentEntryId);
  if (entry) openEditor(entry);
}

// ── Delete ────────────────────────────────────────────────────────
function deleteCurrentEntry() {
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function confirmDelete() {
  closeModal();
  try {
    await api('DELETE', `/api/entries/${currentEntryId}`);
    entries = entries.filter(e => e.id !== currentEntryId);
    currentEntryId = null;
    renderSidebar();
    showView('welcome');
    document.getElementById('topbar-title').textContent = 'My Diary';
  } catch (err) {
    alert(err.message);
  }
}

// ── Logout ────────────────────────────────────────────────────────
async function handleLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

// ── Mood picker ───────────────────────────────────────────────────
function setupMoodPicker() {
  document.getElementById('mood-picker').addEventListener('click', e => {
    const btn = e.target.closest('.mood-btn');
    if (!btn) return;
    setMood(btn.dataset.mood);
  });
}

function setMood(mood) {
  selectedMood = mood;
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mood === mood);
  });
}

// ── Sidebar ───────────────────────────────────────────────────────
function toggleSidebar() {
  sidebarOpen ? closeSidebar() : openSidebar();
}
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  sidebarOpen = true;
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  sidebarOpen = false;
}

// ── View helper ───────────────────────────────────────────────────
function showView(name) {
  ['welcome', 'editor', 'read'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('hidden', v !== name);
  });
}

// ── Utils ─────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'));
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateFull(iso) {
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'));
  return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
