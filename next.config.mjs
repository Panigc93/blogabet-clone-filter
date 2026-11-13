/** @type {import('next').NextConfig} */
const nextConfig = {
  // RAMA DEMO: PGlite (WASM) se carga desde node_modules en runtime, sin bundlear
  experimental: {
    serverComponentsExternalPackages: ['@electric-sql/pglite'],
  },
}

export default nextConfig
