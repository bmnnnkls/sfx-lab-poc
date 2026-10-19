/** Save exact uncommitted source alongside verification evidence. No repository mutation. */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const destination = process.argv[2] ?? 'docs/measurements/f1-fix/candidate-source'
mkdirSync(destination, { recursive: true })
const roots = ['src', 'tests', 'scripts']
const configs = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts']
const files = [...configs, ...roots.flatMap(root => readdirSync(root, { recursive: true }).map(name => `${root}/${name}`).filter(name => /\.(ts|tsx|mjs|json)$/.test(name)))].sort()
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
const manifest = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), status: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }), files: Object.fromEntries(files.map(path => [path, digest(path)])), bundles: Object.fromEntries(readdirSync('dist/assets').filter(n => n.endsWith('.js')).map(n => [`dist/assets/${n}`, digest(`dist/assets/${n}`)])) }
writeFileSync(`${destination}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
execFileSync('tar', ['-czf', `${destination}/source.tar.gz`, ...roots, ...configs])
writeFileSync(`${destination}/tracked-source.patch`, execFileSync('git', ['diff', '--binary', '--', ...roots, ...configs]))
console.log(`Saved ${files.length} source/config hashes, build hashes, full source archive and tracked diff in ${destination}`)
