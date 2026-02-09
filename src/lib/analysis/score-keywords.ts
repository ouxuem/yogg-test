import type { AnalysisLanguage } from '@/lib/analysis/detect-language'

/**
 * 关键词库
 * - 来源：实现文档第五节关键词定义
 * - 设计：按“功能域”分组，避免后续在评分函数里散落硬编码字符串
 */

interface BiLingual { en: string[], zh: string[] }
type MechanismMap = Record<string, BiLingual>

export interface ScoringKeywords {
  opening: {
    maleVisual: BiLingual
    malePersona: BiLingual
    femaleConflict: BiLingual
    femaleMotivation: BiLingual
    femalePresence: BiLingual
  }
  paywall: {
    plotDensity: BiLingual
    emotionalPeak: BiLingual
    foreshadow: BiLingual
    hookDecision: BiLingual
    hookCrisis: BiLingual
    hookInformation: BiLingual
    hookEmotion: BiLingual
    nextAnswer: BiLingual
    nextNewPlot: BiLingual
    nextNewHook: BiLingual
    escalation: BiLingual
  }
  episodicHooks: {
    suspense: BiLingual
    predictable: BiLingual
  }
  density: {
    dramaEvents: BiLingual
    motivation: BiLingual
    antagonistMarkers: BiLingual
    visualHammer: BiLingual
  }
  story: {
    relationship: BiLingual
    subplot: BiLingual
    maleTagGroups: Record<string, BiLingual>
    femaleTagGroups: Record<string, BiLingual>
    emotion: BiLingual
    conflict: BiLingual
    twist: BiLingual
    twistIdentity: BiLingual
  }
  market: {
    mechanismIdentity: MechanismMap
    mechanismRelationship: MechanismMap
    mechanismConflict: MechanismMap
    vulgar: BiLingual
    redline: BiLingual
    localization: BiLingual
    audienceMismatch: {
      revenge: BiLingual
      youngAdult: BiLingual
      ceoRomance: BiLingual
      familyDrama: BiLingual
    }
    genreMarkers: {
      revenge: BiLingual
      youngAdult: BiLingual
      ceoRomance: BiLingual
      familyDrama: BiLingual
    }
  }
}

export const SCORING_KEYWORDS: ScoringKeywords = {
  opening: {
    maleVisual: {
      en: ['CEO', 'president', 'suit', 'abs', 'chest', 'handsome', 'muscular', 'tall', 'strong'],
      zh: ['总裁', '西装', '腹肌', '胸肌', '帅', '高大', '性感', '英俊', '肌肉'],
    },
    malePersona: {
      en: ['mature', 'composed', 'devoted', 'cold', 'gentle', 'dominate', 'protect', 'spoil'],
      zh: ['成熟', '沉稳', '深情', '冷酷', '温柔', '霸道', '保护', '宠溺', '占有欲'],
    },
    femaleConflict: {
      en: ['betray', 'trap', 'drug', 'scheme', 'plot', 'deceive', 'danger', 'ambush'],
      zh: ['背叛', '设计', '陷害', '下药', '欺骗', '危险', '埋伏'],
    },
    femaleMotivation: {
      en: ['because', 'for', 'want', 'need', 'plan', 'goal', 'must', 'in order to'],
      zh: ['因为', '为了', '想要', '需要', '计划', '目标', '必须'],
    },
    femalePresence: {
      en: ['she', 'her', 'woman', 'girl', 'lady', 'heroine'],
      zh: ['她', '女主', '女人', '女孩', '小姐'],
    },
  },
  paywall: {
    plotDensity: {
      en: ['discover', 'reveal', 'expose', 'decide', 'confront', 'change', 'breakthrough'],
      zh: ['发现', '揭露', '揭穿', '决定', '对峙', '改变', '突破'],
    },
    emotionalPeak: {
      en: ['cry', 'scream', 'shocked', 'furious', 'breakdown', 'collapse', 'desperate'],
      zh: ['哭', '尖叫', '震惊', '愤怒', '崩溃', '绝望'],
    },
    foreshadow: {
      en: ['soon', 'tomorrow', 'will', 'plan', 'wonder', 'V.O.', 'thinking'],
      zh: ['即将', '明天', '将要', '计划', '好奇', '内心', '想到'],
    },
    hookDecision: {
      en: ['choose', 'decide', 'must', 'either', 'or'],
      zh: ['选择', '决定', '必须', '要么', '还是'],
    },
    hookCrisis: {
      en: ['danger', 'life or death', 'attack', 'threaten', 'knife', 'gun'],
      zh: ['危险', '生死', '攻击', '威胁', '刀', '枪'],
    },
    hookInformation: {
      en: ['who', 'what', 'secret', 'truth', 'identity', 'really'],
      zh: ['是谁', '真相', '秘密', '身份', '到底'],
    },
    hookEmotion: {
      en: ['will he', 'can she', 'would', 'could'],
      zh: ['会不会', '能否', '是否', '会吗'],
    },
    nextAnswer: {
      en: ['reveal', 'announce', 'finally', 'truth is'],
      zh: ['揭露', '公开', '终于', '真相是', '原来'],
    },
    nextNewPlot: {
      en: ['shocked', 'unexpected', 'suddenly', 'then'],
      zh: ['震惊', '没想到', '突然', '接着'],
    },
    nextNewHook: {
      en: ['but', 'however', 'what if', 'now'],
      zh: ['但是', '然而', '如果', '现在', '不过'],
    },
    escalation: {
      en: ['life', 'everything', 'forever', 'lose all', 'no turning back', 'final', 'ultimate'],
      zh: ['生命', '一切', '永远', '失去所有', '没有退路', '最后', '终极'],
    },
  },
  episodicHooks: {
    suspense: {
      en: ['what', 'who', 'why', 'shocked', 'stunned', 'freeze'],
      zh: ['什么', '谁', '为什么', '震惊', '呆住', '怎么'],
    },
    predictable: {
      en: ['will', 'soon', 'next', 'tomorrow', 'plan to'],
      zh: ['将要', '即将', '明天', '下次', '打算'],
    },
  },
  density: {
    dramaEvents: {
      en: ['kill', 'death', 'die', 'betray', 'drug', 'poison', 'attack', 'kidnap', 'accident', 'miscarry', 'expose'],
      zh: ['杀', '死', '生死', '背叛', '下药', '中毒', '袭击', '绑架', '事故', '车祸', '流产', '揭露', '曝光'],
    },
    motivation: {
      en: ['because', 'for', 'want', 'need', 'goal', 'plan', 'must', 'revenge', 'protect', 'love'],
      zh: ['因为', '为了', '想要', '需要', '目标', '计划', '必须', '复仇', '保护', '爱'],
    },
    antagonistMarkers: {
      en: ['villain', 'enemy', 'opponent', 'rival', 'antagonist'],
      zh: ['反派', '敌人', '对手', '宿敌'],
    },
    visualHammer: {
      en: ['slap', 'hit face', 'kiss', 'passionate', 'punch', 'kick', 'fight', 'pour water', 'splash', 'kneel', 'kowtow', 'propose', 'marry me', 'reveal identity', 'expose', 'luxury car', 'convoy', 'bodyguard'],
      zh: ['巴掌', '打脸', '扇', '吻', '激吻', '亲', '打', '踢', '揍', '泼水', '泼酒', '泼', '下跪', '跪下', '跪地', '求婚', '嫁给我', '揭露身份', '曝光', '豪车', '车队', '保镖'],
    },
  },
  story: {
    relationship: {
      en: ['love', 'hate', 'marry', 'divorce', 'kiss', 'betray', 'miss', 'jealous'],
      zh: ['爱', '恨', '结婚', '离婚', '吻', '背叛', '想念', '嫉妒'],
    },
    subplot: {
      en: ['company', 'business', 'deal', 'investment', 'project', 'meeting', 'contract', 'work'],
      zh: ['公司', '生意', '投资', '项目', '会议', '合同', '工作'],
    },
    maleTagGroups: {
      job: { en: ['CEO', 'president', 'doctor', 'general'], zh: ['总裁', '医生', '将军', '教授'] },
      look: { en: ['handsome', 'abs', 'tall', 'strong'], zh: ['帅', '腹肌', '高大', '肌肉'] },
      personality: { en: ['cold', 'gentle', 'mature', 'devoted'], zh: ['冷酷', '温柔', '成熟', '专情'] },
      behavior: { en: ['protect', 'dominate', 'spoil'], zh: ['保护', '霸道', '宠溺', '占有'] },
      dialogue: { en: ['my woman', 'stay with me'], zh: ['我的女人', '跟我走', '听我的'] },
    },
    femaleTagGroups: {
      identity: { en: ['CEO', 'heiress', 'daughter of'], zh: ['总裁', '千金', '女儿'] },
      look: { en: ['beautiful', 'innocent', 'elegant'], zh: ['美丽', '清纯', '优雅'] },
      personality: { en: ['strong', 'smart', 'decisive'], zh: ['坚强', '聪明', '果断', '独立'] },
      growth: { en: ['revenge', 'rise', 'transform'], zh: ['复仇', '崛起', '蜕变'] },
      action: { en: ['fight back', 'take action', 'stand up'], zh: ['反击', '行动', '站起来', '不再忍受'] },
    },
    emotion: {
      en: ['cry', 'tears', 'sob', 'weep', 'scream', 'shout', 'roar', 'furious', 'shocked', 'stunned', 'freeze', 'gasp', 'tremble', 'shiver', 'panic', 'terrified', 'heartbreak', 'pain', 'ache', 'suffer'],
      zh: ['哭', '泪', '抽泣', '尖叫', '怒吼', '愤怒', '震惊', '呆住', '倒吸', '颤抖', '恐慌', '害怕', '心碎', '痛苦', '折磨'],
    },
    conflict: {
      en: ['slap', 'punch', 'grab', 'push', 'kick', 'argue', 'fight', 'quarrel', 'confront', 'furious', 'snarl', 'glare', 'threaten'],
      zh: ['打', '抓', '推', '踢', '扇', '争吵', '吵架', '对峙', '争执', '怒视', '咆哮', '瞪', '威胁'],
    },
    twist: {
      en: ['actually', 'truth is', 'in fact', 'realize', 'turn out', 'reveal', 'expose', 'discover'],
      zh: ['原来', '其实', '竟然', '真相', '没想到', '揭露', '发现', '揭穿'],
    },
    twistIdentity: {
      en: ['identity', 'truth', 'secret'],
      zh: ['身份', '真相', '秘密'],
    },
  },
  market: {
    mechanismIdentity: {
      hiddenIdentity: { en: ['hidden identity', 'secret', 'pretend'], zh: ['隐藏身份', '伪装'] },
      identityReversal: { en: ['daughter of', 'heiress', 'CEO', 'actually'], zh: ['其实是', '真实身份'] },
      dualIdentity: { en: ['both...and', 'secret life'], zh: ['白天...晚上', '双重'] },
      reborn: { en: ['reborn', 'time travel', 'previous life'], zh: ['重生', '穿越'] },
    },
    mechanismRelationship: {
      contract: { en: ['contract', 'fake', 'pretend', 'deal'], zh: ['契约', '协议', '假装'] },
      substitute: { en: ['substitute', 'replacement'], zh: ['替身', '替嫁'] },
      flashMarriage: { en: ['flash marriage', 'marry stranger'], zh: ['闪婚', '陌生人结婚'] },
    },
    mechanismConflict: {
      revenge: { en: ['revenge', 'betray', 'payback'], zh: ['复仇', '报复', '背叛'] },
      angst: { en: ['misunderstand', 'sacrifice', 'pain'], zh: ['误会', '牺牲', '虐'] },
      faceSlap: { en: ['slap face', 'expose', 'prove wrong'], zh: ['打脸', '揭穿'] },
      riseUp: { en: ['rise', 'transform', 'from zero to hero'], zh: ['逆袭', '崛起'] },
    },
    vulgar: {
      en: ['damn', 'hell', 'shit', 'fuck', 'bitch', 'bastard', 'ass', 'asshole', 'dick', 'cock', 'pussy'],
      zh: ['他妈的', '操', '贱人', '混蛋', '王八蛋', '婊子', '傻逼', '草'],
    },
    redline: {
      en: ['rape', 'incest', 'pedophile', 'child abuse'],
      zh: ['强奸', '乱伦', '恋童', '虐童'],
    },
    localization: {
      en: ['Thanksgiving', 'Christmas', 'Halloween', 'Super Bowl', 'Prom', 'college', 'graduation', 'sorority', 'fraternity', 'road trip', 'barbecue', 'mall'],
      zh: ['感恩节', '圣诞', '万圣节', '大学', '毕业', '兄弟会', '姐妹会', '公路旅行', '烧烤', '购物中心'],
    },
    audienceMismatch: {
      revenge: { en: ['sorority', 'graduation', 'dorm'], zh: ['姐妹会', '毕业舞会', '宿舍'] },
      youngAdult: { en: ['mortgage', 'mother-in-law'], zh: ['房贷', '婆婆', '二胎'] },
      ceoRomance: { en: ['campus', 'school club'], zh: ['校园', '学生社团'] },
      familyDrama: { en: ['campus', 'first love'], zh: ['校园', '初恋'] },
    },
    genreMarkers: {
      revenge: { en: ['revenge', 'betray', 'payback'], zh: ['复仇', '报复', '背叛'] },
      youngAdult: { en: ['campus', 'youth', 'graduation', 'dorm'], zh: ['校园', '青春', '毕业', '宿舍'] },
      ceoRomance: { en: ['CEO', 'president', 'contract marriage', 'billionaire'], zh: ['总裁', '契约', '豪门', '闪婚'] },
      familyDrama: { en: ['mother-in-law', 'family', 'marriage', 'home'], zh: ['婆婆', '家庭', '婚姻', '家里'] },
    },
  },
}

export type GenreKey = keyof ScoringKeywords['market']['audienceMismatch']

export function pickKeywords(dict: BiLingual, language: AnalysisLanguage) {
  return language === 'zh' ? dict.zh : dict.en
}
