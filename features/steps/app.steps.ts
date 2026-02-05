import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'

const { Given, When, Then } = createBdd()

Given('我打开应用', async ({ page }) => {
  await page.goto('/')
})

Given('我在分析输入框里输入小说文本', async ({ page }) => {
  await page
    .getByTestId('analysis-input')
    .fill('TITLE: Test\\nTOTAL_EPISODES: 15\\nIS_COMPLETED: true\\n\\nEPISODE 1\\n...')
})

When('我点击开始分析按钮', async ({ page }) => {
  await Promise.all([
    page.waitForURL('**/analyze'),
    page.getByTestId('analysis-submit').click(),
  ])
})

Then('我看到首页标题', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Hello,' })).toBeVisible()
})

Then('我进入分析中的加载状态', async ({ page }) => {
  await expect(page.getByTestId('analysis-loading')).toBeVisible()
})

Then('我位于分析页面', async ({ page }) => {
  await expect(page).toHaveURL(/\/analyze$/)
})

Then('页面没有侧边栏', async ({ page }) => {
  await expect(page.getByTestId('app-shell')).toHaveCount(0)
})
