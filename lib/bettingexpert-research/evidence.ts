import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import type { BEProfileResearch } from './contract'

// A fixed, separately reviewed private artifact revision. Hashes bind custody,
// not source authenticity or permission. Never read an input-selected revision.
export const EVIDENCE_REVISION = 'b918696ba937714ceef165aab78c80f470136a45a28a29b839c74135708abcf4'
export const DATASET_SHA256 = '910b1c807b073e4990ab303048e5eb4895a3d8b3ba7bca3a535c9d2d3a2a4106'
export interface ResearchDataset { contractVersion: 1; profiles: BEProfileResearch[] }
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
export function privateResearchEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === 'development' && env.BE_PRIVATE_RESEARCH === '1'
}
/** No DB, fetch, write, caller dataset, manifest revision override or cache. */
export function loadResearchEvidence(directory: string): ResearchDataset {
  const root = resolve(directory)
  const bytes = readFileSync(resolve(root, 'EVIDENCE-MANIFEST.json'))
  if (sha(bytes) !== EVIDENCE_REVISION) throw Error('Unreviewed BE evidence revision')
  const manifest = JSON.parse(bytes.toString('utf8')) as Record<string, string>
  for (const [name, digest] of Object.entries(manifest)) {
    const path = resolve(root, name)
    if (!path.startsWith(root + sep) || !/^[a-f0-9]{64}$/.test(digest) || sha(readFileSync(path)) !== digest) throw Error('BE evidence bytes changed')
  }
  const data = readFileSync(resolve(root, 'statistics547.json'))
  if (sha(data) !== DATASET_SHA256 || manifest['statistics547.json'] !== DATASET_SHA256) throw Error('BE dataset changed')
  const dataset = JSON.parse(data.toString('utf8')) as ResearchDataset
  if (dataset.contractVersion !== 1 || dataset.profiles.length !== 547) throw Error('BE dataset scope changed')
  return dataset
}
export function loadPrivateResearch(env: NodeJS.ProcessEnv = process.env) {
  if (!privateResearchEnabled(env) || !env.BE_PRIVATE_RESEARCH_DIR) throw Error('Private BE research unavailable')
  return loadResearchEvidence(env.BE_PRIVATE_RESEARCH_DIR)
}
