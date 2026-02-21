/**
 * 从 Vue SFC 的 <script setup> 中提取 AI 元数据
 *
 * 通过正则 + 简单 AST 分析提取：
 * defineProps / defineEmits / defineModel / ref / computed / 函数定义 / defineExpose
 */

import { parse } from '@vue/compiler-sfc'
import type {
  PropMeta,
  EventMeta,
  ModelMeta,
  StateMeta,
  ActionMeta,
} from '@vue-mind/shared'

/** 从源码文本中提取所有 <script setup> 相关的 AI 元数据 */
export function extractScriptMeta(source: string, filename: string) {
  const { descriptor } = parse(source, { filename })

  if (!descriptor.scriptSetup) {
    return { props: [], events: [], models: [], state: [], actions: [], exposedNames: [] }
  }

  const scriptContent = descriptor.scriptSetup.content

  const props = extractProps(scriptContent)
  const events = extractEvents(scriptContent)
  const models = extractModels(scriptContent)
  const state = extractState(scriptContent)
  const actions = extractActions(scriptContent)
  const exposedNames = extractExposed(scriptContent)

  for (const action of actions) {
    if (exposedNames.includes(action.name)) {
      action.exposed = true
    }
  }

  return { props, events, models, state, actions, exposedNames }
}

/** 提取 defineProps — 支持泛型语法和对象语法 */
function extractProps(source: string): PropMeta[] {
  // 泛型语法: defineProps<{ src: string; autoplay?: boolean }>()
  const genericMatch = source.match(/defineProps\s*<\s*\{([^}]+)\}\s*>/s)
  if (genericMatch) {
    const body = genericMatch[1]!
    const props: PropMeta[] = []
    const fieldRe = /(\w+)(\??)\s*:\s*([^;\n,]+)/g
    let m: RegExpExecArray | null
    while ((m = fieldRe.exec(body)) !== null) {
      props.push({
        name: m[1]!,
        type: m[3]!.trim(),
        required: m[2] !== '?',
      })
    }
    return props
  }

  // 对象语法: defineProps({ src: { type: String, required: true } })
  const objMatch = source.match(/defineProps\s*\(\s*\{([\s\S]*?)\}\s*\)/)
  if (objMatch) {
    const body = objMatch[1]!
    const props: PropMeta[] = []
    const fieldRe = /(\w+)\s*:\s*\{([^}]+)\}/g
    let m: RegExpExecArray | null
    while ((m = fieldRe.exec(body)) !== null) {
      const name = m[1]!
      const def = m[2]!
      const typeMatch = def.match(/type\s*:\s*(\w+)/)
      const requiredMatch = def.match(/required\s*:\s*(true|false)/)
      props.push({
        name,
        type: typeMatch ? typeMatch[1]!.toLowerCase() : 'unknown',
        required: requiredMatch ? requiredMatch[1] === 'true' : false,
      })
    }
    return props
  }

  return []
}

/** 提取 defineEmits — 支持泛型语法和数组语法 */
function extractEvents(source: string): EventMeta[] {
  // 泛型语法: defineEmits<{ play: []; pause: [] }>()
  const genericMatch = source.match(/defineEmits\s*<\s*\{([^}]+)\}\s*>/s)
  if (genericMatch) {
    const body = genericMatch[1]!
    const events: EventMeta[] = []
    const fieldRe = /(\w+)\s*:/g
    let m: RegExpExecArray | null
    while ((m = fieldRe.exec(body)) !== null) {
      events.push({ name: m[1]! })
    }
    return events
  }

  // 数组语法: defineEmits(['play', 'pause'])
  const arrMatch = source.match(/defineEmits\s*\(\s*\[([^\]]+)\]\s*\)/)
  if (arrMatch) {
    return arrMatch[1]!
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(Boolean)
      .map(name => ({ name }))
  }

  return []
}

/** 提取 defineModel */
function extractModels(source: string): ModelMeta[] {
  const models: ModelMeta[] = []
  const re = /defineModel\s*(?:<\s*(\w+)\s*>)?\s*\(\s*(?:'(\w+)'\s*,?\s*)?(?:\{[^}]*default\s*:\s*([^,}]+)[^}]*\})?\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    models.push({
      name: m[2] || 'modelValue',
      type: m[1] || 'unknown',
      default: m[3]?.trim(),
    })
  }
  return models
}

/** 提取 ref() / reactive() / computed() 声明 */
function extractState(source: string): StateMeta[] {
  const state: StateMeta[] = []
  let m: RegExpExecArray | null

  // ref<Type>(initialValue)
  const refRe = /(?:const|let)\s+(\w+)\s*=\s*ref\s*(?:<\s*([^>]+)\s*>)?\s*\(([^)]*)\)/g
  while ((m = refRe.exec(source)) !== null) {
    state.push({
      name: m[1]!,
      type: m[2]?.trim() || inferType(m[3]?.trim()),
      initial: parseInitial(m[3]?.trim()),
    })
  }

  // reactive<Type>({...})
  const reactiveRe = /(?:const|let)\s+(\w+)\s*=\s*reactive\s*(?:<\s*([^>]+)\s*>)?\s*\(/g
  while ((m = reactiveRe.exec(source)) !== null) {
    state.push({ name: m[1]!, type: m[2]?.trim() || 'object' })
  }

  // computed<Type>(() => ...)
  const computedRe = /(?:const|let)\s+(\w+)\s*=\s*computed\s*(?:<\s*([^>]+)\s*>)?\s*\(/g
  while ((m = computedRe.exec(source)) !== null) {
    state.push({ name: m[1]!, type: m[2]?.trim() || 'unknown', computed: true })
  }

  return state
}

/** 提取函数定义作为可执行动作 */
function extractActions(source: string): ActionMeta[] {
  const actions: ActionMeta[] = []
  let m: RegExpExecArray | null

  // function name(params) { ... }
  const fnRe = /function\s+(\w+)\s*\(([^)]*)\)/g
  while ((m = fnRe.exec(source)) !== null) {
    actions.push({ name: m[1]!, params: parseParams(m[2]!) })
  }

  // const name = (params) => ...  或 async
  const arrowRe = /(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?::\s*\w+\s*)?=>/g
  while ((m = arrowRe.exec(source)) !== null) {
    const context = source.substring(Math.max(0, m.index - 20), m.index)
    if (['computed', 'watch', 'watchEffect'].some(k => context.includes(k))) continue
    actions.push({ name: m[1]!, params: parseParams(m[2]!) })
  }

  return actions
}

/** 提取 defineExpose 暴露的方法名 */
function extractExposed(source: string): string[] {
  const match = source.match(/defineExpose\s*\(\s*\{([^}]+)\}\s*\)/)
  if (!match) return []
  return match[1]!
    .split(',')
    .map(s => s.trim().split(':')[0]!.trim())
    .filter(Boolean)
}

// ─── 辅助 ─────────────────────────────────────────

function parseParams(raw: string): { name: string; type: string }[] {
  if (!raw.trim()) return []
  return raw.split(',').map(p => {
    const parts = p.trim().split(/\s*:\s*/)
    return { name: parts[0]!.replace(/[?=].*/, '').trim(), type: parts[1]?.trim() || 'unknown' }
  }).filter(p => p.name)
}

function inferType(value?: string): string {
  if (!value) return 'unknown'
  if (value === 'true' || value === 'false') return 'boolean'
  if (/^-?\d+(\.\d+)?$/.test(value)) return 'number'
  if (value.startsWith("'") || value.startsWith('"') || value.startsWith('`')) return 'string'
  if (value.startsWith('[')) return 'array'
  if (value.startsWith('{')) return 'object'
  return 'unknown'
}

function parseInitial(value?: string): unknown {
  if (!value) return undefined
  try { return JSON.parse(value.replace(/'/g, '"')) } catch { return value }
}
