import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Pure static export — deployable to any static host (we use Cloudflare
  // Workers static assets). Every page is prerendered; there are no API routes.
  output: 'export',
};

export default withMDX(config);
