import { z } from 'zod'

/**
 * ============================================================================
 * AI 输出 Schema（MVP：双阶段）
 * - EpisodePassSchema: 第1次 AI，逐集结构化
 * - GlobalSummarySchema: 第2次 AI，全局文案总结
 * - PresentationSchema: 最终响应展示层（后端强校验）
 * ============================================================================
 */

const HookTypeSchema = z.string().trim().min(1).max(48)
const HighlightSchema = z.string().trim().min(8).max(220)
const IssueTextSchema = z.string().trim().min(4).max(240)

export const EpisodePassItemSchema = z.object({
  episode: z.number().int().min(1),
  health: z.enum(['GOOD', 'FAIR', 'PEAK']),
  primaryHookType: HookTypeSchema,
  aiHighlight: HighlightSchema,
  state: z.enum(['optimal', 'issue', 'neutral']),
  issueCategory: z.enum(['structure', 'pacing', 'mixed']),
  issueLabel: z.string().trim().min(1).max(72),
  issueReason: IssueTextSchema,
  suggestion: IssueTextSchema,
  emotionLevel: z.enum(['Low', 'Medium', 'High']),
  conflictDensity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  pacingScore: z.number().min(0).max(10),
  signalPercent: z.number().min(0).max(100),
})

export const EpisodePassSchema = z.object({
  episodes: z.array(EpisodePassItemSchema).min(1),
})

export const GlobalSummarySchema = z.object({
  commercialSummary: z.string().trim().min(20).max(280),
  dimensionNarratives: z.object({
    monetization: z.string().trim().min(12).max(220),
    story: z.string().trim().min(12).max(220),
    market: z.string().trim().min(12).max(220),
  }),
  chartCaptions: z.object({
    emotion: z.string().trim().min(12).max(200),
    conflict: z.string().trim().min(12).max(200),
  }),
  diagnosisOverview: z.object({
    integritySummary: z.string().trim().min(16).max(260),
    pacingFocusEpisode: z.number().int().min(1),
    pacingIssueLabel: z.string().trim().min(3).max(72),
    pacingIssueReason: z.string().trim().min(8).max(220),
  }),
})

export const PresentationSchema = z.object({
  commercialSummary: z.string().trim().min(1),
  dimensionNarratives: z.object({
    monetization: z.string().trim().min(1),
    story: z.string().trim().min(1),
    market: z.string().trim().min(1),
  }),
  charts: z.object({
    emotion: z.object({
      series: z.array(z.object({
        episode: z.number().int().min(1),
        value: z.number().min(0).max(100),
      })).min(1),
      anchors: z.array(z.object({
        slot: z.enum(['Start', 'Mid', 'End']),
        episode: z.number().int().min(1),
        value: z.number().min(0).max(100),
      })).length(3),
      caption: z.string().trim().min(1),
    }),
    conflict: z.object({
      phases: z.array(z.object({
        phase: z.enum(['Start', 'Inc.', 'Rise', 'Climax', 'Fall', 'Res.']),
        ext: z.number().min(0),
        int: z.number().min(0),
      })).length(6),
      caption: z.string().trim().min(1),
    }),
  }),
  episodeRows: z.array(z.object({
    episode: z.number().int().min(1),
    health: z.enum(['GOOD', 'FAIR', 'PEAK']),
    primaryHookType: z.string().trim().min(1).max(48),
    aiHighlight: z.string().trim().min(1).max(240),
  })).min(1),
  diagnosis: z.object({
    matrix: z.array(z.object({
      episode: z.number().int().min(1),
      state: z.enum(['optimal', 'issue', 'neutral']),
    })).min(1),
    details: z.array(z.object({
      episode: z.number().int().min(1),
      issueCategory: z.enum(['structure', 'pacing', 'mixed']),
      issueLabel: z.string().trim().min(1).max(72),
      issueReason: z.string().trim().min(1).max(240),
      suggestion: z.string().trim().min(1).max(240),
      hookType: z.string().trim().min(1).max(48),
      emotionLevel: z.enum(['Low', 'Medium', 'High']),
      conflictDensity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      pacingScore: z.number().min(0).max(10),
      signalPercent: z.number().min(0).max(100),
    })),
    overview: z.object({
      integritySummary: z.string().trim().min(1),
      pacingFocusEpisode: z.number().int().min(1),
      pacingIssueLabel: z.string().trim().min(1).max(72),
      pacingIssueReason: z.string().trim().min(1).max(220),
    }),
  }),
})

export type EpisodePass = z.infer<typeof EpisodePassSchema>
export type EpisodePassItem = z.infer<typeof EpisodePassItemSchema>
export type GlobalSummary = z.infer<typeof GlobalSummarySchema>
export type Presentation = z.infer<typeof PresentationSchema>
