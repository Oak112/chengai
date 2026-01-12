import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Avoid bundling heavy / worker-based server deps into Next server chunks.
  // This fixes pdf.js worker resolution issues in server runtimes.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'mammoth'],

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_APP_NAME: 'ChengAI',
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
