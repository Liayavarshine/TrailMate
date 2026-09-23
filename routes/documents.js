const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function detectMimeType(filename, buffer) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (buffer.length >= 4 && buffer.slice(0, 4).toString('utf8') === '%PDF') {
    return 'application/pdf';
  }
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('utf8') === 'RIFF' && buffer.slice(8, 12).toString('utf8') === 'WEBP') {
    return 'image/webp';
  }
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    if (!match) return reject(Object.assign(new Error('Multipart form data is required'), { status: 400 }));

    const boundary = Buffer.from(`--${(match[1] || match[2]).trim()}`);
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_FILE_SIZE + 1024 * 1024) {
        req.destroy();
        reject(Object.assign(new Error('File is too large (maximum 10 MB)'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const fields = {};
        let file = null;
        let offset = body.indexOf(boundary);
        while (offset !== -1) {
          const partStart = offset + boundary.length;
          if (body.slice(partStart, partStart + 2).toString() === '--') break;
          // Skip CRLF or LF after boundary
          let headerStart = partStart;
          if (body[headerStart] === 0x0d && body[headerStart + 1] === 0x0a) headerStart += 2;
          else if (body[headerStart] === 0x0a) headerStart += 1;

          let contentStart = body.indexOf(Buffer.from('\r\n\r\n'), headerStart);
          let headerSepLen = 4;
          if (contentStart === -1) {
            contentStart = body.indexOf(Buffer.from('\n\n'), headerStart);
            headerSepLen = 2;
          }
          if (contentStart === -1) break;

          const headers = body.slice(headerStart, contentStart).toString('utf8');
          const nextBoundary = body.indexOf(boundary, contentStart + headerSepLen);
          if (nextBoundary === -1) break;

          let partEnd = nextBoundary;
          if (partEnd >= 2 && body[partEnd - 2] === 0x0d && body[partEnd - 1] === 0x0a) {
            partEnd -= 2;
          } else if (partEnd >= 1 && body[partEnd - 1] === 0x0a) {
            partEnd -= 1;
          }
          const content = body.slice(contentStart + headerSepLen, partEnd);

          const disposition = headers.match(/content-disposition:\s*form-data;\s*([^\r\n]+)/i);
          const nameMatch = disposition && disposition[1].match(/(?:^|;)\s*name="([^"]+)"/i);
          const filenameMatch = disposition && disposition[1].match(/(?:^|;)\s*filename="([^"]*)"/i);
          const typeMatch = headers.match(/content-type:\s*([^\r\n;\s]+)/i);

          if (nameMatch) {
            const fieldName = nameMatch[1];
            if (filenameMatch) {
              file = {
                originalname: filenameMatch[1],
                buffer: content,
                mimetype: typeMatch ? typeMatch[1].toLowerCase() : null
              };
            } else {
              fields[fieldName] = content.toString('utf8');
            }
          }
          offset = nextBoundary;
        }
        resolve({ fields, file });
      } catch (err) { reject(err); }
    });
  });
}

// POST /api/documents — guide uploads a verification document (PDF, JPG, PNG, WEBP)
router.post('/', authenticateToken, requireRole('guide'), async (req, res) => {
  try {
    const { fields, file } = await parseMultipart(req);
    const type = fields.type && fields.type.trim();
    if (!type || !file || !file.buffer || !file.buffer.length) {
      return res.status(400).json({ error: 'Document type and document file are required' });
    }
    if (type.length > 80) return res.status(400).json({ error: 'Document type must be 80 characters or fewer' });
    if (file.buffer.length > MAX_FILE_SIZE) return res.status(413).json({ error: 'File is too large (maximum 10 MB)' });

    const mimeType = detectMimeType(file.originalname, file.buffer);
    if (!mimeType) {
      return res.status(400).json({ error: 'Only PDF documents and image files (JPG, PNG, WebP) are allowed' });
    }

    const filename = (file.originalname || `document_${Date.now()}`).split(/[\\/]/).pop().slice(0, 160);
    const { rows } = await db.query(
      `INSERT INTO documents (guide_id, type, filename, content, mime_type, file_size, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, guide_id, type, filename, mime_type, file_size, status, upload_date`,
      [req.user.id, type, filename, file.buffer, mimeType, file.buffer.length]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Upload document error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// GET /api/documents/mine — list documents uploaded by current guide
router.get('/mine', authenticateToken, requireRole('guide'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, guide_id, type, filename, mime_type, file_size, status, upload_date
       FROM documents WHERE guide_id = $1 ORDER BY upload_date DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

// GET /api/documents/:id/file — guide views their own uploaded document
router.get('/:id/file', authenticateToken, requireRole('guide'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT filename, content, mime_type FROM documents WHERE id = $1 AND guide_id = $2',
      [req.params.id, req.user.id]
    );
    const document = rows[0];
    if (!document || !document.content) return res.status(404).json({ error: 'Uploaded file not found' });
    const filename = document.filename.replace(/["\\\r\n]/g, '_');
    const mimeType = document.mime_type || detectMimeType(filename, document.content) || 'application/octet-stream';
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(document.content),
      'Cache-Control': 'no-store'
    });
    res.send(document.content);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load document file' });
  }
});

module.exports = router;
