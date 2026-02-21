# vue-mind

AI-native semantic layer for Vue 3 — 让 AI Agent 自动理解和操作 Vue 组件。

## 解决什么问题

现有前端框架对 AI 不友好：AI 必须解析压缩后的 HTML/JS 来猜测页面能做什么，脆弱且低效。

**vue-mind** 从框架层面解决：组件的能力自动暴露为结构化数据，AI 不用猜，直接知道。

```
开发者正常写 Vue 组件（零改动）
        │
   编译时 ─── Vite 插件分析 SFC AST，提取 props/events/state/actions
        │
   运行时 ─── Vue 插件追踪组件树，导出实时快照
        │
   Channel ── 双向异步通信，AI 调用组件方法，组件推送事件给 AI
        │
   Tools ──── 自动生成 OpenAI function calling 兼容的 Tool 描述
```

## 快速开始

### 安装

```bash
pnpm add @vue-mind/vite-plugin @vue-mind/runtime
```

### 接入（两行代码）

```typescript
// vite.config.ts
import vue from '@vitejs/plugin-vue'
import aiMind from '@vue-mind/vite-plugin'

export default defineConfig({
  plugins: [vue(), aiMind()],
})
```

```typescript
// main.ts
import { createApp } from 'vue'
import { createAIMind } from '@vue-mind/runtime'
import App from './App.vue'

const app = createApp(App)
app.use(createAIMind())
app.mount('#app')
```

完成。所有组件自动暴露 AI 元数据。

## 核心能力

### 1. 编译时元数据提取

Vite 插件自动分析 `<script setup>` 和 `<template>`：

| 源码 | 提取为 |
|---|---|
| `defineProps<{ src: string }>()` | 组件输入 |
| `defineEmits<{ play: [] }>()` | 可触发事件 |
| `defineModel<number>('volume')` | 双向绑定 |
| `ref(0)` / `computed(...)` | 响应式状态 |
| `function seek(s: number)` | 可执行动作 |
| `defineExpose({ seek })` | 暴露给外部 |
| `@click="togglePlay"` | 交互元素 |
| `<router-link to="/home">` | 导航路径 |

### 2. 双向异步通信（Channel）

AI 和 UI 通过 Promise 驱动的通道通信，不需要 setTimeout 或轮询：

```typescript
// AI 调用 → UI 弹框 → 用户操作 → AI 拿到结果
const result = await __AI_MIND__.channel.invoke(
  'ConfirmDialog.confirm',
  { title: '删除确认', message: '确定删除？' }
)
// result = { confirmed: true }
```

### 3. defineAIAction — 一次定义，三端贯通

在组件中定义一个 AI 可调用的动作，框架自动完成注册、Tool 生成、异步结果流：

```vue
<script setup>
import { ref } from 'vue'
import { defineAIAction, createDeferredPromise } from '@vue-mind/runtime'

const visible = ref(false)
let deferred = null

const { pending } = defineAIAction('confirm', {
  description: '弹出确认对话框，等待用户确认或取消',
  params: {
    title: { type: 'string', description: '标题' },
    message: { type: 'string', description: '消息' },
  },
  async handler(params) {
    visible.value = true
    deferred = createDeferredPromise()

    // 挂起 Promise，等待用户操作（不是 setTimeout！）
    const confirmed = await deferred.promise

    visible.value = false
    return { confirmed }
  },
})

function onConfirm() { deferred?.resolve(true) }
function onCancel() { deferred?.resolve(false) }
</script>
```

### 4. 组件主动推送事件给 AI

```vue
<script setup>
import { notifyAI } from '@vue-mind/runtime'

// 上传进度实时推送
notifyAI('uploadProgress', { fileName: 'photo.jpg', progress: 75 })

// 用户操作通知
notifyAI('fileSelected', { path: '/foo/bar.mp4' })
</script>
```

AI 侧监听：

```javascript
__AI_MIND__.channel.onEvent('FileUpload.uploadProgress', (e) => {
  console.log(e.data.progress) // 75
})
```

### 5. Tool 自动生成

所有 `defineAIAction` 自动生成 OpenAI function calling 兼容的 Tool：

```javascript
const tools = __AI_MIND__.getTools()
// [
//   { function: { name: 'ConfirmDialog.confirm', ... }, execute: fn },
//   { function: { name: 'FileUpload.startUpload', ... }, execute: fn },
//   { function: { name: 'page_snapshot', ... }, execute: fn },
//   { function: { name: 'list_available_actions', ... }, execute: fn },
//   ...
// ]
```

内置工具：

| 工具 | 说明 |
|---|---|
| `page_snapshot` | 获取页面完整 AI 快照 |
| `list_available_actions` | 列出所有可调用动作 |
| `send_event` | AI 主动发事件给 UI |
| `channel_status` | 通道诊断信息 |

### 6. 状态订阅

AI 可以 watch 某个组件的状态，变化时自动推送：

```javascript
__AI_MIND__.channel.watchState(
  { source: 'TodoList', path: 'items' },
  (update) => console.log('待办列表变了:', update.value)
)
```

### 7. 中间件

可插拔的拦截器，用于日志、权限、节流等：

```javascript
__AI_MIND__.channel.use({
  name: 'logger',
  onRequest(req) {
    console.log(`[AI→UI] ${req.target}.${req.action}`, req.params)
    return req
  },
  onEvent(event) {
    console.log(`[UI→AI] ${event.source}.${event.event}`, event.data)
    return event
  },
})
```

## 包结构

```
vue-mind/
├── packages/
│   ├── shared/              @vue-mind/shared — 核心类型系统
│   ├── vite-plugin/         @vue-mind/vite-plugin — 编译时 AST 提取
│   ├── runtime/             @vue-mind/runtime — 运行时 + Channel + Tool 生成
│   └── webmcp/              @vue-mind/webmcp — W3C WebMCP 桥接
└── playground/              演示项目
```

### @vue-mind/shared

核心类型定义，编译时和运行时共用：

- `ComponentAIMeta` — 组件静态元数据
- `PageAISnapshot` — 页面级 AI 快照
- `AIRequest` / `UIResponse` — Channel 协议
- `DefineAIActionOptions` — Action 定义选项
- `GeneratedTool` — 生成的 AI Tool
- `ChannelMiddleware` — 中间件接口

### @vue-mind/vite-plugin

编译时 Vite 插件：

- `extractScriptMeta()` — 从 `<script setup>` 提取 props/emits/models/state/actions
- `extractTemplateMeta()` — 从 `<template>` 提取交互元素和路由导航
- 自动注入 `__aiMeta` 到组件

### @vue-mind/runtime

运行时核心：

| 导出 | 说明 |
|---|---|
| `createAIMind()` | Vue 插件入口 |
| `useAIMind(options)` | 组件级 composable，补充语义描述 |
| `defineAIAction(name, options)` | 定义 AI 可调用的动作 |
| `notifyAI(event, data)` | 组件主动推送事件给 AI |
| `createDeferredPromise()` | 创建可外部 resolve 的 Promise |
| `useAIChannel()` | 获取 Channel 实例（高级用法） |
| `generateTools(channel)` | 手动生成 Tool 列表 |
| `createReactiveTools(channel)` | 响应式 Tool 缓存（自动更新） |

### @vue-mind/webmcp

W3C WebMCP 标准桥接（Chrome 146+）：

- 自动将组件能力注册为 `navigator.modelContext` 工具
- 内置 polyfill 用于开发调试

## 运行 Playground

```bash
pnpm install
pnpm -C packages/vite-plugin build
pnpm dev
```

打开浏览器控制台体验：

```javascript
// 弹出确认对话框，等用户点击后返回
await __AI_MIND__.channel.invoke('ConfirmDialog.confirm', {
  title: '测试', message: '这是双向异步通信'
})

// 模拟上传，实时收到进度事件
__AI_MIND__.channel.onEvent('FileUpload.uploadProgress', e => console.log(e.data))
await __AI_MIND__.channel.invoke('FileUpload.startUpload', { fileName: 'demo.mp4' })

// 查看页面快照
__AI_MIND__.snapshot()

// 查看所有自动生成的 Tools
__AI_MIND__.getTools().map(t => t.function.name)
```

## 技术栈

- **Vue 3** — SFC 编译器 + Composition API + 响应式系统
- **Vite** — Plugin API + 编译时 transform
- **@vue/compiler-sfc** — SFC AST 解析
- **@vue/compiler-dom** — 模板 AST 解析
- **TypeScript** — 全量类型安全
- **pnpm workspace** — Monorepo 管理
- **tsup** — 插件构建
- **W3C WebMCP** — 浏览器标准集成

## License

MIT
