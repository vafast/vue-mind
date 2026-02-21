/**
 * vue-mind 核心类型系统
 *
 * 定义 AI 理解 Vue 组件所需的全部元数据结构。
 * 编译时由 Vite 插件提取，运行时由 runtime 库收集和导出。
 */

/** 基础类型描述 */
export interface PropMeta {
  name: string
  type: string
  required: boolean
  default?: unknown
  description?: string
}

/** 事件描述 */
export interface EventMeta {
  name: string
  params?: ParamMeta[]
  description?: string
}

/** 双向绑定模型 */
export interface ModelMeta {
  name: string
  type: string
  default?: unknown
}

/** 响应式状态 */
export interface StateMeta {
  name: string
  type: string
  initial?: unknown
  /** computed 状态的依赖列表 */
  dependencies?: string[]
  computed?: boolean
}

/** 可执行动作（组件方法） */
export interface ActionMeta {
  name: string
  params?: ParamMeta[]
  description?: string
  /** 是否通过 defineExpose 暴露 */
  exposed?: boolean
}

/** 参数描述 */
export interface ParamMeta {
  name: string
  type: string
  required?: boolean
  description?: string
}

/** 模板中的交互元素 */
export interface InteractionMeta {
  /** 触发事件的模板元素描述 */
  element: string
  event: string
  handler: string
}

/** 路由导航信息 */
export interface NavigationMeta {
  path: string
  label?: string
}

/**
 * 编译时提取的组件静态元数据
 * 由 Vite 插件注入到组件的 __aiMeta 属性
 */
export interface ComponentAIMeta {
  /** 组件名 */
  name: string
  /** 组件文件路径（相对） */
  filePath?: string
  /** 开发者手动添加的描述 */
  description?: string
  /** 接受的 props */
  props: PropMeta[]
  /** 可触发的事件 */
  events: EventMeta[]
  /** 双向绑定的 model */
  models: ModelMeta[]
  /** 内部响应式状态 */
  state: StateMeta[]
  /** 可执行的动作 */
  actions: ActionMeta[]
  /** 模板中的交互元素 */
  interactions: InteractionMeta[]
  /** 路由导航 */
  navigations: NavigationMeta[]
}

/**
 * 运行时组件实例的 AI 上下文（静态元数据 + 实时状态值）
 */
export interface ComponentAIContext {
  /** 唯一实例 ID */
  instanceId: string
  /** 编译时静态元数据 */
  meta: ComponentAIMeta
  /** 当前 props 值 */
  propsValues: Record<string, unknown>
  /** 当前响应式状态值 */
  stateValues: Record<string, unknown>
  /** 当前 model 值 */
  modelValues: Record<string, unknown>
  /** 子组件 */
  children: ComponentAIContext[]
}

/**
 * 页面级 AI 快照 — AI Agent 读取这个就能理解整个页面
 */
export interface PageAISnapshot {
  /** 当前路由 */
  route?: {
    path: string
    name?: string
    params?: Record<string, string>
    query?: Record<string, string>
  }
  /** 页面标题 */
  title?: string
  /** 组件树 */
  components: ComponentAIContext[]
  /** 可用的路由跳转 */
  availableNavigations: NavigationMeta[]
  /** 快照生成时间戳 */
  timestamp: number
}

/**
 * WebMCP 工具注册描述
 */
export interface AIMindTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (params: Record<string, unknown>) => Promise<unknown>
}
