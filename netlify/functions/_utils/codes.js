import { randomInt } from 'node:crypto'

export function generateShortCode() {
  const digits = String(randomInt(0, 10000)).padStart(4, '0')
  const letters = `${String.fromCharCode(65 + randomInt(0, 26))}${String.fromCharCode(65 + randomInt(0, 26))}`

  return `${digits}${letters}`
}

export function generateInviteCode() {
  return generateShortCode()
}

export function generateTelegramLinkCode() {
  return `TG-${generateShortCode()}`
}
