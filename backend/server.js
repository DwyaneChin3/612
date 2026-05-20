require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const db = require('./db');
const { uploadBuffer } = require('./cos');

const app = express();
const port = process.env.PORT || 3000;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '997799';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

app.use('/api', (req, res, next) => {
  if (req.get('X-Access-Password') !== ACCESS_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.get('/api/bootstrap', (req, res) => {
  res.json({
    letters: db.listAll('letters'),
    milestones: db.listAll('milestones'),
    moments: db.listAll('moments'),
    messages: db.listAll('messages'),
    startDate: db.getConfig('start_date'),
  });
});

app.put('/api/config/start-date', (req, res) => {
  const { startDate } = req.body || {};
  if (!startDate || isNaN(new Date(startDate).getTime())) {
    return res.status(400).json({ error: 'invalid date' });
  }
  db.setConfig('start_date', startDate);
  res.json({ startDate });
});

function pickFields(type, body) {
  const out = {
    content: body.content || '',
    date: body.date || new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    media_url: body.media || null,
    media_type: body.mediaType || null,
  };
  if (type === 'milestones') {
    out.title = body.title || '';
  }
  if (type === 'messages') {
    out.author = body.author || null;
  }
  return out;
}

const RESOURCES = ['letters', 'milestones', 'moments', 'messages'];

for (const table of RESOURCES) {
  app.post(`/api/${table}`, (req, res) => {
    const fields = pickFields(table, req.body || {});
    if (table === 'milestones' && (!fields.title || !fields.date)) {
      return res.status(400).json({ error: 'title and date required' });
    }
    res.json(db.insert(table, fields));
  });

  app.put(`/api/${table}/:id`, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const body = req.body || {};
    const fields = {};
    if (body.content !== undefined) fields.content = body.content;
    if (body.title !== undefined && table === 'milestones') fields.title = body.title;
    if (body.date !== undefined) fields.date = body.date;
    if (body.author !== undefined && table === 'messages') fields.author = body.author;
    if (body.media !== undefined) fields.media_url = body.media;
    if (body.mediaType !== undefined) fields.media_type = body.mediaType;

    if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'no fields' });
    const item = db.update(table, id, fields);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  });

  app.delete(`/api/${table}/:id`, (req, res) => {
    const id = Number(req.params.id);
    if (!db.remove(table, id)) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  try {
    const { url } = await uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
    const type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    res.json({ url, type });
  } catch (e) {
    console.error('upload failed', e);
    res.status(500).json({ error: 'upload failed', detail: String(e.message || e) });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server error', detail: err.message });
});

app.listen(port, () => {
  console.log(`couple-memory backend listening on :${port}`);
});
