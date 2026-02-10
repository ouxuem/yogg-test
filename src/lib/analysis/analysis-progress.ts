type AnalysisPhase
  = | 'validate_index'
    | 'structure_story'
    | 'map_characters'
    | 'evaluate_momentum'
    | 'assemble_report'

export interface AnalysisProgress {
  phase: AnalysisPhase
  percent: number // 0..100
  activity?: string
  batch?: { current: number, total: number }
}
