/**
 * AI Mind 上下文管理器
 *
 * 核心运行时：追踪组件树、收集元数据、生成页面快照。
 * 通过 Vue 的 app.mixin 钩入组件生命周期，自动收集所有已挂载组件的 AI 元数据。
 */

import { reactive, toRaw } from 'vue'
import type { App, ComponentInternalInstance } from 'vue'
import type {
  ComponentAIMeta,
  ComponentAIContext,
  PageAISnapshot,
  NavigationMeta,
} from '@vue-mind/shared'

interface TrackedComponent {
  instance: ComponentInternalInstance
  meta: ComponentAIMeta
}

/**
 * AI Mind 上下文实例
 * 管理所有已注册组件的元数据，提供快照和动作执行能力
 */
export function createAIMindContext() {
  const tracked = reactive(new Map<number, TrackedComponent>())
  let routerInstance: { currentRoute: { value: { path: string; name?: string; params?: Record<string, string>; query?: Record<string, string> } } } | null = null

  /** 注册组件实例 */
  function register(instance: ComponentInternalInstance, meta: ComponentAIMeta) {
    tracked.set(instance.uid, { instance, meta })
  }

  /** 注销组件实例 */
  function unregister(uid: number) {
    tracked.delete(uid)
  }

  /** 获取当前页面的完整 AI 快照 */
  function snapshot(): PageAISnapshot {
    const components = buildComponentTree()
    const navigations = collectNavigations()
    const route = routerInstance?.currentRoute.value

    return {
      route: route ? {
        path: route.path,
        name: route.name ? String(route.name) : undefined,
        params: route.params ? Object.fromEntries(Object.entries(route.params).map(([k, v]) => [k, String(v)])) : undefined,
        query: route.query ? Object.fromEntries(Object.entries(route.query).map(([k, v]) => [k, String(v)])) : undefined,
      } : undefined,
      title: typeof document !== 'undefined' ? document.title : undefined,
      components,
      availableNavigations: navigations,
      timestamp: Date.now(),
    }
  }

  /** 在组件上执行动作 */
  function executeAction(instanceId: number, actionName: string, params: Record<string, unknown> = {}): unknown {
    const comp = tracked.get(instanceId)
    if (!comp) throw new Error(`组件实例 ${instanceId} 不存在`)

    const exposed = comp.instance.exposed
    if (exposed && typeof exposed[actionName] === 'function') {
      return (exposed[actionName] as Function)(...Object.values(params))
    }

    // 尝试从 setup 返回值中找方法
    const setupState = (comp.instance as any).setupState
    if (setupState && typeof setupState[actionName] === 'function') {
      return (setupState[actionName] as Function)(...Object.values(params))
    }

    throw new Error(`组件 ${comp.meta.name} 没有 ${actionName} 方法`)
  }

  /** 获取所有已注册组件的元数据列表 */
  function listComponents(): { uid: number; name: string; meta: ComponentAIMeta }[] {
    return Array.from(tracked.entries()).map(([uid, { meta }]) => ({
      uid, name: meta.name, meta,
    }))
  }

  /** 构建带实时状态的组件树 */
  function buildComponentTree(): ComponentAIContext[] {
    const roots: ComponentAIContext[] = []
    const contextMap = new Map<number, ComponentAIContext>()

    for (const [uid, { instance, meta }] of tracked) {
      const ctx: ComponentAIContext = {
        instanceId: String(uid),
        meta,
        propsValues: extractPropsValues(instance),
        stateValues: extractStateValues(instance, meta),
        modelValues: extractModelValues(instance, meta),
        children: [],
      }
      contextMap.set(uid, ctx)
    }

    // 构建父子关系
    for (const [uid, { instance }] of tracked) {
      const ctx = contextMap.get(uid)!
      const parentUid = instance.parent?.uid
      if (parentUid !== undefined && contextMap.has(parentUid)) {
        contextMap.get(parentUid)!.children.push(ctx)
      } else {
        roots.push(ctx)
      }
    }

    return roots
  }

  function collectNavigations(): NavigationMeta[] {
    const navs: NavigationMeta[] = []
    for (const [, { meta }] of tracked) {
      navs.push(...meta.navigations)
    }
    return navs
  }

  /** 安装为 Vue 插件 */
  function install(app: App) {
    // 注入全局属性
    app.config.globalProperties.$aiMind = { snapshot, executeAction, listComponents }

    // 尝试获取 router 实例
    try {
      const router = app.config.globalProperties.$router
      if (router) routerInstance = router
    } catch { /* 没有 vue-router */ }

    // 消费 Vite 插件注入的 pending 元数据
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__AI_MIND__ = { snapshot, executeAction, listComponents }
    }
  }

  return { register, unregister, snapshot, executeAction, listComponents, install }
}

/** 提取组件当前 props 值 */
function extractPropsValues(instance: ComponentInternalInstance): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (instance.props) {
    for (const [key, value] of Object.entries(instance.props)) {
      try { result[key] = toRaw(value) } catch { result[key] = String(value) }
    }
  }
  return result
}

/** 提取组件响应式状态的当前值 */
function extractStateValues(instance: ComponentInternalInstance, meta: ComponentAIMeta): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const setupState = (instance as any).setupState
  if (!setupState) return result

  for (const s of meta.state) {
    try {
      const val = setupState[s.name]
      result[s.name] = toRaw(val)
    } catch { /* 可能是 private 状态 */ }
  }
  return result
}

/** 提取 model 当前值 */
function extractModelValues(instance: ComponentInternalInstance, meta: ComponentAIMeta): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const setupState = (instance as any).setupState
  if (!setupState) return result

  for (const m of meta.models) {
    try {
      result[m.name] = toRaw(setupState[m.name])
    } catch { /* */ }
  }
  return result
}

export type AIMindContext = ReturnType<typeof createAIMindContext>
