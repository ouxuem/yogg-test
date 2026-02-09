import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'

const { Given, When, Then } = createBdd()

Given('我打开应用', async ({ page }) => {
  await page.goto('/')
})

Given('我在分析输入框里输入小说文本', async ({ page }) => {
  const episodes = Array.from({ length: 15 }, (_, i) => `EPISODE ${i + 1}\nScene.\n`)
  const input = `TITLE: Test\nTOTAL_EPISODES: 15\nIS_COMPLETED: true\n\n${episodes.join('\n')}`
  await page.getByTestId('analysis-input').fill(input)
})

When('我点击开始分析按钮', async ({ page }) => {
  await Promise.all([
    page.waitForURL(/\/(analyze|result)(\?.*)?$/),
    page.getByTestId('analysis-submit').click(),
  ])
})

Then('我看到首页标题', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Hello,' })).toBeVisible()
})

Then('我进入分析中的加载状态', async ({ page }) => {
  await expect(page.getByTestId('analysis-loading')).toBeVisible()
})

Then('我位于结果页面', async ({ page }) => {
  await expect(page).toHaveURL(/\/result(\?.*)?$/)
})

Then('我看到总体分数卡片', async ({ page }) => {
  await expect(page.getByTestId('overall-score-card')).toBeVisible()
})

Then('我位于分析页面', async ({ page }) => {
  await expect(page).toHaveURL(/\/analyze(\?.*)?$/)
})

Then('页面没有侧边栏', async ({ page }) => {
  await expect(page.getByTestId('app-shell')).toHaveCount(0)
})

Then('页面不包含内部术语', async ({ page }) => {
  const content = await page.content()
  expect(content).not.toMatch(/\bV2\b|\bL1\b|\bL2\b|Entity freeze|Canonical aggregation/)
})
