/**
 * 评分体系的公共类型定义
 * - 该文件只放“规则稳定层”：ID、分数结构、聚合函数
 * - 所有规则阈值实现都应复用这里的类型，避免各处各写一套
 */

export type ScoreGrade = 'S+' | 'S' | 'A+' | 'A' | 'B' | 'C'

export type AuditStatus = 'ok' | 'warn' | 'fail'
export type ConfidenceFlag = 'low_sample' | 'normal'

export interface AuditItem {
  id: string
  status: AuditStatus
  score: number
  max: number
  reason: string
  evidence: string[]
  confidenceFlag?: ConfidenceFlag
}

export interface ScoreBreakdown {
  pay: number
  story: number
  market: number
  potential: number
  total110: number
  overall100: number
  grade: ScoreGrade
}

export interface ScoreMeta {
  rulesetVersion: 'v2.1.0-freeze-nodb'
  benchmarkMode: 'rule-only'
  noExternalDataset: true
  redlineHit: boolean
  redlineEvidence: string[]
}

export interface AnalysisScoreResult {
  meta: ScoreMeta
  score: {
    total_110: number
    overall_100: number
    grade: ScoreGrade
    breakdown_110: {
      pay: number
      story: number
      market: number
      potential: number
    }
  }
  audit: {
    items: AuditItem[]
  }
}

export const RULESET_VERSION = 'v2.1.0-freeze-nodb' as const

/**
 * 评分项按维度聚合
 * 注意：Grade 判断必须基于 total110 原始值（冻结规则 12.3）
 */
export function aggregateScores(items: AuditItem[]): ScoreBreakdown {
  const pay = sumByPrefix(items, 'pay.')
  const story = sumByPrefix(items, 'story.')
  const market = sumByPrefix(items, 'market.')
  const potential = sumByPrefix(items, 'potential.')
  const total110 = pay + story + market + potential
  const overall100 = Math.round((total110 / 110) * 100)
  const grade = mapGrade(total110)
  return { pay, story, market, potential, total110, overall100, grade }
}

/**
 * Grade 映射严格遵循冻结文档
 */
export function mapGrade(total110: number): ScoreGrade {
  if (total110 >= 101)
    return 'S+'
  if (total110 >= 91)
    return 'S'
  if (total110 >= 86)
    return 'A+'
  if (total110 >= 81)
    return 'A'
  if (total110 >= 70)
    return 'B'
  return 'C'
}

/**
 * 红线否决：保留 total110，仅覆盖 grade 与 overall100
 */
export function applyRedlineOverride(
  breakdown: ScoreBreakdown,
  redlineHit: boolean,
): ScoreBreakdown {
  if (!redlineHit)
    return breakdown
  return {
    ...breakdown,
    grade: 'C',
    overall100: Math.min(breakdown.overall100, 69),
  }
}

export function toAnalysisScoreResult(
  items: AuditItem[],
  breakdown: ScoreBreakdown,
  redlineHit: boolean,
  redlineEvidence: string[],
): AnalysisScoreResult {
  return {
    meta: {
      rulesetVersion: RULESET_VERSION,
      benchmarkMode: 'rule-only',
      noExternalDataset: true,
      redlineHit,
      redlineEvidence,
    },
    score: {
      total_110: breakdown.total110,
      overall_100: breakdown.overall100,
      grade: breakdown.grade,
      breakdown_110: {
        pay: breakdown.pay,
        story: breakdown.story,
        market: breakdown.market,
        potential: breakdown.potential,
      },
    },
    audit: { items },
  }
}

function sumByPrefix(items: AuditItem[], prefix: string) {
  return items
    .filter(item => item.id.startsWith(prefix))
    .reduce((sum, item) => sum + item.score, 0)
}
