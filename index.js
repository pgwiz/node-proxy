import express from 'express';
import { URL } from 'url';

const app = express();

// 🔒 Define domains you're okay with redirecting to
const ALLOWED_DOMAINS = [
  'youtube.com',
  'googlevideo.com',
  'ytimg.com',
  'youtu.be'
];

app.get('/*', (req, res) => {
  try {
    const encodedUrl = req.path.slice(1); // remove leading slash
    const decodedUrl = decodeURIComponent(encodedUrl);
    const parsedUrl = new URL(decodedUrl);

    const isAllowed = ALLOWED_DOMAINS.some(domain => parsedUrl.hostname.endsWith(domain));
    if (!isAllowed) {
      return res.status(403).send('⛔ Blocked: Not an allowed destination');
    }

    console.log(`➡️ Redirecting to: ${decodedUrl}`);

    // Set browser-like headers to help get around bot detection
    res.setHeader('Location', decodedUrl);
    res.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    res.setHeader('Referer', 'https://www.youtube.com/');
    res.setHeader('Origin', 'https://www.youtube.com');
    res.setHeader('Accept-Language', 'en-US,en;q=0.9');
    res.setHeader('Connection', 'keep-alive');
    res.status(302).end();
  } catch (err) {
    console.error(`❌ Invalid URL: ${err}`);
    res.status(400).send('Invalid redirect request.');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Proxy redirect server running at http://localhost:${port}`);
});
