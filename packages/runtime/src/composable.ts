/**
 * useAIMind — 组件级 composable
 *
 * 开发者可以（可选地）在组件中使用，为 AI 提供更丰富的语义描述。
 * 不使用也完全可以——Vite 插件会自动提取基本元数据。
 *
 * 使用示例：
 *   useAIMind({
 *     description: '视频播放器，支持播放控制和画质切换',
 *     actions: {
 *       seek: { description: '跳转到指定时间点' },
 *     }
 *   })
 */

import { getCurrentInstance, onMounted, onUnmounted, inject } from 'vue'
import type { ComponentAIMeta, ActionMeta } from '@vue-mind/shared'
import type { AIMindContext } from './context'

const AI_MIND_KEY = Symbol('ai-mind')

export interface UseAIMindOptions {
  /** 组件的自然语言描述，AI 用来理解组件用途 */
  description?: string
  /** 对 action 的补充描述 */
  actions?: Record<string, { description?: string; params?: Record<string, string> }>
}

export function useAIMind(options: UseAIMindOptions = {}) {
  const instance = getCurrentInstance()
  if (!instance) return

  const context = inject<AIMindContext>(AI_MIND_KEY, null as unknown as AIMindContext)
  if (!context) return

  onMounted(() => {
    // 从 Vite 插件注入的 pending 队列中匹配当前组件的元数据
    const pending = (typeof window !== 'undefined'
      ? (window as unknown as Record<string, unknown>).__VUE_MIND_PENDING__ as ComponentAIMeta[] | undefined
      : undefined) || []

    const componentName = instance.type.__name || instance.type.name || 'Anonymous'
    let meta = pending.find(m => m.name === componentName)

    if (!meta) {
      // 没有编译时元数据，生成最小化的运行时元数据
      meta = {
        name: componentName,
        props: [],
        events: [],
        models: [],
        state: [],
        actions: [],
        interactions: [],
        navigations: [],
      }
    }

    // 合并开发者手动提供的描述
    if (options.description) meta.description = options.description
    if (options.actions) {
      for (const [name, desc] of Object.entries(options.actions)) {
        const action = meta.actions.find(a => a.name === name)
        if (action) {
          if (desc.description) action.description = desc.description
        } else {
          const enriched: ActionMeta = { name, description: desc.description }
          meta.actions.push(enriched)
        }
      }
    }

    context.register(instance, meta)
  })

  onUnmounted(() => {
    context.unregister(instance.uid)
  })
}

export { AI_MIND_KEY }
