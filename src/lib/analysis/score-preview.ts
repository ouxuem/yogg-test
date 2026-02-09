import type { PreviewScore } from '@/lib/analysis/analysis-result'
import type { AnalysisScoreResult } from '@/lib/analysis/score-types'

/**
 * 将真实分数映射为 Result 页面当前使用的 previewScore 结构
 * 说明：
 * - UI 暂时仍消费 previewScore，因此这里做一层兼容映射
 * - 不是“随机预览分”，而是基于真实评分维度换算
 */
export function toPreviewScoreFromScore(result: AnalysisScoreResult): PreviewScore {
  const breakdown = result.score.breakdown_110
  return {
    overall100: result.score.overall_100,
    grade: result.score.grade,
    monetization: Math.round((breakdown.pay / 50) * 100),
    story: Math.round((breakdown.story / 30) * 100),
    market: Math.round((breakdown.market / 20) * 100),
  }
}
