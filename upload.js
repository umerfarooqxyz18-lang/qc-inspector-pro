// routes/upload.js — Image upload to Supabase Storage
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');

// Store files in memory (we stream to Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, HEIC, and WebP images are allowed'));
  },
});

// POST /api/upload/images — upload 1 or more inspection images
router.post('/images', requireAuth, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const BUCKET = 'inspection-images';
    const uploadedUrls = [];

    for (const file of req.files) {
      const ext      = file.originalname.split('.').pop();
      const filename = `${req.userId}/${uuidv4()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error('[UPLOAD]', uploadError.message);
        continue; // skip failed files, don't abort all
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filename);

      uploadedUrls.push(publicUrl);
    }

    if (uploadedUrls.length === 0) {
      return res.status(500).json({ error: 'All file uploads failed' });
    }

    res.json({ urls: uploadedUrls, count: uploadedUrls.length });
  } catch (err) {
    console.error('[UPLOAD]', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/upload/image — delete image by URL
router.delete('/image', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    // Extract path from full URL
    const BUCKET = 'inspection-images';
    const path = url.split(`${BUCKET}/`)[1];
    if (!path) return res.status(400).json({ error: 'Invalid URL' });

    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
    res.json({ message: 'Image deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
