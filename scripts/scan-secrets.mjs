#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const MAX_FILE_BYTES = 1_000_000
const repoRoot = process.cwd()

const rules = [
  {
    id: 'jwt-secret',
    pattern: /\bJWT_SECRET[ \t]*[:=][ \t]*["']?([^\r\n"',]*)["']?/gi,
    message: 'Possible committed JWT secret',
  },
  {
    id: 'cloudinary-key',
    pattern: /\bCLOUDINARY_API_KEY[ \t]*[:=][ \t]*["']?([^\r\n"',]*)["']?/gi,
    message: 'Possible committed Cloudinary API key',
  },
  {
    id: 'cloudinary-secret',
    pattern: /\bCLOUDINARY_API_SECRET[ \t]*[:=][ \t]*["']?([^\r\n"',]*)["']?/gi,
    message: 'Possible committed Cloudinary API secret',
  },
  {
    id: 'resend-key',
    pattern: /\bRESEND_API_KEY[ \t]*[:=][ \t]*["']?([^\r\n"',]*)["']?/gi,
    message: 'Possible committed Resend API key',
  },
  {
    id: 'smtp-pass',
    pattern: /\bSMTP_PASS[ \t]*[:=][ \t]*["']?([^\r\n"',]*)["']?/gi,
    message: 'Possible committed SMTP password',
  },
]

const placeholderMatchers = [
  /^$/,
  /^your[-_<]/i,
  /^example/i,
  /^replace[-_<]/i,
  /^change[-_<]/i,
  /^changeme/i,
  /^placeholder/i,
  /^<.+>$/,
  /^\$\{.+\}$/,
  /^postgres(ql)?:\/\/user:password@/i,
  /^re_test_/i,
  /^app-password$/i,
]

const stdinFiles = process.stdin.isTTY ? '' : readFileSync(0, 'utf8')
const files = stdinFiles
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => !file.startsWith('.githooks/'))

if (files.length === 0) {
  console.error('No files supplied to secret scanner. Pipe file paths via stdin.')
  process.exit(2)
}

const findings = []

for (const relativePath of files) {
  if (
    relativePath.startsWith('test/') ||
    relativePath.includes('.spec.')
  ) {
    continue
  }

  const absolutePath = resolve(repoRoot, relativePath)
  let stats
  try {
    stats = statSync(absolutePath)
  } catch {
    continue
  }

  if (!stats.isFile() || stats.size > MAX_FILE_BYTES) {
    continue
  }

  let contents
  try {
    contents = readFileSync(absolutePath, 'utf8')
  } catch {
    continue
  }

  for (const rule of rules) {
    for (const match of contents.matchAll(rule.pattern)) {
      const secretValue =
        match[1]?.trim().replace(/[;)}\]]+$/, '') ?? ''
      if (secretValue.startsWith('${')) {
        continue
      }
      if (isPlaceholder(secretValue)) {
        continue
      }

      const line = lineNumberForIndex(contents, match.index ?? 0)
      findings.push({
        file: relativePath,
        line,
        message: rule.message,
      })
    }
  }
}

if (findings.length > 0) {
  console.error('Secret scan failed. Replace committed credentials with placeholders.')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.message}`)
  }
  process.exit(1)
}

console.log(`Secret scan passed (${files.length} files checked).`)

function isPlaceholder(value) {
  return placeholderMatchers.some((pattern) => pattern.test(value))
}

function lineNumberForIndex(contents, index) {
  return contents.slice(0, index).split(/\r?\n/).length
}
