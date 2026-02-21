/**
 * createAIMind — Vue 插件入口
 *
 * 集成三大能力：
 * 1. 组件元数据追踪（context）
 * 2. 双向异步通信（channel）
 * 3. Tool 自动生成（tool-generator）
 *
 * 使用方式：
 *   const app = createApp(App)
 *   app.use(createAIMind())
 *   app.mount('#app')
 */

import type { Plugin } from 'vue'
import { createAIMindContext } from './context'
import { createAIChannel } from './channel'
import { createReactiveTools, generateTools } from './tool-generator'
import { AI_MIND_KEY } from './composable'
import { AI_CHANNEL_KEY } from './define-action'

export function createAIMind(): Plugin {
  const context = createAIMindContext()
  const channel = createAIChannel()
  const reactiveTools = createReactiveTools(channel, context)

  return {
    install(app) {
      // 注入上下文和通道
      app.provide(AI_MIND_KEY, context)
      app.provide(AI_CHANNEL_KEY, channel)

      // 安装上下文
      context.install(app)

      // 暴露全局 API
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__AI_MIND__ = {
          // 快照
          snapshot: () => context.snapshot(),
          executeAction: (uid: number, action: string, params?: Record<string, unknown>) =>
            context.executeAction(uid, action, params),
          listComponents: () => context.listComponents(),

          // Channel — 双向通信
          channel: {
            invoke: (actionId: string, params?: Record<string, unknown>) =>
              channel.invoke(actionId, params),
            onEvent: (pattern: string, handler: Function) =>
              channel.onEvent(pattern, handler as (event: unknown) => void),
            watchState: (options: Record<string, unknown>, handler: Function) =>
              channel.watchState(options, handler as (update: unknown) => void),
            pushEvent: (source: string, event: string, data?: unknown) =>
              channel.pushEvent(source, event, data),
            getState: () => channel.getChannelState(),
          },

          // Tools — 自动生成
          getTools: () => reactiveTools.getTools(),
          generateTools: () => generateTools(channel, context),
        }
      }
    },
  }
}
