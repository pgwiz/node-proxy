import http from 'http'; // Used for creating the server and client requests
import https from 'https'; // Used for HTTPS client requests
import { URL } from 'url';
import net from 'net'; // For TCP connections needed for CONNECT method

// 🔒 Define domains you're okay with proxying to.
// All requests (HTTP or HTTPS CONNECT) will be checked against this list.
const ALLOWED_PROXY_DOMAINS = [
    'youtube.com',
    'googlevideo.com',
    'ytimg.com',
    'youtu.be',
    // Add more domains if yt-dlp or other tools access them
    // Example: specific googlevideo.com subdomains that might appear
    '.googlevideo.com' // Using a leading dot to match subdomains
];

// Helper function to check if a hostname is allowed
function isDomainAllowed(hostname) {
    return ALLOWED_PROXY_DOMAINS.some(domain => hostname.endsWith(domain));
}

// Create the proxy server. We'll handle requests directly on its events.
const proxyServer = http.createServer((req, res) => {
    // --- HTTP Proxy Handling (for GET, POST, etc.) ---
    // This handler will deal with standard HTTP requests that are not CONNECT methods.
    // For a proxy, `req.url` for HTTP methods will typically be a full URL (e.g., http://example.com/path).

    const destinationUrl = req.url;
    let parsedUrl;

    try {
        // Attempt to parse the destination URL
        parsedUrl = new URL(destinationUrl);
    } catch (err) {
        // If the URL is malformed or not a full URL as expected by standard HTTP proxying,
        // send a 400 Bad Request. This covers cases where `yt-dlp` might send an unexpected URL format.
        console.error(`❌ HTTP proxy handling error: Invalid URL '${destinationUrl}': ${err.message}`);
        return res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request: Invalid URL format for HTTP proxying.');
    }

    if (!isDomainAllowed(parsedUrl.hostname)) {
        console.warn(`⛔ Blocked: Attempt to proxy disallowed domain via HTTP: ${parsedUrl.hostname}`);
        return res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden: Not an allowed destination for HTTP proxying.');
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
    // and remove hop-by-hop headers as per RFC 7230 (Connection, Keep-Alive etc.)
    for (const header in req.headers) {
        const lowerCaseHeader = header.toLowerCase();
        if (lowerCaseHeader !== 'proxy-connection' &&
            lowerCaseHeader !== 'proxy-authenticate' &&
            lowerCaseHeader !== 'proxy-authorization' &&
            lowerCaseHeader !== 'connection' && // These are hop-by-hop
            lowerCaseHeader !== 'keep-alive' &&  // These are hop-by-hop
            lowerCaseHeader !== 'transfer-encoding' && // These are hop-by-hop
            lowerCaseHeader !== 'te' && // These are hop-by-hop
            lowerCaseHeader !== 'trailer' && // These are hop-by-hop
            lowerCaseHeader !== 'upgrade') { // These are hop-by-hop
            requestOptions.headers[header] = req.headers[header];
        }
    }

    // Add a default User-Agent if not present, to mimic a browser
    if (!requestOptions.headers['user-agent']) {
        requestOptions.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    }

    const proto = parsedUrl.protocol === 'https:' ? https : http;

    const proxyReq = proto.request(requestOptions, (proxyRes) => {
        // Copy all headers from the proxied response to the client response,
        // excluding hop-by-hop headers which should not be forwarded.
        const responseHeaders = { ...proxyRes.headers };
        delete responseHeaders['transfer-encoding'];
        delete responseHeaders['connection'];
        delete responseHeaders['keep-alive'];
        delete responseHeaders['te'];
        delete responseHeaders['trailer'];
        delete responseHeaders['upgrade'];

        res.writeHead(proxyRes.statusCode, responseHeaders);
        proxyRes.pipe(res); // Pipe the response body
    });

    proxyReq.on('error', (err) => {
        console.error(`❌ HTTP proxy request error to ${parsedUrl.href}: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Proxy error accessing destination.');
    });

    req.pipe(proxyReq); // Pipe the client's request body to the proxy request
});


// --- HTTPS Proxy Handling (for CONNECT method) ---
// This handles the CONNECT method for tunneling HTTPS traffic.
// This event is fired when a client requests a TCP tunnel through the proxy.
proxyServer.on('connect', (req, clientSocket, head) => {
    // The request URL for CONNECT method is usually just 'hostname:port'
    const [hostname, port] = req.url.split(':');
    const targetPort = parseInt(port, 10) || 443; // Default to 443 for HTTPS

    if (!hostname || !targetPort || isNaN(targetPort)) {
        console.warn(`⛔ Blocked: Malformed CONNECT request URL: ${req.url}`);
        clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        clientSocket.end();
        return;
    }

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
        // If client socket errors, ensure server socket is closed if still writable
        if (serverSocket.writable) {
            serverSocket.end();
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
