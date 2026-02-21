/**
 * Tool 自动生成器
 *
 * 从 Channel 注册的 actions 自动生成：
 * 1. OpenAI function calling 兼容的 Tool 描述
 * 2. 可执行的 execute 函数
 * 3. 内置的状态查询和事件监听 tool
 *
 * 这是"一条龙服务"的最后一环：
 *   defineAIAction → 注册到 Channel → 生成 Tool → AI 直接调用
 */

import type { GeneratedTool, AIActionParamDef, RegisteredAction } from '@vue-mind/shared'
import type { AIChannel } from './channel'
import type { AIMindContext } from './context'

/**
 * 从 Channel 中所有已注册的 actions 生成 AI Tools
 *
 * 返回的 tools 格式兼容 OpenAI function calling，
 * 可直接传给你的 ai-chat-core 或任何 LLM SDK。
 */
export function generateTools(channel: AIChannel, context?: AIMindContext): GeneratedTool[] {
  const tools: GeneratedTool[] = []

  // 1. 从注册的 actions 生成 tools
  for (const action of channel.getRegisteredActions()) {
    tools.push(actionToTool(action, channel))
  }

  // 2. 内置工具：获取页面快照
  if (context) {
    tools.push({
      type: 'function',
      function: {
        name: 'page_snapshot',
        description: '获取当前页面的完整 AI 快照，包括所有组件的状态、可用操作和路由信息',
        parameters: { type: 'object', properties: {} },
      },
      async execute() {
        return { success: true, data: context.snapshot() }
      },
    })
  }

  // 3. 内置工具：列出所有可用动作
  tools.push({
    type: 'function',
    function: {
      name: 'list_available_actions',
      description: '列出当前页面所有 AI 可调用的动作及其参数',
      parameters: { type: 'object', properties: {} },
    },
    async execute() {
      const actions = channel.getRegisteredActions().map(a => ({
        id: a.id,
        description: a.description,
        params: Object.entries(a.params).map(([name, def]) => ({
          name,
          type: def.type,
          description: def.description,
          required: def.required !== false,
        })),
      }))
      return { success: true, data: actions }
    },
  })

  // 4. 内置工具：发送事件给 UI
  tools.push({
    type: 'function',
    function: {
      name: 'send_event',
      description: 'AI 主动给 UI 发送事件（如通知、指令等）',
      parameters: {
        type: 'object',
        properties: {
          event: { type: 'string', description: '事件名' },
          data: { type: 'object', description: '事件数据' },
        },
        required: ['event'],
      },
    },
    async execute(params) {
      channel.pushEvent('__ai__', String(params.event), params.data)
      return { success: true, data: { sent: true } }
    },
  })

  // 5. 内置工具：获取 Channel 状态
  tools.push({
    type: 'function',
    function: {
      name: 'channel_status',
      description: '获取通信通道的当前状态：已注册动作、挂起请求、订阅数等',
      parameters: { type: 'object', properties: {} },
    },
    async execute() {
      return { success: true, data: channel.getChannelState() }
    },
  })

  return tools
}

/** 将单个 RegisteredAction 转为 GeneratedTool */
function actionToTool(action: RegisteredAction, channel: AIChannel): GeneratedTool {
  const properties: Record<string, { type: string; description?: string; enum?: unknown[]; default?: unknown }> = {}
  const required: string[] = []

  for (const [name, def] of Object.entries(action.params)) {
    properties[name] = {
      type: def.type,
      description: def.description,
      enum: def.enum,
      default: def.default,
    }
    if (def.required !== false) required.push(name)
  }

  return {
    type: 'function',
    function: {
      name: action.id,
      description: action.description,
      parameters: {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
      },
    },
    async execute(params) {
      try {
        const result = await channel.invoke(action.id, params)
        return { success: true, data: result }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  }
}

/**
 * 监听 Channel 变化，自动更新 tools（用于动态组件场景）
 *
 * 返回一个响应式的 tools ref，组件 mount/unmount 时自动更新。
 */
export function createReactiveTools(channel: AIChannel, context?: AIMindContext) {
  let cachedTools: GeneratedTool[] = []
  let dirty = true

  // 监听 action 注册/注销事件
  channel.onEvent('__channel__.*', (event) => {
    if (event.event === 'action:registered' || event.event === 'action:unregistered') {
      dirty = true
    }
  })

  return {
    /** 获取当前 tools（有缓存） */
    getTools(): GeneratedTool[] {
      if (dirty) {
        cachedTools = generateTools(channel, context)
        dirty = false
      }
      return cachedTools
    },
    /** 强制刷新 */
    refresh() {
      dirty = true
    },
  }
}
