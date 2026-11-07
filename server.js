import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Only PNG, JPG or WebP images are supported.'), allowed.includes(file.mimetype));
  }
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 10000;

app.get('/api/health', (_req, res) => res.json({ ok: true, storageConfigured: Boolean(process.env.PINATA_JWT) }));

app.post('/api/token-metadata', upload.single('image'), async (req, res) => {
  try {
    if (!process.env.PINATA_JWT) return res.status(503).json({ error: 'Image storage is not configured on the server.' });
    if (!req.file) return res.status(400).json({ error: 'A token image is required.' });
    const { name, symbol, description } = req.body;
    if (!name?.trim() || !symbol?.trim()) return res.status(400).json({ error: 'Token name and symbol are required.' });

    const imageForm = new FormData();
    imageForm.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'token-image');
    imageForm.append('network', 'public');
    const imageResponse = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.PINATA_JWT },
      body: imageForm
    });
    const imageResult = await imageResponse.json().catch(() => ({}));
    if (!imageResponse.ok || !imageResult?.data?.cid) {
      console.error('Pinata image upload failed:', imageResponse.status, imageResult);
      return res.status(502).json({ error: 'Image upload failed. Please try again.' });
    }

    const imageUri = 'ipfs://' + imageResult.data.cid;
    const metadata = {
      name: name.trim().slice(0, 32),
      symbol: symbol.trim().slice(0, 10),
      description: (description || '').trim().slice(0, 1000),
      image: imageUri,
      properties: { files: [{ uri: imageUri, type: req.file.mimetype }], category: 'image' }
    };
    const metadataForm = new FormData();
    metadataForm.append('file', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
    metadataForm.append('network', 'public');
    const metadataResponse = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.PINATA_JWT },
      body: metadataForm
    });
    const metadataResult = await metadataResponse.json().catch(() => ({}));
    if (!metadataResponse.ok || !metadataResult?.data?.cid) {
      console.error('Pinata metadata upload failed:', metadataResponse.status, metadataResult);
      return res.status(502).json({ error: 'Metadata upload failed. Please retry.' });
    }
    res.json({ imageUri, metadataUri: 'ipfs://' + metadataResult.data.cid });
  } catch (error) {
    console.error('Metadata upload error:', error);
    res.status(500).json({ error: 'Unable to upload token metadata right now.' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.use((err, _req, res, _next) => {
  res.status(err instanceof multer.MulterError ? 400 : 400).json({ error: err.message || 'Upload request failed.' });
});
app.listen(PORT, '0.0.0.0', () => console.log('LaunchMeme server listening on ' + PORT));
