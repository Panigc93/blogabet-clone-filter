/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // PGlite solo se usa en el entorno aislado local (USE_PGLITE=1); se
    // excluye del bundle para que sus assets WASM se resuelvan desde
    // node_modules en vez de .next/server/chunks.
    serverComponentsExternalPackages: ['@electric-sql/pglite'],
  },
}

export default nextConfig
