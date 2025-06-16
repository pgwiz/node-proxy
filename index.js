import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// Open CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Proxy all requests through here
app.use('/', createProxyMiddleware({
  target: 'https://', // actual destination will be filled per request
  changeOrigin: true,
  secure: false,
  pathRewrite: (path, req) => {
    const targetUrl = decodeURIComponent(path.slice(1));
    return new URL(targetUrl).pathname;
  },
  router: (req) => {
    const url = decodeURIComponent(req.path.slice(1));
    const { origin } = new URL(url);
    return origin;
  },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('Referer', 'https://www.youtube.com');
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  }
}));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Proxy listening on port ${port}`);
});
