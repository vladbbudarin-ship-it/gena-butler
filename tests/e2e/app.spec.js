import { expect, test } from '@playwright/test'
import { expectBoxesDoNotOverlap, loginAs } from './helpers.js'

test('главная страница открывается, App загружается без критических ошибок', async ({ page }) => {
  const pageErrors = []
  const consoleErrors = []

  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await expect(page.getByRole('img', { name: 'Гена' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Вход' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Регистрация' })).toBeVisible()
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.getByText(/Invalid supabaseUrl|supabaseUrl is required/i)).toHaveCount(0)

  expect(pageErrors).toEqual([])
  expect(consoleErrors.filter((text) => !text.includes('favicon'))).toEqual([])
})

test('мобильная версия чата не перекрывает кнопку отправки', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await loginAs(page)
  await page.getByRole('button', { name: 'Чаты' }).click()

  const sendButton = page.getByRole('button', { name: 'Отправить' })
  const textarea = page.getByPlaceholder('текст')
  const mobileMenu = page.getByRole('button', { name: 'Открыть меню' })

  await expect(textarea).toBeVisible()
  await expect(sendButton).toBeVisible()
  await expect(mobileMenu).toBeVisible()

  const sendBox = await sendButton.boundingBox()
  const menuBox = await mobileMenu.boundingBox()
  expectBoxesDoNotOverlap(sendBox, menuBox)
})

test('страница проектов не доступна неавторизованному пользователю из интерфейса', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Проекты' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Вход' })).toBeVisible()
})

test('user_plus видит кнопку создания проекта', async ({ page }) => {
  await loginAs(page, { accountType: 'user_plus' })
  await page.getByRole('button', { name: 'Проекты' }).first().click()

  await expect(page.getByRole('button', { name: '+ Новый проект' })).toBeEnabled()
})

test('обычный user не может создать проект из интерфейса', async ({ page }) => {
  await loginAs(page, { accountType: 'user' })
  await page.getByRole('button', { name: 'Проекты' }).first().click()

  await expect(page.getByRole('button', { name: '+ Новый проект' })).toBeDisabled()
})
