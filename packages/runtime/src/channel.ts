/**
 * AIChannel — AI ↔ UI 双向异步通信通道
 *
 * 核心能力：
 * 1. AI → UI：发送请求，挂起 Promise，等待 UI 响应后 resolve
 * 2. UI → AI：主动推送事件（无需 AI 发起请求）
 * 3. 状态订阅：AI watch 某个状态，UI 变化时自动推送
 * 4. 中间件：可插拔的拦截器（日志、权限、节流等）
 * 5. 超时取消：请求可设超时，避免永远挂起
 */

import type {
  AIRequest,
  UIResponse,
  UIEvent,
  StateUpdate,
  RegisteredAction,
  ChannelMiddleware,
  StateWatchOptions,
  Unsubscribe,
} from '@vue-mind/shared'

let requestCounter = 0
function genRequestId(): string {
  return `req_${++requestCounter}_${Date.now().toString(36)}`
}

type EventHandler = (event: UIEvent) => void
type StateHandler = (update: StateUpdate) => void

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

export function createAIChannel() {
  /** 已注册的 action（组件通过 defineAIAction 注册） */
  const actions = new Map<string, RegisteredAction>()

  /** 挂起的请求（等待 UI 响应） */
  const pending = new Map<string, PendingRequest>()

  /** 事件订阅 */
  const eventHandlers = new Map<string, Set<EventHandler>>()
  const wildcardEventHandlers = new Set<EventHandler>()

  /** 状态订阅 */
  const stateHandlers: Array<{ options: StateWatchOptions; handler: StateHandler; debounceTimer?: ReturnType<typeof setTimeout> }> = []

  /** 中间件链 */
  const middlewares: ChannelMiddleware[] = []

  // ─── Action 注册/注销 ─────────────────────────────

  function registerAction(action: RegisteredAction) {
    actions.set(action.id, action)
    emitInternalEvent('action:registered', { actionId: action.id, description: action.description })
  }

  function unregisterAction(id: string) {
    actions.delete(id)
    emitInternalEvent('action:unregistered', { actionId: id })
  }

  function getRegisteredActions(): RegisteredAction[] {
    return Array.from(actions.values())
  }

  // ─── AI → UI：请求/调用 ───────────────────────────

  /**
   * AI 发起请求：调用 UI 组件的 action，返回 Promise
   * Promise 在 UI 处理完成后 resolve，超时或出错则 reject
   */
  async function request(target: string, action: string, params: Record<string, unknown> = {}, timeout = 30000): Promise<unknown> {
    const actionId = `${target}.${action}`
    const registered = actions.get(actionId)

    if (!registered) {
      throw new Error(`Action "${actionId}" 未注册。可用: ${Array.from(actions.keys()).join(', ')}`)
    }

    let req: AIRequest | null = {
      id: genRequestId(),
      target,
      action,
      params,
      timeout,
    }

    // 中间件拦截
    for (const mw of middlewares) {
      if (mw.onRequest) {
        req = mw.onRequest(req)
        if (!req) throw new Error(`请求被中间件 "${mw.name}" 拦截`)
      }
    }

    // 直接调用 handler（不走消息传递，同进程直接调用）
    try {
      const resultPromise = registered.execute(params)

      // 带超时的等待
      const effectiveTimeout = timeout || registered.timeout
      if (effectiveTimeout > 0) {
        const result = await withTimeout(resultPromise, effectiveTimeout, actionId)
        return wrapResponse(req.id, true, result)
      }

      const result = await resultPromise
      return wrapResponse(req.id, true, result)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return wrapResponse(req.id, false, undefined, error)
    }
  }

  /**
   * 简化调用：直接用 actionId
   */
  async function invoke(actionId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const [target, action] = actionId.split('.') as [string, string]
    if (!target || !action) throw new Error(`actionId 格式错误: "${actionId}"，应为 "ComponentName.actionName"`)
    return request(target, action, params)
  }

  // ─── UI → AI：事件推送 ─────────────────────────────

  /**
   * UI 主动推事件给 AI（组件触发，AI 监听）
   */
  function pushEvent(source: string, event: string, data?: unknown) {
    let evt: UIEvent | null = {
      source,
      event,
      data,
      timestamp: Date.now(),
    }

    for (const mw of middlewares) {
      if (mw.onEvent) {
        evt = mw.onEvent(evt)
        if (!evt) return
      }
    }

    // 精确匹配
    const key = `${source}.${event}`
    eventHandlers.get(key)?.forEach(h => h(evt!))

    // 组件级匹配
    eventHandlers.get(`${source}.*`)?.forEach(h => h(evt!))

    // 事件级匹配
    eventHandlers.get(`*.${event}`)?.forEach(h => h(evt!))

    // 通配
    wildcardEventHandlers.forEach(h => h(evt!))
  }

  /**
   * AI 监听 UI 事件
   * pattern: "ComponentName.eventName" | "ComponentName.*" | "*.eventName" | "*"
   */
  function onEvent(pattern: string, handler: EventHandler): Unsubscribe {
    if (pattern === '*') {
      wildcardEventHandlers.add(handler)
      return () => wildcardEventHandlers.delete(handler)
    }

    if (!eventHandlers.has(pattern)) {
      eventHandlers.set(pattern, new Set())
    }
    eventHandlers.get(pattern)!.add(handler)
    return () => eventHandlers.get(pattern)?.delete(handler)
  }

  // ─── 状态订阅 ──────────────────────────────────────

  /**
   * UI 推送状态变更（组件的 ref/computed 变化时调用）
   */
  function pushStateUpdate(source: string, path: string, value: unknown, previousValue?: unknown) {
    let update: StateUpdate | null = {
      source,
      path,
      value,
      previousValue,
      timestamp: Date.now(),
    }

    for (const mw of middlewares) {
      if (mw.onStateUpdate) {
        update = mw.onStateUpdate(update)
        if (!update) return
      }
    }

    for (const sub of stateHandlers) {
      if (matchStatePattern(sub.options, source, path)) {
        if (sub.options.debounce && sub.options.debounce > 0) {
          clearTimeout(sub.debounceTimer)
          sub.debounceTimer = setTimeout(() => sub.handler(update!), sub.options.debounce)
        } else {
          sub.handler(update)
        }
      }
    }
  }

  /**
   * AI 订阅状态变更
   */
  function watchState(options: StateWatchOptions, handler: StateHandler): Unsubscribe {
    const sub = { options, handler }
    stateHandlers.push(sub)
    return () => {
      const idx = stateHandlers.indexOf(sub)
      if (idx !== -1) stateHandlers.splice(idx, 1)
    }
  }

  // ─── 中间件 ────────────────────────────────────────

  function use(middleware: ChannelMiddleware) {
    middlewares.push(middleware)
  }

  // ─── 内部工具 ──────────────────────────────────────

  function emitInternalEvent(event: string, data?: unknown) {
    pushEvent('__channel__', event, data)
  }

  /** 等待 AI 对某个事件的下一次触发（用于 UI 等待 AI 决策） */
  function waitForEvent(pattern: string, timeout = 30000): Promise<UIEvent> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const unsub = onEvent(pattern, (event) => {
        clearTimeout(timer)
        unsub()
        resolve(event)
      })

      if (timeout > 0) {
        timer = setTimeout(() => {
          unsub()
          reject(new Error(`等待事件 "${pattern}" 超时 (${timeout}ms)`))
        }, timeout)
      }
    })
  }

  /**
   * 获取 Channel 当前状态快照（用于调试和 AI 感知）
   */
  function getChannelState() {
    return {
      registeredActions: Array.from(actions.keys()),
      pendingRequests: Array.from(pending.keys()),
      eventSubscriptions: Array.from(eventHandlers.keys()),
      stateSubscriptions: stateHandlers.length,
      middlewares: middlewares.map(m => m.name),
    }
  }

  return {
    // Action 管理
    registerAction,
    unregisterAction,
    getRegisteredActions,

    // AI → UI
    request,
    invoke,

    // UI → AI
    pushEvent,
    onEvent,

    // 状态订阅
    pushStateUpdate,
    watchState,

    // 工具
    waitForEvent,
    getChannelState,

    // 中间件
    use,
  }
}

// ─── 辅助函数 ────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`"${label}" 执行超时 (${ms}ms)`)),
      ms,
    )
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

function wrapResponse(requestId: string, success: boolean, data?: unknown, error?: string) {
  return success ? data : { __error: true, requestId, error }
}

function matchStatePattern(options: StateWatchOptions, source: string, path: string): boolean {
  if (options.source && options.source !== source && options.source !== '*') return false
  if (options.path) {
    if (options.path === '*') return true
    if (options.path.endsWith('*')) {
      return path.startsWith(options.path.slice(0, -1))
    }
    return options.path === path
  }
  return true
}

export type AIChannel = ReturnType<typeof createAIChannel>
