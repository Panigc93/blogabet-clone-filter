/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Private, untracked read-only snapshot, packaged only for server routes.
    // The build artifact, not the public Git repository, supplies these files.
    outputFileTracingIncludes: {
      '/': ['./.private-data/olbg/*.json'],
      '/api/tipsters': ['./.private-data/olbg/*.json'],
    },
    // PGlite solo se usa en el entorno aislado local (USE_PGLITE=1); se
    // excluye del bundle para que sus assets WASM se resuelvan desde
    // node_modules en vez de .next/server/chunks.
    serverComponentsExternalPackages: ['@electric-sql/pglite'],
  },
}

export default nextConfig
