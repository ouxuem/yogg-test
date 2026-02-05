import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'

const { Given, Then } = createBdd()

Given('我打开应用', async ({ page }) => {
  await page.goto('/')
})

Then('我看到首页标题', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Hello,' })).toBeVisible()
})
