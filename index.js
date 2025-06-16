import express from 'express';
import { URL } from 'url';
import http from 'http'; // For HTTP requests
import https from 'https'; // For HTTPS requests

const app = express();

// 🔒 Define domains you're okay with proxying from.
// These are the only domains the proxy will fetch content from.
const ALLOWED_PROXIED_DOMAINS = [
    'youtube.com',
    'googlevideo.com',
    'ytimg.com',
    'youtu.be'
];

// Handle all GET requests to the proxy
app.get('/*', (req, res) => {
    try {
        // Extract the encoded URL from the request path (remove leading slash)
        const encodedUrl = req.path.slice(1);
        // Decode the URL to get the original destination
        const decodedUrl = decodeURIComponent(encodedUrl);
        // Parse the URL to extract its components (hostname, protocol, path, etc.)
        const parsedUrl = new URL(decodedUrl);

        // Check if the parsed URL's hostname is in our allowed list
        const isAllowed = ALLOWED_PROXIED_DOMAINS.some(domain => parsedUrl.hostname.endsWith(domain));
        if (!isAllowed) {
            // If the domain is not allowed, send a 403 Forbidden response
            console.warn(`⛔ Blocked: Attempt to proxy disallowed domain: ${parsedUrl.hostname}`);
            return res.status(403).send('⛔ Blocked: Not an allowed destination for proxying.');
        }

        console.log(`➡️ Proxying request to: ${decodedUrl}`);

        // Determine which protocol module (http or https) to use based on the destination URL
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        // Set up options for the outgoing request to the destination server
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80), // Default ports for HTTP/HTTPS
            path: parsedUrl.pathname + parsedUrl.search, // Include both path and query parameters
            method: req.method, // Use the same HTTP method as the incoming request (e.g., GET)
            headers: {
                // Mimic a browser's User-Agent to help avoid bot detection
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                // Set Referer and Origin headers to mimic YouTube requests
                'Referer': 'https://www.youtube.com/',
                'Origin': 'https://www.youtube.com',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                // IMPORTANT: Forward the 'Range' header for video seeking functionality.
                // This allows clients (like HTML5 video players) to request specific parts of the video.
                ...(req.headers['range'] && { 'Range': req.headers['range'] })
            }
        };

        // Make the request to the destination server
        const proxyReq = protocol.request(options, (proxyRes) => {
            // Write the status code and headers from the proxied response to the client response.
            // Copying headers like Content-Type, Content-Length, and Accept-Ranges is crucial for
            // correct video playback and seeking in the client's browser.
            res.writeHead(proxyRes.statusCode, {
                'Content-Type': proxyRes.headers['content-type'],
                'Content-Length': proxyRes.headers['content-length'],
                'Accept-Ranges': proxyRes.headers['accept-ranges'], // Tells the client server supports byte-range requests
                'Cache-Control': proxyRes.headers['cache-control'],
                'ETag': proxyRes.headers['etag'],
                'Last-Modified': proxyRes.headers['last-modified'],
                // Content-Range is sent with partial content (e.g., in response to a Range request)
                ...(proxyRes.headers['content-range'] && { 'Content-Range': proxyRes.headers['content-range'] })
            });
            // Pipe the data stream from the proxied response directly to the client's response.
            // This streams the video content without buffering the entire file on the proxy server.
            proxyRes.pipe(res);
        });

        // Handle errors during the proxy request (e.g., network issues, destination server down)
        proxyReq.on('error', (e) => {
            console.error(`❌ Problem with proxy request to ${decodedUrl}: ${e.message}`);
            res.status(500).send('Proxy request failed due to an error accessing the destination.');
        });

        // For requests that might have a body (like POST, PUT, although not typical for video streaming GETs),
        // pipe the incoming request body to the outgoing proxy request.
        req.pipe(proxyReq);
        // End the proxy request to send it off
        proxyReq.end();

    } catch (err) {
        // Catch errors related to URL parsing or other issues in the try block
        console.error(`❌ Invalid URL or proxy setup error: ${err.message}`);
        res.status(400).send('Invalid redirect request or proxy processing error.');
    }
});

// Define the port for the server to listen on
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Streaming proxy server running at http://localhost:${port}`);
    console.log(`To test, try navigating to: http://localhost:${port}/<encoded_youtube_video_url_here>`);
    console.log(`Example: If the video URL is 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', `);
    console.log(`encode it to 'https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ' and `);
    console.log(`then access: http://localhost:${port}/https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ`);
    console.log(`Note: You might need to use a direct googlevideo.com URL for actual video streaming via this proxy for use in a <video> tag.`);
});
