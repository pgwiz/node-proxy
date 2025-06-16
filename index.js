import express from 'express';
import http from 'http'; // Used for both HTTP server and client requests
import https from 'https'; // Used for HTTPS client requests
import { URL } from 'url';
import net from 'net'; // For TCP connections needed for CONNECT method

const app = express(); // Express app for handling HTTP GET/POST etc.
const proxyServer = http.createServer(app); // Create an HTTP server that uses the Express app

// 🔒 Define domains you're okay with proxying to.
// All requests (HTTP or HTTPS CONNECT) will be checked against this list.
const ALLOWED_PROXY_DOMAINS = [
    'youtube.com',
    'googlevideo.com',
    'ytimg.com',
    'youtu.be',
    // Add more domains if yt-dlp or other tools access them
    'rr1---sn-nvj-jj7e.googlevideo.com' // Example of a direct video server hostname
];

// Helper function to check if a hostname is allowed
function isDomainAllowed(hostname) {
    return ALLOWED_PROXY_DOMAINS.some(domain => hostname.endsWith(domain));
}

// --- HTTP Proxy Handling (for GET, POST, etc.) ---
// This handles non-CONNECT requests (standard HTTP forwarding)
app.use((req, res) => {
    const destinationUrl = req.url; // For HTTP, req.url is the full URL or path
    let parsedUrl;

    try {
        // If req.url is a full URL (e.g., in a transparent proxy setup), parse it directly
        // Otherwise, assume it's a path and reconstruct the URL
        if (destinationUrl.startsWith('http://') || destinationUrl.startsWith('https://')) {
            parsedUrl = new URL(destinationUrl);
        } else {
            // For requests coming to the proxy where only the path is given (e.g., `/some/path`),
            // this part might need adjustment depending on how yt-dlp sends HTTP requests.
            // For now, it assumes a full URL for direct HTTP proxying.
            // If yt-dlp sends relative paths, this proxy won't work without a base URL.
            console.warn(`Attempted to proxy relative path: ${destinationUrl}. This proxy expects full URLs for HTTP requests.`);
            return res.status(400).send('Bad Request: Full URL expected for HTTP proxying.');
        }

        if (!isDomainAllowed(parsedUrl.hostname)) {
            console.warn(`⛔ Blocked: Attempt to proxy disallowed domain via HTTP: ${parsedUrl.hostname}`);
            return res.status(403).send('⛔ Blocked: Not an allowed destination for HTTP proxying.');
        }

        console.log(`➡️ Proxying HTTP request: ${req.method} ${parsedUrl.href}`);

        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: req.method,
            headers: {}
        };

        // Copy all original request headers, except proxy-specific ones
        for (const header in req.headers) {
            if (header.toLowerCase() !== 'proxy-connection' &&
                header.toLowerCase() !== 'proxy-authenticate' &&
                header.toLowerCase() !== 'proxy-authorization') {
                requestOptions.headers[header] = req.headers[header];
            }
        }

        // Use appropriate protocol (http or https) for the outgoing request
        const proto = parsedUrl.protocol === 'https:' ? https : http;

        const proxyReq = proto.request(requestOptions, (proxyRes) => {
            // Copy all headers from the proxied response to the client response
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res); // Pipe the response body
        });

        proxyReq.on('error', (err) => {
            console.error(`❌ HTTP proxy request error to ${parsedUrl.href}: ${err.message}`);
            res.status(500).send('Proxy error accessing destination.');
        });

        req.pipe(proxyReq); // Pipe the client's request body to the proxy request
    } catch (err) {
        console.error(`❌ HTTP proxy handling error: ${err.message}`);
        res.status(400).send('Invalid HTTP proxy request.');
    }
});


// --- HTTPS Proxy Handling (for CONNECT method) ---
// This handles the CONNECT method for tunneling HTTPS traffic
proxyServer.on('connect', (req, clientSocket, head) => {
    // The request URL for CONNECT method is usually just 'hostname:port'
    const [hostname, port] = req.url.split(':');
    const targetPort = parseInt(port, 10) || 443; // Default to 443 for HTTPS

    if (!isDomainAllowed(hostname)) {
        console.warn(`⛔ Blocked: Attempt to proxy disallowed domain via CONNECT: ${hostname}`);
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.end();
        return;
    }

    console.log(`➡️ CONNECT to: ${hostname}:${targetPort}`);

    // Establish a connection to the destination server
    const serverSocket = net.connect(targetPort, hostname, () => {
        // If connection successful, send 200 OK to the client
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
                           'Proxy-Agent: Node.js-Proxy\r\n\r\n');
        serverSocket.write(head); // Forward any data received before connection established

        // Pipe data between client and server sockets
        clientSocket.pipe(serverSocket);
        serverSocket.pipe(clientSocket);
    });

    // Handle errors on the server-side socket (connection to destination)
    serverSocket.on('error', (err) => {
        console.error(`❌ CONNECT server socket error to ${hostname}:${targetPort}: ${err.message}`);
        // Inform the client about the error
        if (clientSocket.writable) {
            clientSocket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            clientSocket.end();
        }
    });

    // Handle errors on the client-side socket
    clientSocket.on('error', (err) => {
        console.error(`❌ CONNECT client socket error from ${req.url}: ${err.message}`);
        if (serverSocket.writable) {
            serverSocket.end(); // Close server socket if client disconnects or errors
        }
    });
});

const port = process.env.PORT || 3000;
proxyServer.listen(port, () => {
    console.log(`🚀 Full proxy server (HTTP/HTTPS) running at http://localhost:${port}`);
    console.log(`To use with yt-dlp, configure it to use this proxy, e.g.:`);
    console.log(`yt-dlp --proxy http://localhost:${port} "https://www.youtube.com/watch?v=VIDEO_ID"`);
    console.log(`Remember to replace 'localhost' and '3000' with your deployment's address and port.`);
});
