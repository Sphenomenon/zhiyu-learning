export type Course = {
  id: string
  index: string
  label: string
  title: string
  subtitle: string
  description: string
  lessons: number
  duration: string
  color: string
  level: string
}

export const courses: Course[] = [
  {
    id: 'method',
    index: '01',
    label: '方法基础',
    title: '知识结构化入门',
    subtitle: '从散落经验到清晰系统',
    description: '建立一套可复用的整理方法，把脑中的经验变成能被理解、传播与实践的知识结构。',
    lessons: 18,
    duration: '4.5 小时',
    color: 'acid',
    level: '入门',
  },
  {
    id: 'practice',
    index: '02',
    label: '专题进阶',
    title: '高密度表达训练',
    subtitle: '让观点准确抵达',
    description: '从选题、论证到视觉呈现，完成一套兼顾专业度与阅读体验的内容表达流程。',
    lessons: 24,
    duration: '6 小时',
    color: 'coral',
    level: '进阶',
  },
  {
    id: 'studio',
    index: '03',
    label: '长期计划',
    title: '个人知识产品工作室',
    subtitle: '把创作变成长期资产',
    description: '设计你的内容系统、产品阶梯与运营节奏，逐步建立可持续的个人知识业务。',
    lessons: 32,
    duration: '8 周',
    color: 'violet',
    level: '系统课',
  },
]

export const chapters = [
  { title: '看见：找到真正值得分享的经验', meta: '3 节 · 36 分钟', done: true },
  { title: '拆解：建立知识的最小单元', meta: '4 节 · 52 分钟', done: true },
  { title: '连接：从观点到完整结构', meta: '5 节 · 68 分钟', done: false },
  { title: '输出：让复杂内容清晰抵达', meta: '6 节 · 74 分钟', done: false },
]
