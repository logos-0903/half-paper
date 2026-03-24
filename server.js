const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf');
const db = require('./db');

const SqliteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_MOODS = ['happy', 'neutral', 'sad', 'excited', 'anxious', 'grateful'];

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SqliteStore({ db: 'sessions.db', dir: __dirname }),
  secret: process.env.SESSION_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET environment variable must be set in production');
    }
    console.warn('Warning: using default session secret. Set SESSION_SECRET for production.');
    return 'half-paper-dev-secret';
  })(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
}));

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// CSRF protection
const csrfSecret = process.env.CSRF_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CSRF_SECRET environment variable must be set in production');
  }
  return 'half-paper-csrf-dev-secret';
})();

const isProduction = process.env.NODE_ENV === 'production';

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => csrfSecret,
  getSessionIdentifier: (req) => req.session.id || '',
  cookieName: isProduction ? '__Host-psifi.x-csrf-token' : 'x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: isProduction,
    httpOnly: true
  }
});

// Middleware to require authentication
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// ─── Auth Routes ────────────────────────────────────────────────────────────

app.get('/api/csrf-token', (req, res) => {
  // Touch the session so it is persisted and the session ID stays stable
  if (!req.session.init) req.session.init = true;
  res.json({ csrfToken: generateCsrfToken(req, res, { overwrite: true }) });
});

app.post('/api/register', authLimiter, doubleCsrfProtection, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
  req.session.userId = result.lastInsertRowid;
  req.session.username = username;
  res.json({ ok: true, username });
});

app.post('/api/login', authLimiter, doubleCsrfProtection, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post('/api/logout', doubleCsrfProtection, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: { id: req.session.userId, username: req.session.username } });
});

// ─── Diary Entry Routes ──────────────────────────────────────────────────────

app.get('/api/entries', apiLimiter, requireAuth, (req, res) => {
  const entries = db.prepare(
    'SELECT id, title, content, mood, created_at, updated_at FROM entries WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.session.userId);
  res.json(entries);
});

app.get('/api/entries/:id', apiLimiter, requireAuth, (req, res) => {
  const entry = db.prepare(
    'SELECT id, title, content, mood, created_at, updated_at FROM entries WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  res.json(entry);
});

app.post('/api/entries', apiLimiter, requireAuth, doubleCsrfProtection, (req, res) => {
  const { title, content, mood } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }
  const entryMood = ALLOWED_MOODS.includes(mood) ? mood : 'neutral';
  const result = db.prepare(
    'INSERT INTO entries (user_id, title, content, mood) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, title, content, entryMood);
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(entry);
});

app.put('/api/entries/:id', apiLimiter, requireAuth, doubleCsrfProtection, (req, res) => {
  const { title, content, mood } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }
  const entryMood = ALLOWED_MOODS.includes(mood) ? mood : 'neutral';
  const existing = db.prepare('SELECT id FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });
  db.prepare(
    "UPDATE entries SET title = ?, content = ?, mood = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(title, content, entryMood, req.params.id, req.session.userId);
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  res.json(entry);
});

app.delete('/api/entries/:id', apiLimiter, requireAuth, doubleCsrfProtection, (req, res) => {
  const existing = db.prepare('SELECT id FROM entries WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!existing) return res.status(404).json({ error: 'Entry not found' });
  db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// Error handler – return JSON for all API errors
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Half Paper diary running at http://localhost:${PORT}`);
});

module.exports = app;
