// 插件入口
export { createAIMind } from './plugin'

// 组件元数据
export { useAIMind } from './composable'
export { createAIMindContext } from './context'
export type { AIMindContext } from './context'

// 双向通道
export { createAIChannel } from './channel'
export type { AIChannel } from './channel'

// Action 定义
export { defineAIAction, notifyAI, useAIChannel, createDeferredPromise } from './define-action'

// Tool 自动生成
export { generateTools, createReactiveTools } from './tool-generator'
