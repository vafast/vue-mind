# vue-mind

AI-native semantic layer for Vue 3 — 让 AI Agent 自动理解和操作 Vue 组件。

## 背景与动机

### 前端框架的 AI 盲区

当前主流前端框架（Vue、React、Angular）的设计目标是**人类开发者写、浏览器渲染、人类用户操作**。整个链路里没有 AI 的位置。

这导致 AI Agent 想要理解和操作一个网页，只能走"外部逆向"的路径：

```
网页 HTML/CSS/JS（压缩混淆后）
     │
     ▼
AI 解析 DOM ──→ 猜测语义 ──→ 拼凑 CSS 选择器 ──→ 注入 JS 操作
     │              │              │                    │
   巨慢           不准确        随时失效              跳跃式体验
```

我们在实际构建 AI 操控 Bilibili、腾讯视频等网站的工具时，深刻体验了这些痛点：

### 痛点 1：AI 只能看到 DOM，看不到语义

一个视频播放器在 DOM 中是：

```html
<div class="txp_btn txp_btn_play" data-role="txp-ui-btn">
  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
</div>
```

AI 必须猜测这是一个播放按钮。class 名 `txp_btn_play` 可能下个版本就变成 `_btn_2f3a`。而组件的源码里其实已经清楚写了 `function togglePlay()` —— 但这个信息在打包后完全丢失了。

### 痛点 2：操作是单向 fire-and-forget，AI 不知道结果

传统的 AI-UI 交互模式：

```
AI 调用 show_toast('上传成功')
     │
     ▼
返回 sideEffect ──→ 前端处理
     │
     ✗ AI 不知道 toast 有没有显示
     ✗ AI 不知道用户有没有看到
     ✗ AI 不知道后续该做什么
```

更严重的是确认对话框场景：AI 弹了一个"确认删除？"的对话框，但它拿不到用户点了"确认"还是"取消"。只能靠 `setTimeout(3000)` 之后再去检查页面状态 —— 这既不可靠也浪费时间。

### 痛点 3：状态感知靠轮询和猜测

AI 想知道"视频加载好了没"，只能这样做：

```javascript
// 每 500ms 轮询一次，最多等 8 秒
while (Date.now() - start < 8000) {
  const state = await runJavaScript('document.querySelector("video").duration')
  if (state > 0) break
  await sleep(500)
}
```

这种轮询模式的问题：
- **浪费时间**：视频可能 200ms 就加载好了，但最快也要等 500ms 才知道
- **不可靠**：8 秒超时是拍脑袋定的，网络慢就失败
- **高开销**：频繁注入 JS 查询 DOM 有性能开销
- **没有变化感知**：AI 不知道什么时候该去看，只能持续问

如果组件能主动告诉 AI "我加载好了"，一切都不需要了。

### 痛点 4：每个网站都要写专属工具

为了让 AI 操控 Bilibili，我们写了：

```
bilibili/
├── biliApi.ts           # WBI 签名 + API 调用
├── videoManager.ts      # 播放控制 + 字幕 + 弹幕
├── searchManager.ts     # 搜索
└── biliTools.ts         # AI Tool 定义
```

为了腾讯视频又写了一套：

```
tencent/
├── tencentManager.ts    # Universal Links 处理 + Safari 标签页
├── videoManager.ts      # 播放控制 + 画质 + 会员检测
└── tencentTools.ts      # AI Tool 定义
```

每个网站都是手写的 DOM 操作 + CSS 选择器 + JS 注入。网站改版一次，工具就可能失效。而这些网站的 Vue/React 源码里，组件的功能其实已经写得清清楚楚 —— 只是框架没有把这些信息暴露出来。

### 痛点 5：交互是跳跃的，不像人

AI 操作网页的方式和人完全不同：

- **人**：打开页面 → 看到内容 → 滚动浏览 → 点击按钮 → 等待响应 → 继续操作
- **AI**：注入 JS → 直接调用 `video.play()` → 不知道是否成功 → 再注入 JS 查看

这种跳跃式操作带来很多问题：浏览器安全策略拦截、操作时序错乱、无法触发框架的响应式更新、用户感知不到 AI 在做什么。

### 现有工具的局限

| 工具 | 做法 | 局限 |
|---|---|---|
| **Playwright / Puppeteer** | 操控浏览器 DOM | 外部控制，不了解组件语义，选择器脆弱 |
| **Stagehand** | AI + 无障碍树 | 更智能但仍是外部猜测，每次操作都需要 LLM 推理，慢且贵 |
| **Chrome DevTools Protocol** | 底层协议 | 太底层，没有组件级抽象 |
| **Selenium** | 传统自动化 | 完全基于选择器，零语义理解 |
| **手写 Tool（我们的方案）** | 针对每个网站写操作函数 | 维护成本高，网站改版就失效 |

所有这些方案的共同问题：**从外部逆向推断组件能做什么**。

### 根本解法：从框架层面暴露

如果框架本身就把组件的能力告诉 AI，上面所有痛点都不存在了：

```
Vue 组件源码
     │
     ▼
编译时 ─── 自动提取 props/events/state/actions（信息本来就在源码里）
     │
     ▼
运行时 ─── 实时追踪状态，变化主动推送（不用轮询）
     │
     ▼
Channel ── 双向 Promise 通信（AI 等用户操作，拿到真实结果）
     │
     ▼
Tools ──── 自动生成 AI Tool（不用手写）
```

这就是 **vue-mind** 的设计理念：不是从外部猜测，而是**从框架内部主动暴露**。

---

## 解决什么问题

**vue-mind** 从框架层面解决 AI-UI 交互的根本问题：组件的能力自动暴露为结构化数据，AI 不用猜，直接知道。开发者零改动，接入两行代码。

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

## 对比：vue-mind vs 现有方案

| 维度 | Playwright / Puppeteer | Stagehand | 手写 Tool | **vue-mind** |
|---|---|---|---|---|
| AI 理解组件语义 | ✗ 只看 DOM | △ 靠 LLM 推理 | △ 人工描述 | **✓ 编译时自动提取** |
| 操作准确性 | △ CSS 选择器易失效 | △ 依赖 LLM 判断 | ✓ 手写精确 | **✓ 直接调组件方法** |
| 双向通信 | ✗ 单向注入 | ✗ 单向 | ✗ fire-and-forget | **✓ Promise 双向** |
| 异步结果 | ✗ 靠轮询 | ✗ 靠等待 | ✗ 靠 setTimeout | **✓ await 真实结果** |
| 实时状态感知 | ✗ 要主动查 | ✗ 要主动查 | ✗ 轮询 | **✓ 响应式推送** |
| Tool 生成 | ✗ 手写 | ✗ 手写 | ✗ 手写 | **✓ 自动生成** |
| 网站改版影响 | 大 | 中 | 大 | **无（源码驱动）** |
| 接入成本 | 中 | 中 | 高（每站一套） | **低（两行代码）** |
| 性能 | 中（跨进程） | 低（每步 LLM） | 高 | **高（同进程直调）** |

## Roadmap

- [x] 编译时 SFC AST 元数据提取
- [x] 运行时组件追踪和页面快照
- [x] AIChannel 双向异步通信
- [x] defineAIAction 一次定义自动生成 Tool
- [x] WebMCP 桥接
- [ ] 状态机建模 — 描述页面状态转换（idle → loading → playing → paused）
- [ ] Vue Router 全量路由图谱提取
- [ ] Pinia Store 自动追踪（state/getters/actions）
- [ ] DevTools 扩展 — 可视化 AI 看到的组件树
- [ ] React 适配 — 同理念的 Babel 插件实现

## License

MIT
