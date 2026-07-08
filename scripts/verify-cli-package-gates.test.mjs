import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const cliSrcDir = new URL('../packages/cli/src', import.meta.url)

async function readCliSourceFiles() {
  const entries = await readdir(cliSrcDir, { recursive: true, withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.(ts|tsx)$/.test(entry.name)) continue

    const entryDir = entry.parentPath ?? entry.path // Node version compat
    if (/(^|\/)(node_modules|dist)(\/|$)/.test(entryDir)) continue

    const fullPath = path.join(entryDir, entry.name)
    files.push(fullPath)
  }

  return files
}

async function readCliSourceConcat() {
  const files = await readCliSourceFiles()
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')))
  return { files, source: contents.join('\n') }
}

test('packages/cli source only uses neutral workspace paths (leak gate)', async () => {
  const { source } = await readCliSourceConcat()

  // Same 5 forbidden regexes as scripts/verify-cli-start-gates.test.mjs
  // lines 83-89, applied here to the CLI package copy instead of App.tsx.
  const forbiddenPathPatterns = [
    [/~\/Desktop\b/, 'home Desktop paths'],
    [/\/Users\//, 'absolute user paths'],
    [/Desktop\/job\b/, 'local job folder paths'],
    [/monklabs\/busycode\b/, 'internal repository paths'],
    [/~\/\.\.\//, 'shortened local repository paths'],
  ]

  for (const [pattern, description] of forbiddenPathPatterns) {
    assert(!pattern.test(source), `packages/cli source must not expose ${description}`)
  }
})

test('claude.timeline.ts drift anchors (H3 + neutral workspace + synthetic helper)', async () => {
  const timelineSource = await readFile(
    new URL('../packages/cli/src/lanes/claude.timeline.ts', import.meta.url),
    'utf8',
  )

  assert(
    timelineSource.includes("'~/workspace'"),
    'claude.timeline.ts must keep the neutral FALLBACK_WORKSPACE literal',
  )

  const titleMatches = timelineSource.match(/title:\s*'/g) ?? []
  assert.equal(titleMatches.length, 9, 'claudeTimeline must contain exactly 9 events (H3)')

  assert(
    timelineSource.includes('Web Search('),
    'claude.timeline.ts must keep the Web Search( template token (synthetic helper, interactive-only)',
  )
})
