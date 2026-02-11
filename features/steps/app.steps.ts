import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'

const { Given, When, Then } = createBdd()

function parseScaleFromTransform(transform: string) {
  if (transform === 'none')
    return 1
  const matrixMatch = transform.match(/matrix\(([^)]+)\)/)
  if (matrixMatch == null)
    return 1
  const first = matrixMatch[1]?.split(',')[0]
  const value = Number.parseFloat(first ?? '1')
  return Number.isFinite(value) ? value : 1
}

Given('我打开应用', async ({ page }) => {
  await page.goto('/')
})

Given('我启用系统减少动态效果偏好', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
})

Given('我在分析输入框里输入小说文本', async ({ page }) => {
  const episodes = Array.from({ length: 15 }, (_, i) => `EPISODE ${i + 1}\nScene.\n`)
  const input = `TITLE: Test\nTOTAL_EPISODES: 15\nIS_COMPLETED: true\n\n${episodes.join('\n')}`
  await page.getByTestId('analysis-input').fill(input)
})

When('我点击开始分析按钮', async ({ page }) => {
  await page.getByTestId('analysis-submit').click()
  await Promise.race([
    page.waitForURL(/\/result(\?.*)?$/),
    page.getByTestId('home-stream-loading').waitFor({ state: 'visible' }),
  ])
})

Then('我看到首页标题', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /hello/i })).toBeVisible()
})

Then('我看到分析输入框', async ({ page }) => {
  await expect(page.getByTestId('analysis-input')).toBeVisible()
})

Then('我看到了路由过渡容器', async ({ page }) => {
  const presence = page.getByTestId('route-presence')
  await expect(presence).toBeVisible()
  await expect(presence).toHaveAttribute('data-motion-state', /(running|idle)/)
})

Then('我进入分析中的加载状态', async ({ page }) => {
  await expect(page.getByTestId('analysis-loading')).toBeVisible()
})

Then('我位于结果页面', async ({ page }) => {
  await expect(page).toHaveURL(/\/result(\?.*)?$/, { timeout: 120_000 })
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

Then('分析按钮按下时有缩放反馈', async ({ page }) => {
  const button = page.getByTestId('analysis-submit')
  await expect(button).toBeEnabled()

  const before = await button.evaluate(node => getComputedStyle(node).transform)
  await button.dispatchEvent('pointerdown', { pointerType: 'mouse' })
  await page.waitForTimeout(80)
  const during = await button.evaluate(node => getComputedStyle(node).transform)
  await button.dispatchEvent('pointerup', { pointerType: 'mouse' })

  expect(parseScaleFromTransform(during)).toBeLessThan(parseScaleFromTransform(before))
})

Then('分析按钮按下时不发生缩放', async ({ page }) => {
  const button = page.getByTestId('analysis-submit')
  await expect(button).toBeEnabled()

  const before = await button.evaluate(node => getComputedStyle(node).transform)
  await button.dispatchEvent('pointerdown', { pointerType: 'mouse' })
  await page.waitForTimeout(80)
  const during = await button.evaluate(node => getComputedStyle(node).transform)
  await button.dispatchEvent('pointerup', { pointerType: 'mouse' })

  const delta = Math.abs(parseScaleFromTransform(during) - parseScaleFromTransform(before))
  expect(delta).toBeLessThan(0.005)
})
