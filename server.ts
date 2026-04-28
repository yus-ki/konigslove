import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// const cache = new Map<string, { data: any, timestamp: number }>();
// const CACHE_TTL = 60 * 60 * 1000; // 60 minutes
// const STALE_TTL = 24 * 60 * 60 * 1000; // 24 hours (allow stale data if API is down)
// let openMeteoErrorCount = 0;
// let lastOpenMeteoErrorTime = 0;

async function fetchWithRetry(url: string, options: any = {}, retries = 5, backoff = 3000): Promise<any> {
  const controller = new AbortController();
  const timeout = 15000; // 15s
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const fetchOptions = {
    ...options,
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...options.headers
    }
  };

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const status = response.status;
      
      if (retries > 0 && (status >= 500 || status === 429)) {
        const waitTime = status === 429 ? backoff * 5 : backoff;
        console.warn(`Retrying ${url} due to status ${status}. Retries left: ${retries}. Waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return fetchWithRetry(url, options, retries - 1, waitTime * 1.5);
      }
      
      // Try to get error text if possible
      let errorText = "";
      try {
        errorText = await response.text();
      } catch (e) {}
      
      throw new Error(`API responded with status: ${status}${errorText ? ' - ' + errorText.substring(0, 100) : ''}`);
    }

    const contentType = response.headers.get("content-type");
    const bodyText = await response.text();

    if (!contentType || !contentType.includes("application/json")) {
      // If it's not JSON but we expected it, throw error with snippet
      if (bodyText.trim().startsWith('<!doctype') || bodyText.trim().startsWith('<html')) {
        throw new Error("API returned HTML instead of JSON (likely an error page)");
      }
      throw new Error(`API returned non-JSON response: ${contentType}`);
    }

    try {
      const data = JSON.parse(bodyText);
      return data;
    } catch (e) {
      throw new Error(`Failed to parse JSON response: ${bodyText.substring(0, 100)}`);
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    const isNetworkError = 
      error.name === 'AbortError' || 
      error.code === 'ECONNRESET' || 
      error.code === 'ETIMEDOUT' || 
      error.code === 'EADDRINUSE' || 
      error.code === 'ECONNREFUSED' ||
      error.code === 'EPIPE' ||
      error.message.includes('network') ||
      error.message.includes('fetch failed') ||
      error.message.includes('socket disconnected') ||
      error.message.includes('socket hang up');

    if (retries > 0 && isNetworkError) {
      console.warn(`Retrying ${url} due to ${error.name || error.code || 'network error'}: ${error.message}. Retries left: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
    }

    throw error;
  }
}

async function startServer() {
  const app = express();
  app.use(cors());
  const PORT = 3000;

  // API Proxy for Location
  app.get("/api/location", async (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Location name is required" });

    try {
      // Fallback to Nominatim (OpenStreetMap)
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name as string)}&format=json&limit=1`;
      const nominatimData = await fetchWithRetry(nominatimUrl, {
        headers: { 'Accept-Language': 'en' }
      }, 2, 2000);
      
      if (nominatimData && Array.isArray(nominatimData) && nominatimData.length > 0) {
        const place = nominatimData[0];
        const parts = place.display_name ? place.display_name.split(',') : ['Unknown'];
        const formattedData = {
          results: [{
            name: parts[0] || 'Unknown',
            latitude: parseFloat(place.lat) || 0,
            longitude: parseFloat(place.lon) || 0,
            country: parts.length > 1 ? parts[parts.length - 1].trim() : 'Unknown'
          }]
        };
        res.json(formattedData);
      } else {
        throw new Error("Nominatim returned no results");
      }
    } catch (error) {
      console.error("All geocoding services failed:", error);
      res.status(500).json({ error: "Failed to fetch location data" });
    }
  });

  // Resolver for short URLs (Kugou, Netease, etc) and ID extractor
  app.get("/api/resolve-link", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      // 1. Follow redirects and fetch page content
      const response = await fetch(url as string, { 
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
        }
      });
      
      const finalUrl = response.url;
      const html = await response.text();
      
      let id = "";
      let server = "";
      let type: "song" | "playlist" | "album" = "playlist";

      // 1. Detect Server
      if (finalUrl.includes("163.com") || finalUrl.includes("netease")) server = "netease";
      else if (finalUrl.includes("qq.com")) server = "tencent";
      else if (finalUrl.includes("kugou.com")) server = "kugou";

      // 2. Targeted Extraction Logic per Platform
      if (server === "netease") {
        const match = finalUrl.match(/id=(\d+)/) || html.match(/id\s*:\s*["']?(\d+)["']?/i) || html.match(/songId\s*:\s*["']?(\d+)["']?/i);
        if (match) id = match[1];
        type = (finalUrl.includes("/song") || html.includes("songId") || (finalUrl.includes("id=") && !finalUrl.includes("playlist"))) ? "song" : "playlist";
      } else if (server === "tencent") {
        const match = finalUrl.match(/id=(\d+)/) || finalUrl.match(/playlist\/(\d+)/) || finalUrl.match(/song\/([a-zA-Z0-9]+)/) || finalUrl.match(/m\/song\/([a-zA-Z0-9]+)/) || html.match(/songid\s*:\s*["']?(\d+)["']?/i);
        if (match) id = match[1];
        type = (finalUrl.includes("/song") || finalUrl.includes("/m/song")) ? "song" : "playlist";
      } else if (server === "kugou") {
        const match = 
          finalUrl.match(/chain=([a-zA-Z0-9]+)/) || 
          finalUrl.match(/special\/single\/(\d+)/) || 
          finalUrl.match(/mixsong\/([a-zA-Z0-9]+)/) ||
          finalUrl.match(/specialId=(\d+)/) ||
          finalUrl.match(/albumId=(\d+)/) ||
          html.match(/var\s+specialId\s*=\s*['"]?(\d+)['"]?/i) ||
          html.match(/var\s+albumId\s*=\s*['"]?(\d+)['"]?/i) ||
          html.match(/var\s+id\s*=\s*['"]?(\d+)['"]?/i) ||
          html.match(/id\s*:\s*["']?(\d+)["']?/i) ||
          html.match(/data-rid=["'](\d+)["']/i);
        
        if (match) id = match[1];
        type = (finalUrl.includes("/mixsong/") || finalUrl.includes("/song/") || html.includes("mixsong")) ? "song" : "playlist";
      } else {
        // Fallback generic extraction
        const genericIdMatch = 
          html.match(/id\s*:\s*["']?(\d+)["']?/i) || 
          html.match(/songId\s*:\s*["']?(\d+)["']?/i) || 
          html.match(/rid\s*:\s*(\d+)/i);
        if (genericIdMatch) id = genericIdMatch[1];
      }

      res.json({ 
        finalUrl, 
        id: id || null,
        server: server || null,
        type: type
      });
    } catch (error) {
      console.error("Link resolution failed:", error);
      res.json({ finalUrl: url, id: null, server: null, type: "playlist" }); 
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
