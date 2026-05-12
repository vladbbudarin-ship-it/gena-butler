import { expect } from '@playwright/test'

export const testUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
}

export function profileFor(accountType = 'user') {
  return {
    id: testUser.id,
    email: testUser.email,
    name: 'Тестовый пользователь',
    public_id: '1234567890',
    role: accountType === 'owner' ? 'owner' : 'user',
    account_type: accountType,
    telegram_user_id: null,
    telegram_username: null,
  }
}

function sessionPayload(user = testUser) {
  return {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'test-refresh-token',
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  }
}

export async function seedAuthSession(page, user = testUser) {
  await page.addInitScript((payload) => {
    localStorage.setItem('sb-test-auth-token', JSON.stringify(payload))
  }, sessionPayload(user))
}

export async function mockAppApi(page, { accountType = 'user' } = {}) {
  const profile = profileFor(accountType)

  await page.route('**/.netlify/functions/get-my-profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, profile }),
    })
  })

  await page.route('**/.netlify/functions/get-my-chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        conversation: {
          id: 'owner-conversation',
          type: 'owner',
          title: 'Бударин',
          last_message: null,
        },
        messages: [],
      }),
    })
  })

  await page.route('**/.netlify/functions/get-direct-chats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, conversations: [] }),
    })
  })

  await page.route('https://test.supabase.co/rest/v1/sup_projects**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await page.route('https://test.supabase.co/rest/v1/sup_project_members**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })
}

export async function mockSupabasePasswordLogin(page, user = testUser) {
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionPayload(user)),
    })
  })
}

export async function loginAs(page, { accountType = 'user' } = {}) {
  await mockAppApi(page, { accountType })
  await mockSupabasePasswordLogin(page)
  await page.goto('/')
  await page.locator('input[type="email"]').fill(testUser.email)
  await page.locator('input[type="password"]').fill('test-password')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('button', { name: 'Чаты' })).toBeVisible()
}

export function expectBoxesDoNotOverlap(first, second) {
  expect(first).toBeTruthy()
  expect(second).toBeTruthy()

  const overlaps = !(
    first.x + first.width <= second.x
    || second.x + second.width <= first.x
    || first.y + first.height <= second.y
    || second.y + second.height <= first.y
  )

  expect(overlaps).toBe(false)
}
