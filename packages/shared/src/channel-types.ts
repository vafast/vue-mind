/**
 * vue-mind Channel 协议类型
 *
 * 定义 AI ↔ UI 双向通信的完整协议：
 * - AI → UI：请求（request）+ 调用动作（invoke）
 * - UI → AI：响应（response）+ 事件推送（event）+ 状态变更（stateUpdate）
 */

// ─── AI → UI ─────────────────────────────────────────

/** AI 发给 UI 的请求 */
export interface AIRequest {
  /** 请求唯一 ID，用于匹配响应 */
  id: string
  /** 目标组件名或 action 名 */
  target: string
  /** 要执行的动作 */
  action: string
  /** 参数 */
  params: Record<string, unknown>
  /** 超时毫秒数（0=不超时） */
  timeout?: number
}

// ─── UI → AI ─────────────────────────────────────────

/** UI 返回给 AI 的响应 */
export interface UIResponse {
  /** 对应请求的 ID */
  requestId: string
  success: boolean
  data?: unknown
  error?: string
}

/** UI 主动推给 AI 的事件 */
export interface UIEvent {
  /** 事件来源组件 */
  source: string
  /** 事件名 */
  event: string
  /** 事件数据 */
  data?: unknown
  timestamp: number
}

/** 响应式状态变更通知 */
export interface StateUpdate {
  /** 来源组件 */
  source: string
  /** 状态路径，如 "items" 或 "playing" */
  path: string
  /** 当前值 */
  value: unknown
  /** 之前的值 */
  previousValue?: unknown
  timestamp: number
}

// ─── Action 定义 ─────────────────────────────────────

/** defineAIAction 的参数描述 */
export interface AIActionParamDef {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  required?: boolean
  default?: unknown
  enum?: unknown[]
}

/** defineAIAction 的选项 */
export interface DefineAIActionOptions<TParams extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> {
  /** AI 看到的动作描述 */
  description: string
  /** 参数定义 */
  params?: Record<string, AIActionParamDef>
  /** 处理函数：接收参数，返回 Promise 结果 */
  handler: (params: TParams) => Promise<TResult>
  /** 超时毫秒数（默认 30000） */
  timeout?: number
  /** 是否需要用户确认后才执行（安全敏感操作） */
  requireConfirm?: boolean
}

/** 注册后的 action 运行时信息 */
export interface RegisteredAction {
  /** 动作 ID（ComponentName.actionName） */
  id: string
  /** 所属组件 */
  componentName: string
  /** 动作名 */
  actionName: string
  /** 描述 */
  description: string
  /** 参数 schema */
  params: Record<string, AIActionParamDef>
  /** 执行函数 */
  execute: (params: Record<string, unknown>) => Promise<unknown>
  /** 超时 */
  timeout: number
}

// ─── Tool 生成 ───────────────────────────────────────

/** 生成的 AI Tool 描述（兼容 OpenAI function calling 格式） */
export interface GeneratedTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, {
        type: string
        description?: string
        enum?: unknown[]
        default?: unknown
      }>
      required?: string[]
    }
  }
  /** 执行函数 — AI runtime 调用此函数 */
  execute: (params: Record<string, unknown>) => Promise<{
    success: boolean
    data?: unknown
    error?: string
  }>
}

// ─── 中间件 ──────────────────────────────────────────

/** Channel 中间件 */
export interface ChannelMiddleware {
  name: string
  /** 拦截 AI → UI 请求 */
  onRequest?: (req: AIRequest) => AIRequest | null
  /** 拦截 UI → AI 响应 */
  onResponse?: (res: UIResponse) => UIResponse
  /** 拦截 UI → AI 事件 */
  onEvent?: (event: UIEvent) => UIEvent | null
  /** 拦截状态变更 */
  onStateUpdate?: (update: StateUpdate) => StateUpdate | null
}

// ─── 订阅 ────────────────────────────────────────────

/** 状态订阅选项 */
export interface StateWatchOptions {
  /** 组件名 */
  source?: string
  /** 状态路径模式（支持 * 通配） */
  path?: string
  /** 防抖毫秒数 */
  debounce?: number
}

/** 取消订阅 */
export interface Unsubscribe {
  (): void
}
