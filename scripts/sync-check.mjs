#!/usr/bin/env node
// Compares this repo's src/ with customer-front-end's packages/site-kit/src
// and src/vendor/brand with packages/brand/src, and exits 1 on any drift.
//
//   node scripts/sync-check.mjs [path to a customer-front-end checkout]
//
// Default path: ../customer-front-end. The package name is normalised
// (@bookingsystemadvancedorg/site-kit here, @booqy/site-kit there) and the
// files in ALLOWED differ on purpose.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const customer = process.argv[2] ?? join(root, '..', 'customer-front-end')

// Intentional differences (relative to src/).
const ALLOWED = new Set([
  // skips src/vendor when it looks for storage writers
  'shared/storageRegistry.test.ts',
])

// Brand files site-kit does not need (tests, static build, Python and email tokens).
const BRAND_SKIPPED = (path) =>
  /\.test\.(ts|tsx)$/.test(path) ||
  path.startsWith('test/') ||
  ['static.ts', 'styles.ts', 'vite-env.d.ts', 'generated/booqy_brand_tokens.py', 'generated/email-tokens.json'].includes(path)

function files(dir, base = dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path, base) : [relative(base, path)]
  })
}

const normalise = (text) => text.replaceAll('@bookingsystemadvancedorg/site-kit', '@booqy/site-kit')

function compare(label, ours, theirs, { skipOurs = () => false, skipTheirs = () => false } = {}) {
  const drift = []
  const a = new Set(files(ours).filter((p) => !skipOurs(p)))
  const b = new Set(files(theirs).filter((p) => !skipTheirs(p)))
  for (const p of a) if (!b.has(p)) drift.push(`only in site-kit: ${p}`)
  for (const p of b) if (!a.has(p)) drift.push(`only in customer-front-end: ${p}`)
  for (const p of a) {
    if (!b.has(p) || ALLOWED.has(p)) continue
    if (normalise(readFileSync(join(ours, p), 'utf8')) !== normalise(readFileSync(join(theirs, p), 'utf8'))) {
      drift.push(`differs: ${p}`)
    }
  }
  console.log(`${label}: ${drift.length ? `${drift.length} difference(s)` : 'in sync'}`)
  for (const line of drift.sort()) console.log(`  ${line}`)
  return drift.length
}

if (!existsSync(join(customer, 'packages', 'site-kit', 'src'))) {
  console.error(`No customer-front-end checkout at ${customer}`)
  process.exit(2)
}

const drift =
  compare('src', join(root, 'src'), join(customer, 'packages', 'site-kit', 'src'), {
    skipOurs: (p) => p.startsWith('vendor/'),
  }) +
  compare('src/vendor/brand', join(root, 'src', 'vendor', 'brand'), join(customer, 'packages', 'brand', 'src'), {
    skipTheirs: BRAND_SKIPPED,
  })

process.exit(drift ? 1 : 0)
