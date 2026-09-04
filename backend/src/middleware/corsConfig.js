/**
 * CORS Configuration for BillKaro
 * 
 * Protects against cross-origin data theft and unauthorized external website access.
 * - In production: strictly enforces whitelisted origins (or same-origin requests).
 * - In development: permits localhost and local private network IPs (e.g. for iPad/LAN testing).
 */

export function createCorsOriginValidator(isProd = process.env.NODE_ENV === 'production') {
  const envOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedOrigins = new Set(envOrigins);

  // Auto-allow Render hostname if deployed on Render
  if (isProd && process.env.RENDER_EXTERNAL_HOSTNAME) {
    allowedOrigins.add(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`);
  }

  return function isOriginAllowed(origin, callback) {
    // 1. Allow requests without an Origin header (same-origin, curl, server-to-server, mobile apps)
    if (!origin) {
      return callback(null, true);
    }

    // 2. Allow explicitly configured origins
    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    // 3. In non-production environments, allow localhost and private LAN IPs (for iPad/KDS testing)
    if (!isProd) {
      try {
        const url = new URL(origin);
        const host = url.hostname;
        const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        const isPrivateLan =
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
          /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
          /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);

        if (isLocalhost || isPrivateLan) {
          return callback(null, true);
        }
      } catch {
        // Invalid origin format
      }
    }

    // 4. Reject all untrusted origins
    if (isProd) {
      console.warn(`[CORS] Blocked unauthorized cross-origin request from: ${origin}`);
    }
    return callback(null, false);
  };
}

export function getCorsOptions(isProd = process.env.NODE_ENV === 'production') {
  const originValidator = createCorsOriginValidator(isProd);
  return {
    origin: originValidator,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // 24 hours preflight cache
  };
}

export function getSocketCorsOptions(isProd = process.env.NODE_ENV === 'production') {
  const originValidator = createCorsOriginValidator(isProd);
  return {
    origin: originValidator,
    credentials: true,
    methods: ['GET', 'POST'],
  };
}
