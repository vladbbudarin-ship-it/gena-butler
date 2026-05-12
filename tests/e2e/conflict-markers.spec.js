import { expect, test } from '@playwright/test'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const ignoredDirs = new Set([
  '.git',
  '.netlify',
  '.netlify-local-appdata',
  '.netlify-local-config',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.sql',
  '.toml',
  '.txt',
  '.yml',
])

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue
    }

    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath))
      continue
    }

    if (entry.isFile() && textExtensions.has(path.extname(entry.name))) {
      files.push(fullPath)
    }
  }

  return files
}

test('в коде нет Git conflict markers', async () => {
  const root = process.cwd()
  const files = await collectFiles(root)
  const offenders = []

  for (const file of files) {
    const content = await readFile(file, 'utf8')

    if (/^(<{7}|={7}|>{7})/m.test(content)) {
      offenders.push(path.relative(root, file))
    }
  }

  expect(offenders).toEqual([])
})
