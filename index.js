import express from 'express';
import { URL } from 'url';

const app = express();

// 🔒 Define domains you're okay with redirecting to.
const ALLOWED_REDIRECT_DOMAINS = [
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
        const isAllowed = ALLOWED_REDIRECT_DOMAINS.some(domain => parsedUrl.hostname.endsWith(domain));
        if (!isAllowed) {
            // If the domain is not allowed, send a 403 Forbidden response
            console.warn(`⛔ Blocked: Attempt to redirect to disallowed domain: ${parsedUrl.hostname}`);
            return res.status(403).send('⛔ Blocked: Not an allowed destination for redirection.');
        }

        console.log(`➡️ Redirecting to: ${decodedUrl}`);

        // Set the 'Location' header to the destination URL
        res.setHeader('Location', decodedUrl);
        // Set browser-like headers to help with compatibility, though less critical for a redirect
        res.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        res.setHeader('Referer', 'https://www.youtube.com/');
        res.setHeader('Origin', 'https://www.youtube.com');
        res.setHeader('Accept-Language', 'en-US,en;q=0.9');
        res.setHeader('Connection', 'keep-alive');
        
        // Send a 302 Found status code, indicating a temporary redirect
        res.status(302).end();
    } catch (err) {
        // Catch errors related to URL parsing or other issues in the try block
        console.error(`❌ Invalid URL or redirect processing error: ${err.message}`);
        res.status(400).send('Invalid redirect request.');
    }
});

// Define the port for the server to listen on
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Redirect proxy server running at http://localhost:${port}`);
    console.log(`To test, try navigating to: http://localhost:${port}/<encoded_youtube_video_url_here>`);
    console.log(`Example: If the video URL is 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', `);
    console.log(`encode it to 'https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ' and `);
    console.log(`then access: http://localhost:${port}/https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ`);
    console.log(`Note: This will redirect your browser to the actual YouTube watch page.`);
});
