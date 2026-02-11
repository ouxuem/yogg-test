const SCORE_GRADE_VALUES = ['S+', 'S', 'A+', 'A', 'B', 'C'] as const
const EPISODE_HEALTH_VALUES = ['GOOD', 'FAIR', 'PEAK'] as const
const EPISODE_STATE_VALUES = ['optimal', 'issue', 'neutral'] as const
const ISSUE_CATEGORY_VALUES = ['structure', 'pacing', 'mixed'] as const
const EMOTION_LEVEL_VALUES = ['Low', 'Medium', 'High'] as const
const CONFLICT_DENSITY_VALUES = ['LOW', 'MEDIUM', 'HIGH'] as const
const EMOTION_SLOT_VALUES = ['Start', 'Mid', 'End'] as const
const CONFLICT_PHASE_VALUES = ['Start', 'Inc.', 'Rise', 'Climax', 'Fall', 'Res.'] as const

const ANALYSIS_SCORE_RESULT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'presentation'],
  properties: {
    score: {
      type: 'object',
      additionalProperties: false,
      required: ['total_110', 'overall_100', 'grade', 'breakdown_110'],
      properties: {
        total_110: { type: 'number', minimum: 0, maximum: 110 },
        overall_100: { type: 'number', minimum: 0, maximum: 100 },
        grade: {
          type: 'string',
          enum: [...SCORE_GRADE_VALUES],
        },
        breakdown_110: {
          type: 'object',
          additionalProperties: false,
          required: ['pay', 'story', 'market', 'potential'],
          properties: {
            pay: { type: 'number', minimum: 0, maximum: 50 },
            story: { type: 'number', minimum: 0, maximum: 30 },
            market: { type: 'number', minimum: 0, maximum: 20 },
            potential: { type: 'number', minimum: 0, maximum: 10 },
          },
        },
      },
    },
    presentation: {
      type: 'object',
      additionalProperties: false,
      required: ['totalEpisodes', 'commercialSummary', 'dimensionNarratives', 'charts', 'episodeRows', 'diagnosis'],
      properties: {
        totalEpisodes: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          description: 'Total episode count inferred from chapter or episode structure, never from PDF page count.',
        },
        commercialSummary: { type: 'string', minLength: 1, maxLength: 280 },
        dimensionNarratives: {
          type: 'object',
          additionalProperties: false,
          required: ['monetization', 'story', 'market'],
          properties: {
            monetization: { type: 'string', minLength: 1, maxLength: 220 },
            story: { type: 'string', minLength: 1, maxLength: 220 },
            market: { type: 'string', minLength: 1, maxLength: 220 },
          },
        },
        charts: {
          type: 'object',
          additionalProperties: false,
          required: ['emotion', 'conflict'],
          properties: {
            emotion: {
              type: 'object',
              additionalProperties: false,
              required: ['series', 'anchors', 'caption'],
              properties: {
                series: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 6,
                  description: 'Sparse emotion trend points. Let K = min(6, totalEpisodes). Must be unique, ascending by episode, and within 1..N.',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['episode', 'value'],
                    properties: {
                      episode: {
                        type: 'number',
                        minimum: 1,
                        description: 'Episode index in 1..N. When N >= 2, series must include episode 1 and episode N.',
                      },
                      value: { type: 'number', minimum: 0, maximum: 100 },
                    },
                  },
                },
                anchors: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 3,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['slot', 'episode', 'value'],
                    properties: {
                      slot: { type: 'string', enum: [...EMOTION_SLOT_VALUES] },
                      episode: {
                        type: 'number',
                        minimum: 1,
                        description: 'Episode index in 1..N and should reference an episode present in emotion.series.',
                      },
                      value: { type: 'number', minimum: 0, maximum: 100 },
                    },
                  },
                },
                caption: { type: 'string', minLength: 1, maxLength: 200 },
              },
            },
            conflict: {
              type: 'object',
              additionalProperties: false,
              required: ['phases', 'caption'],
              properties: {
                phases: {
                  type: 'array',
                  minItems: 6,
                  maxItems: 6,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['phase', 'ext', 'int'],
                    properties: {
                      phase: { type: 'string', enum: [...CONFLICT_PHASE_VALUES] },
                      ext: { type: 'number', minimum: 0 },
                      int: { type: 'number', minimum: 0 },
                    },
                  },
                },
                caption: { type: 'string', minLength: 1, maxLength: 200 },
              },
            },
          },
        },
        episodeRows: {
          type: 'array',
          description: 'Per-episode breakdown. Must continuously cover episodes 1..N with no gaps or duplicates.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['episode', 'health', 'primaryHookType', 'aiHighlight'],
            properties: {
              episode: { type: 'number', minimum: 1, description: 'Episode index in 1..N.' },
              health: {
                type: 'string',
                enum: [...EPISODE_HEALTH_VALUES],
                description: 'Audience engagement heat for this episode, not structural quality. Values: GOOD, FAIR, PEAK.',
              },
              primaryHookType: { type: 'string', minLength: 1, maxLength: 48 },
              aiHighlight: { type: 'string', minLength: 8, maxLength: 240 },
            },
          },
        },
        diagnosis: {
          type: 'object',
          additionalProperties: false,
          required: ['matrix', 'details', 'overview'],
          properties: {
            matrix: {
              type: 'array',
              description: 'Per-episode diagnosis state. Must continuously cover episodes 1..N with no gaps or duplicates.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['episode', 'state'],
                properties: {
                  episode: { type: 'number', minimum: 1, description: 'Episode index in 1..N.' },
                  state: {
                    type: 'string',
                    enum: [...EPISODE_STATE_VALUES],
                    description: 'Structural/pacing health state for this episode, independent from episodeRows.health. Values: optimal, issue, neutral.',
                  },
                },
              },
            },
            details: {
              type: 'array',
              description: 'Actionable diagnosis details for issue or neutral episodes. Must be semantically consistent with the same episode\'s episodeRows.primaryHookType and episodeRows.aiHighlight.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'episode',
                  'issueCategory',
                  'issueLabel',
                  'issueReason',
                  'suggestion',
                  'emotionLevel',
                  'conflictDensity',
                  'pacingScore',
                  'signalPercent',
                ],
                properties: {
                  episode: { type: 'number', minimum: 1, description: 'Episode index in 1..N.' },
                  issueCategory: { type: 'string', enum: [...ISSUE_CATEGORY_VALUES] },
                  issueLabel: { type: 'string', minLength: 1, maxLength: 72 },
                  issueReason: { type: 'string', minLength: 1, maxLength: 240 },
                  suggestion: { type: 'string', minLength: 1, maxLength: 240 },
                  emotionLevel: { type: 'string', enum: [...EMOTION_LEVEL_VALUES] },
                  conflictDensity: { type: 'string', enum: [...CONFLICT_DENSITY_VALUES] },
                  pacingScore: { type: 'number', minimum: 0, maximum: 10 },
                  signalPercent: { type: 'number', minimum: 0, maximum: 100 },
                },
              },
            },
            overview: {
              type: 'object',
              additionalProperties: false,
              required: ['integritySummary', 'pacingFocusEpisode', 'pacingIssueLabel', 'pacingIssueReason'],
              properties: {
                integritySummary: { type: 'string', minLength: 1, maxLength: 260 },
                pacingFocusEpisode: {
                  type: 'number',
                  minimum: 1,
                  description: 'Episode index in 1..N for the main pacing focus.',
                },
                pacingIssueLabel: { type: 'string', minLength: 1, maxLength: 72 },
                pacingIssueReason: { type: 'string', minLength: 1, maxLength: 220 },
              },
            },
          },
        },
      },
    },
  },
} as const

function toGeminiCompatibleResponseSchema(
  schema: typeof ANALYSIS_SCORE_RESULT_RESPONSE_SCHEMA,
) {
  function stripUnsupportedKeywords(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map(stripUnsupportedKeywords)

    if (value != null && typeof value === 'object') {
      const source = value as Record<string, unknown>
      const result: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(source)) {
        if (key === 'additionalProperties')
          continue
        result[key] = stripUnsupportedKeywords(item)
      }
      return result
    }

    return value
  }

  const sanitized = stripUnsupportedKeywords(schema)
  return sanitized as typeof ANALYSIS_SCORE_RESULT_RESPONSE_SCHEMA
}

export const GEMINI_RESPONSE_SCHEMA = toGeminiCompatibleResponseSchema(
  ANALYSIS_SCORE_RESULT_RESPONSE_SCHEMA,
)
