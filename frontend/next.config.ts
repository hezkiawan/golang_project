import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // rewrites = next.js forwards the request to our go services
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: "http://localhost:3003/auth/:path*", // user service
      },
      {
        source: "/api/services/:path*", // /api/services and /api/services/5 (edit, delete)
        destination: "http://localhost:3002/services/:path*", // catalog service
      },
      {
        source: "/api/usernames",
        destination: "http://localhost:3003/usernames", // username service
      },
      {
        source: "/api/bookings/:path*", // /api/bookings, /api/bookings/me, /api/bookings/5/confirm
        destination: "http://localhost:3001/bookings/:path*", // booking service
      },
      {
        source: "/api/notifications",
        destination: "http://localhost:3004/notifications", // notification service
      },
      {
        source: "/api/notifications/:path*", // /api/notifications and /api/notifications/me
        destination: "http://localhost:3004/notifications/:path*", // notification service
      },
      {
        source: "/api/users",
        destination: "http://localhost:3003/users",
      }
    ];
  },
};

export default nextConfig;