import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const REPORT_DIR = path.join(process.cwd(), 'reports', 'codex')

function getArg(name, fallback = '') {
  const prefix = `--${name}=`
  const direct = process.argv.find((arg) => arg.startsWith(prefix))

  if (direct) {
    return direct.slice(prefix.length)
  }

  const index = process.argv.indexOf(`--${name}`)

  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }

  return process.env[`CODEX_REPORT_${name.replace(/-/g, '_').toUpperCase()}`] || fallback
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function getTimestamp() {
  const now = new Date()

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + '_' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join('-')
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    || 'codex-task'
}

function listFrom(value, fallback = 'Не указано.') {
  if (!value.trim()) {
    return `- ${fallback}`
  }

  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join('\n')
}

function sanitize(value) {
  return value
    .replace(/(api[_-]?key|token|service[_-]?role|secret)\s*[:=]\s*[^\s]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
}

function createReportContent(fields) {
  return sanitize(`# ${fields.title}

## 1. Название задачи

${fields.title}

## 2. Краткое описание задачи

${fields.description || 'Не указано.'}

## 3. Что было изменено

${listFrom(fields.changed)}

## 4. Какие файлы были изменены

${listFrom(fields.files)}

## 5. Какие ошибки были найдены

${listFrom(fields.foundErrors, 'Ошибок не найдено.')}

## 6. Какие ошибки были исправлены

${listFrom(fields.fixedErrors, 'Ошибки не исправлялись.')}

## 7. Какие проверки выполнены

${listFrom(fields.checks)}

## 8. Результат npm run build

${fields.buildResult || 'Не запускался.'}

## 9. Результат тестов, если они есть

${fields.testsResult || 'Не запускались.'}

## 10. Что нужно проверить вручную

${listFrom(fields.manualChecks)}

## 11. Риски и важные замечания

${listFrom(fields.risks)}

## 12. Следующий рекомендуемый шаг

${fields.nextStep || 'Не указано.'}
`)
}

function saveDriveCopy(localPath, fileName) {
  const driveDir = getArg('drive-dir') || process.env.CODEX_REPORT_GOOGLE_DRIVE_DIR

  if (!driveDir) {
    return {
      ok: false,
      message: 'Google Drive path is not available to this Node script.',
    }
  }

  try {
    mkdirSync(driveDir, { recursive: true })
    copyFileSync(localPath, path.join(driveDir, fileName))
    return {
      ok: true,
      message: path.join(driveDir, fileName),
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message,
    }
  }
}

const title = getArg('title', process.argv.slice(2).filter((arg) => !arg.startsWith('--')).join(' ') || 'Codex task')
const slug = slugify(getArg('slug', title))
const fileName = `${getTimestamp()}_${slug}.md`
const localPath = path.join(REPORT_DIR, fileName)
const existedBefore = existsSync(localPath)

mkdirSync(REPORT_DIR, { recursive: true })

const content = createReportContent({
  title,
  description: getArg('description'),
  changed: getArg('changed'),
  files: getArg('files'),
  foundErrors: getArg('found-errors'),
  fixedErrors: getArg('fixed-errors'),
  checks: getArg('checks'),
  buildResult: getArg('build-result'),
  testsResult: getArg('tests-result'),
  manualChecks: getArg('manual-checks'),
  risks: getArg('risks'),
  nextStep: getArg('next-step'),
})

writeFileSync(localPath, content, 'utf8')

const driveCopy = saveDriveCopy(localPath, fileName)

console.log(JSON.stringify({
  localPath,
  googleDrive: driveCopy,
  existedBefore,
}, null, 2))
