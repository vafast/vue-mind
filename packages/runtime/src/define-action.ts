/**
 * defineAIAction — 一次定义，自动生成 AI Tool
 *
 * 核心 composable：在 Vue 组件中定义一个 AI 可调用的动作。
 * 框架自动：
 *   1. 注册到 Channel（AI 可发现和调用）
 *   2. 生成 JSON Schema Tool 描述（兼容 OpenAI function calling）
 *   3. 处理异步结果流（Promise resolve/reject）
 *   4. 组件卸载时自动清理
 *
 * 使用示例：
 *   const { pending } = defineAIAction('confirmDelete', {
 *     description: '弹出确认删除对话框',
 *     params: {
 *       title: { type: 'string', description: '标题' },
 *       message: { type: 'string', description: '确认消息' },
 *     },
 *     async handler(params) {
 *       showDialog.value = true
 *       const confirmed = await userConfirmed.promise
 *       showDialog.value = false
 *       return { confirmed }
 *     }
 *   })
 */

import { ref, getCurrentInstance, onMounted, onUnmounted, inject } from 'vue'
import type { Ref } from 'vue'
import type { DefineAIActionOptions, RegisteredAction, AIActionParamDef } from '@vue-mind/shared'
import type { AIChannel } from './channel'

const AI_CHANNEL_KEY = Symbol('ai-channel')

interface DefineAIActionReturn {
  /** 当前是否有 AI 请求正在执行 */
  pending: Ref<boolean>
  /** 最近一次执行的错误 */
  lastError: Ref<string | null>
  /** 执行次数 */
  callCount: Ref<number>
}

export function defineAIAction<
  TParams extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown,
>(
  actionName: string,
  options: DefineAIActionOptions<TParams, TResult>,
): DefineAIActionReturn {
  const pending = ref(false)
  const lastError = ref<string | null>(null)
  const callCount = ref(0)

  const instance = getCurrentInstance()
  const channel = inject<AIChannel>(AI_CHANNEL_KEY, null as unknown as AIChannel)

  if (!instance || !channel) {
    console.warn(`[vue-mind] defineAIAction("${actionName}") 必须在 setup 中且 createAIMind 已安装时使用`)
    return { pending, lastError, callCount }
  }

  const componentName = instance.type.__name || instance.type.name || 'Anonymous'
  const actionId = `${componentName}.${actionName}`

  const registeredAction: RegisteredAction = {
    id: actionId,
    componentName,
    actionName,
    description: options.description,
    params: options.params || {},
    timeout: options.timeout ?? 30000,
    async execute(params: Record<string, unknown>) {
      pending.value = true
      lastError.value = null
      callCount.value++
      try {
        const result = await options.handler(params as TParams)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        lastError.value = msg
        throw err
      } finally {
        pending.value = false
      }
    },
  }

  onMounted(() => {
    channel.registerAction(registeredAction)
  })

  onUnmounted(() => {
    channel.unregisterAction(actionId)
  })

  return { pending, lastError, callCount }
}

/**
 * notifyAI — 组件主动推送事件给 AI
 *
 * 用于组件发生了 AI 应该知道的事情（用户操作、状态变化、错误等）。
 *
 * 使用示例：
 *   notifyAI('userSelectedFile', { path: '/foo/bar.mp4' })
 *   notifyAI('uploadProgress', { percent: 75 })
 *   notifyAI('error', { message: '网络断开' })
 */
export function notifyAI(event: string, data?: unknown) {
  const instance = getCurrentInstance()
  const channel = inject<AIChannel>(AI_CHANNEL_KEY, null as unknown as AIChannel)

  if (!channel) {
    console.warn('[vue-mind] notifyAI 需要 createAIMind 已安装')
    return
  }

  const source = instance
    ? (instance.type.__name || instance.type.name || 'Anonymous')
    : '__global__'

  channel.pushEvent(source, event, data)
}

/**
 * useAIChannel — 直接获取 Channel 实例（高级用法）
 *
 * 用于需要直接操作 Channel 的场景：
 * - 监听 AI 事件
 * - 订阅状态变更
 * - 手动注册/注销 action
 */
export function useAIChannel(): AIChannel | null {
  return inject<AIChannel>(AI_CHANNEL_KEY, null as unknown as AIChannel)
}

/**
 * createDeferredPromise — 创建一个可外部 resolve/reject 的 Promise
 *
 * 配合 defineAIAction 使用：handler 中 await 这个 promise，
 * 用户操作（点击确认/取消）时 resolve/reject。
 *
 * 使用示例：
 *   const deferred = createDeferredPromise<boolean>()
 *   // handler 中：
 *   const confirmed = await deferred.promise
 *   // 用户点确认时：
 *   deferred.resolve(true)
 *   // 用户点取消时：
 *   deferred.resolve(false)
 */
export function createDeferredPromise<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

export { AI_CHANNEL_KEY }
