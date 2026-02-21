/**
 * @vue-mind/webmcp — WebMCP 桥接层
 *
 * 将 vue-mind 运行时收集的组件能力自动注册为 W3C WebMCP 工具，
 * 让浏览器内置的 AI Agent 可以通过 navigator.modelContext 发现和调用组件功能。
 *
 * WebMCP (Web Model Context Protocol) 是 W3C 标准（Chrome 146+），
 * 由 Google 和 Microsoft 联合推动。
 *
 * 使用方式：
 *   import { createAIMind } from '@vue-mind/runtime'
 *   import { enableWebMCP } from '@vue-mind/webmcp'
 *
 *   const app = createApp(App)
 *   app.use(createAIMind())
 *   enableWebMCP()  // 自动将组件能力注册为 WebMCP 工具
 */

import type { AIMindContext } from '@vue-mind/runtime'
import type { ComponentAIMeta, ActionMeta } from '@vue-mind/shared'

/** navigator.modelContext 类型声明（Chrome 146+ WebMCP API） */
interface ModelContext {
  registerTool(tool: {
    name: string
    description: string
    inputSchema: Record<string, unknown>
    execute: (params: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
  }): void
  unregisterTool(name: string): void
}

declare global {
  interface Navigator {
    modelContext?: ModelContext
  }
}

/** 已注册的 WebMCP 工具名，用于组件卸载时注销 */
const registeredTools = new Set<string>()

/**
 * 启用 WebMCP 桥接：监听 vue-mind 运行时，自动注册/注销工具
 */
export function enableWebMCP() {
  if (typeof navigator === 'undefined' || !navigator.modelContext) {
    console.warn('[vue-mind/webmcp] navigator.modelContext 不可用（需要 Chrome 146+ 并启用 WebMCP flag）')
    // 即使不可用也注册 polyfill，方便开发调试
    registerPolyfill()
    return
  }

  // 监听 window.__AI_MIND__ 的变化，自动注册工具
  watchAndRegister()
}

/** 将组件的 actions 注册为 WebMCP 工具 */
function registerComponentTools(meta: ComponentAIMeta, context: AIMindContext) {
  const mc = navigator.modelContext
  if (!mc) return

  // 为每个 exposed action 注册一个工具
  for (const action of meta.actions.filter(a => a.exposed)) {
    const toolName = `${meta.name}.${action.name}`
    if (registeredTools.has(toolName)) continue

    mc.registerTool({
      name: toolName,
      description: action.description || `执行 ${meta.name} 组件的 ${action.name} 操作`,
      inputSchema: buildInputSchema(action),
      async execute(params) {
        const components = context.listComponents()
        const target = components.find(c => c.meta.name === meta.name)
        if (!target) {
          return { content: [{ type: 'text', text: `组件 ${meta.name} 未找到` }] }
        }
        try {
          const result = context.executeAction(target.uid, action.name, params)
          return { content: [{ type: 'text', text: JSON.stringify(result ?? 'ok') }] }
        } catch (e) {
          return { content: [{ type: 'text', text: `执行失败: ${e instanceof Error ? e.message : String(e)}` }] }
        }
      },
    })

    registeredTools.add(toolName)
  }

  // 注册一个快照工具，让 AI 可以查看当前页面状态
  if (!registeredTools.has('__snapshot')) {
    mc.registerTool({
      name: 'page.snapshot',
      description: '获取当前页面的完整 AI 快照，包括所有组件的状态、可用操作和路由信息',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        const snap = context.snapshot()
        return { content: [{ type: 'text', text: JSON.stringify(snap) }] }
      },
    })
    registeredTools.add('__snapshot')
  }
}

/** 构建 WebMCP 的 inputSchema */
function buildInputSchema(action: ActionMeta): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const param of action.params || []) {
    properties[param.name] = {
      type: mapType(param.type),
      description: param.description,
    }
    if (param.required !== false) required.push(param.name)
  }

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  }
}

function mapType(tsType: string): string {
  const t = tsType.toLowerCase()
  if (t === 'number' || t === 'int' || t === 'float') return 'number'
  if (t === 'boolean' || t === 'bool') return 'boolean'
  if (t === 'string') return 'string'
  if (t.includes('[]') || t === 'array') return 'array'
  return 'string'
}

/** 监听 __AI_MIND__ 并注册工具 */
function watchAndRegister() {
  const aiMind = (window as unknown as Record<string, unknown>).__AI_MIND__ as AIMindContext | undefined
  if (!aiMind) {
    // 等待运行时初始化
    const timer = setInterval(() => {
      const m = (window as unknown as Record<string, unknown>).__AI_MIND__ as AIMindContext | undefined
      if (m) {
        clearInterval(timer)
        syncTools(m)
      }
    }, 500)
    return
  }
  syncTools(aiMind)
}

function syncTools(context: AIMindContext) {
  // 初始注册
  for (const comp of context.listComponents()) {
    registerComponentTools(comp.meta, context)
  }

  // 定期同步新组件（简单实现，后续可改为事件驱动）
  setInterval(() => {
    for (const comp of context.listComponents()) {
      registerComponentTools(comp.meta, context)
    }
  }, 2000)
}

/** 开发调试用的 polyfill：在 console 中模拟 WebMCP */
function registerPolyfill() {
  if (typeof window === 'undefined') return

  const tools = new Map<string, { name: string; description: string; execute: Function }>()

  ;(window as unknown as Record<string, unknown>).__WEBMCP_POLYFILL__ = {
    tools,
    list: () => Array.from(tools.values()).map(t => ({ name: t.name, description: t.description })),
    call: async (name: string, params: Record<string, unknown> = {}) => {
      const tool = tools.get(name)
      if (!tool) return { error: `工具 ${name} 不存在` }
      return tool.execute(params)
    },
  }

  // 模拟 navigator.modelContext
  if (!navigator.modelContext) {
    Object.defineProperty(navigator, 'modelContext', {
      value: {
        registerTool(tool: { name: string; description: string; execute: Function }) {
          tools.set(tool.name, tool)
        },
        unregisterTool(name: string) {
          tools.delete(name)
        },
      },
      configurable: true,
    })
  }
}
