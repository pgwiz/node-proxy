import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

app.use('/', createProxyMiddleware({
  target: 'https://', // dynamically overwritten per request
  changeOrigin: true,
  secure: false,
  pathRewrite: (path, req) => {
    const targetUrl = decodeURIComponent(path.slice(1));
    return new URL(targetUrl).pathname;
  },
  router: (req) => {
    const url = decodeURIComponent(req.path.slice(1));
    return new URL(url).origin;
  },
  onProxyReq: (proxyReq, req, res) => {
    // 🛡️ Anti-bot headers
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    proxyReq.setHeader('Referer', 'https://www.youtube.com/');
    proxyReq.setHeader('Origin', 'https://www.youtube.com');
    proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
    proxyReq.setHeader('Sec-Fetch-Site', 'same-origin');
    proxyReq.setHeader('Sec-Fetch-Mode', 'navigate');
    proxyReq.setHeader('Connection', 'keep-alive');
  }
}));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🌀 Proxy server running on http://localhost:${port}`);
});
