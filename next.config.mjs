/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strip console.log statements in production builds to prevent leaking debugging data
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    "**/*": ["./schema.sql"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://accounts.google.com https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https: http:",
              "connect-src 'self' https: wss: http://localhost:*",
              "frame-src 'self' https://accounts.google.com https://www.facebook.com https://www.instagram.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com https://www.facebook.com https://api.instagram.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ]
  },
}

export default nextConfig
