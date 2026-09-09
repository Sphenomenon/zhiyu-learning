import type { SiteContent, Story, Course, Language } from '../shared/types'

export const defaultContent: SiteContent = {
  heroTitle: '好方法，',
  heroAccent: '值得被认真讲清楚。',
  heroDescription: '我们把经过实践检验的知识整理成结构清晰的课程，帮助你理解关键方法，并把它用于真实工作。',
  instructorName: '林岚',
  instructorBio: '林岚长期研究知识组织、专业表达与个人业务。八年来，她把一线项目经验整理成可学习、可复用的方法，已为超过 1,200 位学习者提供课程与实践指导。',
  heroTitleEn: 'Good methods deserve',
  heroAccentEn: 'a clear explanation.',
  heroDescriptionEn: 'We turn field-tested knowledge into structured courses, so you can understand the method and apply it to real work.',
  instructorNameEn: 'Lan Lin',
  instructorBioEn: 'Lan Lin studies knowledge systems, professional communication, and independent business. Over eight years, she has turned practical experience into teachable methods for more than 1,200 learners.',
}

export const defaultStories: Story[] = [
  { id: 1, name: '陈亦川', role: '产品设计师 · 上海', result: '建立了一套稳定的内容生产流程', quote: '以前我总在收藏资料，却很少真正使用。现在我能判断什么值得留下，也知道怎样把它写成完整内容。', published: true },
  { id: 2, name: '孟文', role: '独立创作者 · 杭州', result: '连续 12 周完成公开输出', quote: '课程把每一步为什么这样做讲得很清楚。我不再靠灵感推进，工作节奏稳定了很多。', published: true },
  { id: 3, name: '林曦', role: '内容策划 · 成都', result: '完成了第一套线上专题内容', quote: '从选题到交付都有清楚的判断标准。我第一次把零散经验做成了一套完整作品。', published: true },
  { id: 4, name: '周然', role: '咨询顾问 · 深圳', result: '把服务经验整理成标准流程', quote: '有了可以复用的流程之后，交付质量更稳定，和客户沟通也更直接。', published: true },
]

export const courseImages = [
  '/images/course-structure.jpg',
  '/images/course-expression.jpg',
  '/images/course-studio.jpg',
]

export const tx = (language: Language, zh: string, en: string) => language === 'zh' ? zh : en

export const englishCourses: Record<string, Pick<Course, 'label' | 'title' | 'subtitle' | 'description' | 'duration' | 'level'>> = {
  method: { label: 'Foundations', title: 'Structuring Knowledge', subtitle: 'Turn experience into a usable system', description: 'Learn a repeatable way to organize practical experience into knowledge that others can understand and use.', duration: '4.5 hours', level: 'Foundation' },
  practice: { label: 'Focused Practice', title: 'Clear, High-Value Communication', subtitle: 'Make every idea easier to understand', description: 'Build a practical workflow for choosing a subject, developing an argument, and presenting professional content with clarity.', duration: '6 hours', level: 'Intermediate' },
  studio: { label: 'Long-term Program', title: 'The Knowledge Business Studio', subtitle: 'Build a durable body of work', description: 'Design your content system, product path, and publishing rhythm to develop a sustainable independent knowledge business.', duration: '8 weeks', level: 'Complete program' },
}

export const englishStories: Record<string, Pick<Story, 'name' | 'role' | 'result' | 'quote'>> = {
  1: { name: 'Yichuan Chen', role: 'Product Designer · Shanghai', result: 'Built a reliable content production system', quote: 'I used to collect information without putting it to work. Now I can decide what matters and turn it into complete, useful content.' },
  2: { name: 'Wen Meng', role: 'Independent Creator · Hangzhou', result: 'Published consistently for 12 weeks', quote: 'The course explains the reasoning behind each step. I no longer depend on inspiration, and my work has become much more consistent.' },
  3: { name: 'Xi Lin', role: 'Content Strategist · Chengdu', result: 'Completed a first online learning series', quote: 'I now have clear criteria from topic selection through delivery. For the first time, I turned scattered experience into a complete body of work.' },
  4: { name: 'Ran Zhou', role: 'Consultant · Shenzhen', result: 'Turned service experience into a repeatable process', quote: 'A repeatable process made the quality of my delivery more consistent and client conversations more direct.' },
}
