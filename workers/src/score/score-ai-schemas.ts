import { z } from 'zod'

/**
 * L2 结构化输出 Schema
 * - 约束模型输出边界，减少后续映射层分支
 * - 所有分值上限与冻结规格一致
 */

export const OpeningAssessmentSchema = z.object({
  maleLead: z.object({
    score: z.number().min(0).max(5),
    appearsInEpisode: z.number().nullable(),
    visualTagsFound: z.array(z.string()),
    personaTagsFound: z.array(z.string()),
    reasoning: z.string(),
  }),
  femaleLead: z.object({
    score: z.number().min(0).max(5),
    hasConflict: z.boolean(),
    hasMotivation: z.boolean(),
    conflictEvidence: z.string().nullable(),
    motivationEvidence: z.string().nullable(),
    reasoning: z.string(),
  }),
})

export const Paywall1AssessmentSchema = z.object({
  position: z.object({
    score: z.number().min(0).max(2),
    episode: z.number(),
    validRange: z.string().nullable(),
    reasoning: z.string(),
  }),
  previousEpisode: z.object({
    score: z.number().min(0).max(4),
    hasPlotDensity: z.boolean(),
    hasEmotionalPeak: z.boolean(),
    hasForeshadowing: z.boolean(),
    plotEvidence: z.array(z.string()),
    emotionEvidence: z.array(z.string()),
    foreshadowEvidence: z.array(z.string()),
    reasoning: z.string(),
  }),
  hookStrength: z.object({
    score: z.number().min(0).max(5),
    hookType: z.enum(['decision', 'crisis', 'information', 'emotion', 'none']),
    hookEvidence: z.string().nullable(),
    reasoning: z.string(),
  }),
  nextEpisode: z.object({
    score: z.number().min(0).max(3),
    hasImmediateAnswer: z.boolean(),
    hasNewPlot: z.boolean(),
    hasNewHook: z.boolean(),
    reasoning: z.string(),
  }),
})

export const Paywall2AssessmentSchema = z.object({
  position: z.object({
    score: z.number().min(0).max(2),
    episode: z.number(),
    validRange: z.string().nullable(),
    reasoning: z.string(),
  }),
  previousEpisode: z.object({
    score: z.number().min(0).max(3),
    hasPlotDensity: z.boolean(),
    hasEmotionalPeak: z.boolean(),
    hasForeshadowing: z.boolean(),
    reasoning: z.string(),
  }),
  hookStrength: z.object({
    score: z.number().min(0).max(3),
    hasEscalation: z.boolean(),
    hookType: z.enum(['decision', 'crisis', 'information', 'emotion', 'none']),
    escalationEvidence: z.string().nullable(),
    reasoning: z.string(),
  }),
  nextEpisode: z.object({
    score: z.number().min(0).max(2),
    hasImmediateAnswer: z.boolean(),
    hasNewPlot: z.boolean(),
    hasNewHook: z.boolean(),
    reasoning: z.string(),
  }),
})

export const HooksAssessmentSchema = z.object({
  episodicHooks: z.object({
    ep2: z.object({
      score: z.number().min(0).max(1.75),
      hasSuspense: z.boolean(),
      hasPredictable: z.boolean(),
      evidence: z.string().nullable(),
    }),
    ep4: z.object({
      score: z.number().min(0).max(1.75),
      hasSuspense: z.boolean(),
      hasPredictable: z.boolean(),
      evidence: z.string().nullable(),
    }),
    ep8: z.object({
      score: z.number().min(0).max(1.75),
      hasSuspense: z.boolean(),
      hasPredictable: z.boolean(),
      evidence: z.string().nullable(),
    }),
    ep10: z.object({
      score: z.number().min(0).max(1.75),
      hasSuspense: z.boolean(),
      hasPredictable: z.boolean(),
      evidence: z.string().nullable(),
    }),
    totalScore: z.number().min(0).max(7),
    reasoning: z.string(),
  }),
  density: z.object({
    dramaEvents: z.object({
      score: z.number().min(0).max(2.5),
      count: z.number(),
      events: z.array(z.string()),
      reasoning: z.string(),
    }),
    motivationClarity: z.object({
      score: z.number().min(0).max(2),
      protagonistClear: z.boolean(),
      antagonistClear: z.boolean(),
      protagonistMotivation: z.string().nullable(),
      antagonistMotivation: z.string().nullable(),
      reasoning: z.string(),
    }),
    foreshadowing: z.object({
      score: z.number().min(0).max(2.5),
      avgPerEpisode: z.number(),
      reasoning: z.string(),
    }),
    totalScore: z.number().min(0).max(7),
  }),
  visualHammer: z.object({
    score: z.number().min(0).max(2),
    totalScenes: z.number(),
    first3Scenes: z.number(),
    isBalanced: z.boolean(),
    reasoning: z.string(),
  }),
})

export const StoryAssessmentSchema = z.object({
  coreDriver: z.object({
    score: z.number().min(0).max(10),
    relationshipPercentage: z.number().min(0).max(100),
    reasoning: z.string(),
  }),
  characterRecognition: z.object({
    maleLead: z.object({
      score: z.number().min(0).max(4),
      tagsFound: z.array(z.string()),
      tagTypesCount: z.number(),
      reasoning: z.string(),
    }),
    femaleLead: z.object({
      score: z.number().min(0).max(6),
      tagsFound: z.array(z.string()),
      tagTypesCount: z.number(),
      reasoning: z.string(),
    }),
    totalScore: z.number().min(0).max(10),
  }),
  emotionDensity: z.object({
    score: z.number().min(0).max(6),
    densityPercentage: z.number(),
    reasoning: z.string(),
  }),
  conflictTwist: z.object({
    conflictScore: z.number().min(0.5).max(2.5),
    twistScore: z.number().min(0).max(1.5),
    majorTwistCount: z.number(),
    reasoning: z.string(),
  }),
})

export const MarketAssessmentSchema = z.object({
  benchmark: z.object({
    score: z.number().min(0).max(5),
    mechanisms: z.array(z.object({
      name: z.string(),
      category: z.enum(['identity', 'relationship', 'conflict', 'other']),
      evidence: z.string(),
    })),
    mechanismCount: z.number(),
    reasoning: z.string(),
  }),
  culturalTaboo: z.object({
    reasoning: z.string(),
  }),
  localization: z.object({
    score: z.number().min(0).max(5),
    elementsFound: z.array(z.string()),
    avgPerEpisode: z.number(),
    reasoning: z.string(),
  }),
  audienceMatch: z.object({
    genreAudienceScore: z.number().min(0).max(3),
    audiencePurityScore: z.number().min(0).max(2),
    totalScore: z.number().min(0).max(5),
    inappropriateElements: z.array(z.string()),
    reasoning: z.string(),
  }),
})

export const PotentialAssessmentSchema = z.object({
  repairCost: z.object({
    score: z.number().min(0).max(3),
    estimatedHours: z.enum(['<3h', '3-10h', '1-3d', '>10d']),
    primaryIssueType: z.enum(['language', 'hook', 'structure', 'core']),
    reasoning: z.string(),
  }),
  expectedGain: z.object({
    score: z.number().min(0).max(3),
    currentScore: z.number(),
    recoverablePoints: z.number(),
    projectedScore: z.number(),
    reasoning: z.string(),
  }),
  storyCore: z.object({
    score: z.number().min(0).max(3),
    storyDimensionPercent: z.number(),
    coreDriverScore: z.number(),
    characterScore: z.number(),
    reasoning: z.string(),
  }),
  scarcity: z.object({
    score: z.number().min(0.5).max(0.5),
    reasoning: z.string(),
  }),
})

// ==================== 合并版 Schemas (AI-Centric优化) ====================

// L2_PAYWALL_HOOKS: 合并付费点1+付费点2+单集卡点+看点密度+视觉锤
export const PaywallHooksAssessmentSchema = z.object({
  // 第一付费点 (14分)
  firstPaywall: z.object({
    position: z.object({
      score: z.number().min(0).max(2),
      episode: z.number(),
      validRange: z.string().nullable(),
      reasoning: z.string(),
    }),
    previousEpisode: z.object({
      score: z.number().min(0).max(4),
      hasPlotDensity: z.boolean(),
      hasEmotionalPeak: z.boolean(),
      hasForeshadowing: z.boolean(),
      plotEvidence: z.array(z.string()),
      emotionEvidence: z.array(z.string()),
      foreshadowEvidence: z.array(z.string()),
      reasoning: z.string(),
    }),
    hookStrength: z.object({
      score: z.number().min(0).max(5),
      hookType: z.enum(['decision', 'crisis', 'information', 'emotion', 'none']),
      hookEvidence: z.string().nullable(),
      reasoning: z.string(),
    }),
    nextEpisode: z.object({
      score: z.number().min(0).max(3),
      hasImmediateAnswer: z.boolean(),
      hasNewPlot: z.boolean(),
      hasNewHook: z.boolean(),
      reasoning: z.string(),
    }),
  }),
  // 第二付费点 (10分, 长剧)
  secondPaywall: z.object({
    position: z.object({
      score: z.number().min(0).max(2),
      episode: z.number(),
      validRange: z.string().nullable(),
      reasoning: z.string(),
    }),
    previousEpisode: z.object({
      score: z.number().min(0).max(3),
      hasPlotDensity: z.boolean(),
      hasEmotionalPeak: z.boolean(),
      hasForeshadowing: z.boolean(),
      reasoning: z.string(),
    }),
    hookStrength: z.object({
      score: z.number().min(0).max(3),
      hookType: z.enum(['decision', 'crisis', 'information', 'emotion', 'none']),
      hasEscalation: z.boolean(),
      escalationEvidence: z.string().nullable(),
      reasoning: z.string(),
    }),
    nextEpisode: z.object({
      score: z.number().min(0).max(2),
      hasImmediateAnswer: z.boolean(),
      hasNewPlot: z.boolean(),
      hasNewHook: z.boolean(),
      reasoning: z.string(),
    }),
    isApplicable: z.boolean(), // false for <30 episodes
  }),
  // 单集卡点 (7分)
  episodicHooks: z.object({
    ep2: z.object({ score: z.number().min(0).max(1.75), hasSuspense: z.boolean(), hasPredictable: z.boolean(), evidence: z.string().nullable() }),
    ep4: z.object({ score: z.number().min(0).max(1.75), hasSuspense: z.boolean(), hasPredictable: z.boolean(), evidence: z.string().nullable() }),
    ep8: z.object({ score: z.number().min(0).max(1.75), hasSuspense: z.boolean(), hasPredictable: z.boolean(), evidence: z.string().nullable() }),
    ep10: z.object({ score: z.number().min(0).max(1.75), hasSuspense: z.boolean(), hasPredictable: z.boolean(), evidence: z.string().nullable() }),
    totalScore: z.number().min(0).max(7),
    reasoning: z.string(),
  }),
  // 看点密度 (7分)
  density: z.object({
    dramaEvents: z.object({
      score: z.number().min(0).max(2.5),
      count: z.number(),
      events: z.array(z.string()),
      reasoning: z.string(),
    }),
    motivationClarity: z.object({
      score: z.number().min(0).max(2),
      protagonistClear: z.boolean(),
      antagonistClear: z.boolean(),
      protagonistMotivation: z.string().nullable(),
      antagonistMotivation: z.string().nullable(),
      reasoning: z.string(),
    }),
    foreshadowing: z.object({
      score: z.number().min(0).max(2.5),
      avgPerEpisode: z.number(),
      reasoning: z.string(),
    }),
  }),
  // 视觉锤 (2分)
  visualHammer: z.object({
    score: z.number().min(0).max(2),
    totalScenes: z.number(),
    first3Scenes: z.number(),
    isBalanced: z.boolean(),
    reasoning: z.string(),
  }),
})

// L2_MARKET_POTENTIAL: 合并市场维度+改造潜力
export const MarketPotentialAssessmentSchema = z.object({
  // 市场维度 (20分)
  market: z.object({
    benchmark: z.object({
      score: z.number().min(0).max(5),
      mechanisms: z.array(z.object({
        name: z.string(),
        category: z.enum(['identity', 'relationship', 'conflict', 'other']),
        evidence: z.string(),
      })),
      mechanismCount: z.number(),
      reasoning: z.string(),
    }),
    culturalTaboo: z.object({
      reasoning: z.string(),
    }),
    localization: z.object({
      score: z.number().min(0).max(5),
      elementsFound: z.array(z.string()),
      avgPerEpisode: z.number(),
      reasoning: z.string(),
    }),
    audienceMatch: z.object({
      genreAudienceScore: z.number().min(0).max(3),
      audiencePurityScore: z.number().min(0).max(2),
      totalScore: z.number().min(0).max(5),
      inappropriateElements: z.array(z.string()),
      reasoning: z.string(),
    }),
  }),
  // 改造潜力 (10分)
  potential: z.object({
    repairCost: z.object({
      score: z.number().min(0).max(3),
      estimatedHours: z.enum(['<3h', '3-10h', '1-3d', '>10d']),
      primaryIssueType: z.enum(['language', 'hook', 'structure', 'core']),
      reasoning: z.string(),
    }),
    expectedGain: z.object({
      score: z.number().min(0).max(3),
      currentScore: z.number(),
      recoverablePoints: z.number(),
      projectedScore: z.number(),
      reasoning: z.string(),
    }),
    storyCore: z.object({
      score: z.number().min(0).max(3),
      storyDimensionPercent: z.number(),
      coreDriverScore: z.number(),
      characterScore: z.number(),
      reasoning: z.string(),
    }),
    scarcity: z.object({
      score: z.number().min(0.5).max(0.5),
      reasoning: z.string(),
    }),
  }),
})

// 类型导出
export type OpeningAssessment = z.infer<typeof OpeningAssessmentSchema>
export type Paywall1Assessment = z.infer<typeof Paywall1AssessmentSchema>
export type Paywall2Assessment = z.infer<typeof Paywall2AssessmentSchema>
export type HooksAssessment = z.infer<typeof HooksAssessmentSchema>
export type StoryAssessment = z.infer<typeof StoryAssessmentSchema>
export type MarketAssessment = z.infer<typeof MarketAssessmentSchema>
export type PotentialAssessment = z.infer<typeof PotentialAssessmentSchema>

// 合并版类型导出
export type PaywallHooksAssessment = z.infer<typeof PaywallHooksAssessmentSchema>
export type MarketPotentialAssessment = z.infer<typeof MarketPotentialAssessmentSchema>
