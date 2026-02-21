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

## 为什么选 Vue，不选 React

这不是偏好问题，是技术结构决定的。**Vue 的 SFC 格式天然就是 AI 可分析的"能力声明"，React 的 JSX 不是。**

### 对比：同一个组件

**Vue — 结构化、声明式、可静态分析**：

```vue
<script setup lang="ts">
defineProps<{ src: string; autoplay?: boolean }>()   // ← 输入声明
defineEmits<{ play: []; pause: [] }>()                // ← 事件声明
const volume = defineModel<number>('volume')          // ← 双向绑定声明
const playing = ref(false)                            // ← 状态声明
function seek(seconds: number) { ... }                // ← 动作声明
defineExpose({ seek })                                // ← 暴露声明
</script>
<template>
  <button @click="togglePlay">播放</button>           <!-- 交互声明 -->
  <router-link to="/home">首页</router-link>           <!-- 导航声明 -->
</template>
```

每一行都是明确的**能力声明**，编译器可以直接提取。

**React — 灵活、命令式、无法静态分析**：

```tsx
function VideoPlayer({ src, autoplay, onPlay, volume, onVolumeChange }: Props) {
  const [playing, setPlaying] = useState(false)        // 解构赋值，变量名可以是任何东西
  const seek = useCallback((s: number) => { ... }, []) // 是性能优化，不是语义声明
  useImperativeHandle(ref, () => ({ seek }))           // 不常用，大多数组件不写
  return <button onClick={() => { ... }}>播放</button>  // handler 是匿名函数，内联逻辑
}
```

### 7 个技术原因

| # | Vue 的优势 | React 的困难 |
|---|---|---|
| 1 | **`defineProps` / `defineEmits` / `defineModel` 是编译器宏**，专为静态分析设计，编译时就能提取完整类型 | props 只是函数参数，没有专用声明宏，需要从 TypeScript 类型或 PropTypes 反向推断 |
| 2 | **`<template>` 是受限的 HTML 超集**，`@click`、`v-if`、`v-for` 都是结构化指令，AST 可完整遍历 | JSX 是任意 JavaScript 表达式，`onClick={fn}` 里的 `fn` 可能是内联函数、三元表达式、高阶函数返回值，无法静态分析 |
| 3 | **`@vue/compiler-sfc` 官方编译器**已经能解析 SFC 并提取 props/emits 类型信息，vue-mind 直接复用 | React 没有等价的官方工具。Babel 可以做 JSX transform，但不理解组件语义 |
| 4 | **`ref()` / `computed()` / `reactive()` 是显式状态声明**，名称和类型编译时可知 | `useState` 返回数组解构 `const [x, setX] = useState(0)`，变量名只是约定，不是强制结构 |
| 5 | **`defineExpose` 明确标记对外暴露的方法** | `useImperativeHandle` 使用率低，大多数组件不写，AI 不知道哪些方法可以从外部调用 |
| 6 | **SFC 三段分离**（template/script/style），每段可独立解析，互不干扰 | JSX 把渲染逻辑、事件处理、状态管理混在一个函数里，没有清晰的分离边界 |
| 7 | **Vite 是 Vue 的原生构建工具**，plugin transform hook 在编译时拦截 `.vue` 文件，注入成本为零 | React 用 webpack/Vite/Turbopack 都行，但没有统一的 SFC 编译入口，需要 Babel 插件 + 自定义 loader |

### React 能做吗？

能，但更难。路线图中的 "React 适配" 需要：

1. **Babel 插件**分析 JSX AST + hooks 调用模式，启发式提取 props/state/actions
2. **自定义 hook `useAIMind()`** 替代编译时提取（运行时补充元数据，开发者需要多写代码）
3. **TypeScript Compiler API** 从类型声明反向推断 props 结构（比 Vue 的编译器宏重得多）

总结：Vue 是 AI 分析最友好的前端框架，因为它的设计哲学就是**声明式 + 编译器驱动**。React 的哲学是**"just JavaScript"**，灵活但对静态分析不友好。

> vue-mind 选 Vue 不是因为 Vue 更好，而是因为 Vue 的设计恰好和 AI 需要的结构化信息高度契合。

---

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

## AI 时代的认证：从根本上重新设计

### 错误的前提：操作者一定是人

当前所有 Web 应用的认证模型都建立在一个假设上：**坐在屏幕前操作的是人类**。

登录流程验证的是"你是人"——扫码、输密码、按指纹、拖滑块、识别红绿灯图片。

这个假设在 AI 时代是错误的。

```
2020 年：  人 → 浏览器 → 网站         （操作者 = 人）
2026 年：  人 → AI → 浏览器 → 网站    （操作者 = AI，授权者 = 人）
未来：     人 → AI → 多个应用/服务     （AI 是人的常驻代理）
```

问题不是"AI 怎么登录"，而是 **"认证系统怎么认可 AI 是人的合法代理"**。

### 这不是一个工具问题，是一个设计范式问题

看几个真实例子：

| 场景 | 为人设计 | AI 遇到的困境 |
|---|---|---|
| B 站看视频 | 扫码登录，Cookie 保持 | AI 没有手机扫码，Cookie 随时过期 |
| 腾讯视频 | 微信 OAuth 弹窗 | AI 无法操作微信弹窗 |
| npm 发包 | 打开 Chrome → WebAuthn → 按指纹 | AI 没有指纹，CI 没有浏览器 |
| GitHub API | Personal Access Token | 需要人手动创建和管理 |
| 银行转账 | 短信验证码 + 人脸识别 | 这**应该**拦住 AI |

最后一行很关键：不是所有操作都应该让 AI 做。认证的核心问题变成了 **分级授权**。

### 未来应用开发的认证模型：四级能力授权

传统认证是二元的：登录 / 未登录。AI 时代需要的是 **连续的能力光谱**：

```
Level 0 ─ 公开                 任何人/AI 都能做
    │     浏览内容、搜索、查看公开信息
    ▼
Level 1 ─ 委托可执行           人授权一次，AI 长期代理
    │     播放视频、发评论、管理待办、发布代码包
    ▼
Level 2 ─ 实时确认             每次都需要人确认
    │     删除数据、修改设置、取消订阅
    ▼
Level 3 ─ 仅限人类             AI 永远不能代理
          支付转账、修改密码、人脸核身、签署合同
```

#### 开发者视角：在组件级别声明

```vue
<script setup>
import { defineAIAction, createDeferredPromise } from '@vue-mind/runtime'

// Level 0 — 公开，AI 随时可调用
defineAIAction('search', {
  description: '搜索视频',
  authLevel: 'public',
  async handler(params) {
    return await searchVideos(params.keyword)
  },
})

// Level 1 — 委托可执行，需要用户提前授权，之后 AI 自主调用
defineAIAction('playVideo', {
  description: '播放视频（需登录，会员可看高清）',
  authLevel: 'delegated',
  authHint: {
    minRole: 'authenticated',        // 最低需要登录
    optimalRole: 'vip',              // 最佳体验需要会员
    degradedExperience: '未登录只能 480p，非会员最高 1080p',
  },
  async handler(params) { ... },
})

// Level 2 — 每次确认，AI 调用时会弹确认框等用户操作
defineAIAction('deletePlaylist', {
  description: '删除播放列表',
  authLevel: 'confirm',
  async handler(params) {
    const deferred = createDeferredPromise()
    showConfirmDialog(`确定删除「${params.name}」？`)
    const confirmed = await deferred.promise     // 等用户点击
    if (!confirmed) throw new Error('用户取消')
    return await deletePlaylist(params.id)
  },
})

// Level 3 — 仅限人类，AI 不能调用，只能告诉用户"请自己操作"
defineAIAction('bindPayment', {
  description: '绑定支付方式',
  authLevel: 'human-only',
  async handler() {
    throw new Error('此操作需要您亲自完成')
  },
})
</script>
```

#### AI 视角：快照中的完整能力图

```javascript
__AI_MIND__.snapshot()
// {
//   auth: {
//     identity: 'user@example.com',
//     currentRole: 'vip',
//     delegation: {
//       scope: ['public', 'delegated'],
//       expiresAt: '2026-03-01T00:00:00Z',
//       grantedVia: 'browser-session',
//     }
//   },
//   capabilities: [
//     { action: 'search',         level: 'public',     allowed: true },
//     { action: 'playVideo',      level: 'delegated',  allowed: true, quality: '4K' },
//     { action: 'deletePlaylist', level: 'confirm',    allowed: true, needsConfirm: true },
//     { action: 'bindPayment',    level: 'human-only', allowed: false, reason: '需要用户亲自操作' },
//   ]
// }
```

AI 看到这个快照就完全清楚：
- 我能搜索、能播放 4K（因为是 VIP）
- 删除播放列表需要弹框让用户确认
- 绑定支付我做不了，告诉用户自己去操作

### 认证的获取：委托而不是登录

关键设计：**AI 不需要"登录"，需要的是"委托"**。

```
传统模型：  AI 拿着用户名密码去登录 ── 危险、不可控

委托模型：  人类登录 → 生成委托令牌 → AI 携带令牌操作
            │
            ├── 范围受限：只能做被授权的事
            ├── 时间受限：令牌会过期
            ├── 可撤销：人随时可以收回
            └── 可审计：每个操作都有记录
```

#### 在自己电脑上（最常见场景）

用户已经在浏览器里登录了。最自然的委托方式：**AI 使用用户已有的浏览器会话**。

这不是"偷 Cookie"，是**用户主动授权 AI 使用自己的会话**——和你允许一个 App 访问你的浏览器书签一样自然。

```
用户在 Safari 中已登录 B 站
    │
    ▼
vue-mind 运行时检测到登录态 ──→ 快照包含 auth 信息
    │
    ▼
AI 在已认证的页面上下文中操作 ──→ 天然继承用户身份
    │
    ▼
等价于用户亲自在页面上点击 ──→ 体验一致，安全可控
```

#### 跨应用/跨服务（标准化方向）

IETF 正在推的两个标准正是这个思路：

**AAP（Agent Authorization Profile）— 2026 年 2 月草案**

基于 OAuth 2.0 扩展，核心概念是**结构化委托**：

```json
{
  "agent_id": "vue-mind-agent",
  "agent_type": "llm",
  "principal": "user@example.com",
  "capabilities": ["read:video", "control:playback"],
  "constraints": { "domains": ["bilibili.com"], "rate_limit": "100/hour" },
  "task_id": "watch-video-001",
  "oversight": "human-in-the-loop"
}
```

**Transaction Tokens — 多 Agent 链路**

当 AI Agent A 调用 AI Agent B 时，委托链可追溯：

```
人 → Agent A (token: 人授权A) → Agent B (token: 人授权A→A委托B) → 服务
                                                                   │
                                               服务看到完整链路：谁发起、谁执行、授权范围
```

### 对应用开发者的建议

如果你现在要开发一个 AI 时代的 Web 应用：

| 原则 | 做法 |
|---|---|
| **操作分级** | 每个 API / 组件动作声明 authLevel（public → delegated → confirm → human-only） |
| **支持委托身份** | 认证系统除了认"人"，也认"AI 代表人"。JWT 中加 `actor` 和 `principal` 字段 |
| **Session 可共享** | 浏览器已登录的 Session 可以被同设备的 AI 使用（用户授权后） |
| **降级而非拒绝** | 没有 VIP 不是"禁止访问"，而是"可以看 480p"。告诉 AI 降级体验是什么 |
| **确认走 Channel** | 需要人确认的操作，通过 vue-mind Channel 弹框等 Promise resolve，不要用 CAPTCHA |
| **审计链路** | 记录每个操作是人做的还是 AI 做的，用什么委托令牌，做了什么 |

### 核心原则

> **AI 不是一个需要"登录"的新用户，它是已登录用户的延伸。认证系统应该识别委托关系，而不是要求 AI 证明自己是人。**

```
错误思路：AI 怎么通过验证码？AI 怎么按指纹？AI 怎么扫码？
正确思路：人已经验证过了，怎么安全地让 AI 代理人操作？
```

这是 Web 认证从"证明你是人"到"证明你被人授权"的范式转移。

### 技术选型优先级：现在开发 Web 应用该选什么

如果你现在要开发一个同时对人和 AI 友好的 Web 应用，推荐按以下优先级实现：

#### 整体架构

两条路径，汇聚到同一个能力模型：

```
人类路径：  Passkey（WebAuthn）→ Session → OAuth Token（完整权限）
                                                    │
                                                    ▼
                                         统一的能力访问控制
                                                    ▲
                                                    │
AI 路径：   人类授权委托 → 受限 OAuth Token → 限定能力 → 限定时间
```

#### P0 — 必须做（基础设施）

**1. Passkeys（WebAuthn）— 人类认证的终极方案**

```
优先级：★★★★★
人类友好：★★★★★（按指纹就行，比密码快 2 倍）
AI 友好：★☆☆☆☆（AI 做不了，但不需要——这是人类入口）
成熟度：★★★★★（Google/Apple/Microsoft 全面支持，2026 采用率 >50%）
```

Passkeys 是人类登录的最优解：防钓鱼、无密码、跨设备同步。

关键：**Passkeys 不是 AI 的障碍，而是信任的起点**。人通过 Passkey 证明身份后，才能给 AI 颁发委托令牌。

```
人按指纹 → 身份确认 → 颁发 delegation token → AI 拿着 token 操作
     ↑                                              │
     这一步只有人能做（正确的）                        这一步 AI 可以做（正确的）
```

**2. OAuth 2.1 + OIDC — Token 基础设施**

```
优先级：★★★★★
人类友好：★★★★☆（用户无感，授权页点一下）
AI 友好：★★★★★（Token 传递天然适合非人类 Actor）
成熟度：★★★★★（行业标准，所有云平台支持）
```

OAuth 2.1 是整个 auth 体系的骨架。关键改进（相比 2.0）：
- 强制 PKCE（防授权码劫持）
- 移除 Implicit Flow（不安全）
- Refresh Token 必须绑定客户端

**这是人和 AI 共用的基础设施**：人通过 Passkey 获得 Session → Session 换 OAuth Token → Token 可以分发给 AI。

**3. 能力模型（Capability-based Access Control）— 替代角色模型**

```
优先级：★★★★★
人类友好：★★★★☆
AI 友好：★★★★★（AI 天然理解结构化能力列表）
成熟度：★★★☆☆（理念成熟，但大多数应用还在用 RBAC）
```

传统 RBAC（角色访问控制）：`user.role === 'vip'` → 允许。AI 不理解"VIP"意味着什么。

能力模型：

```json
{
  "capabilities": {
    "video.play": { "maxQuality": "4K" },
    "video.download": false,
    "playlist.create": true,
    "playlist.delete": { "requireConfirm": true }
  }
}
```

AI 直接看到：能播 4K、不能下载、能建播放列表、删除要确认。

#### P1 — 应该做（AI 友好层）

**4. 委托令牌（Delegation Token / AAP 模式）**

```
优先级：★★★★☆
人类友好：—（对人透明，不感知）
AI 友好：★★★★★
成熟度：★★☆☆☆（IETF 草案阶段，但概念可先自行实现）
```

人类授权后，给 AI 一个受限 Token：

```javascript
// 人类在设置页面点击"授权 AI 助手"
const delegationToken = await createDelegation({
  agent: 'vue-mind-agent',
  scope: ['video.play', 'playlist.create'],
  expiresIn: '7d',
  constraints: { rateLimit: '100/hour' },
})
```

AAP 标准还在草案阶段，但你现在就可以按这个模式设计 JWT claims。等标准落地时改动最小。

**5. Channel 确认机制（vue-mind 的 defineAIAction + confirm）**

```
优先级：★★★★☆
人类友好：★★★★★（和普通确认框体验一致）
AI 友好：★★★★★（Promise 驱动，拿到真实结果）
成熟度：★★★★☆（vue-mind 已实现）
```

Level 2（实时确认）操作的最佳实现。AI 调用 → 弹确认框 → 用户点确认 → Promise resolve → AI 拿到结果。不需要额外的 auth 机制，复用 UI 交互本身作为确认。

#### P2 — 可以做（生态兼容）

**6. MCP Auth — 工具生态互通**

```
优先级：★★★☆☆
AI 友好：★★★★★
成熟度：★★★☆☆
```

如果你的应用要接入 MCP 生态（让 Claude/GPT 等 Agent 直接调用），需要实现 MCP 的 OAuth 2.1 认证流程。本质上就是 P0 的 OAuth 2.1 加上 MCP 特定的 metadata discovery。

**7. Transaction Tokens — 多 Agent 协作**

```
优先级：★★☆☆☆（除非你做多 Agent 平台）
AI 友好：★★★★★
成熟度：★★☆☆☆
```

当 Agent A 调用 Agent B 时传递授权链。大多数应用当前不需要。

#### 不推荐 / 应淘汰

| 技术 | 问题 |
|---|---|
| **密码 + 短信验证码** | 最弱安全性，AI 无法操作短信，SIM 卡可劫持 |
| **CAPTCHA / reCAPTCHA** | 专门反 AI，但也严重损害人类体验。用 Passkey 替代 |
| **SAML** | 复杂、XML、企业遗产。用 OIDC 替代 |
| **OAuth 2.0 Implicit Flow** | 已被 OAuth 2.1 废弃，不安全 |
| **自定义 Session Token** | 没有标准化，无法被 AI 工具链理解。用 JWT + OAuth 替代 |

#### 总结：推荐技术栈

```
┌─────────────────────────────────────────────┐
│           能力模型（Capability-based）          │  ← 核心：替代 RBAC
├─────────────────────────────────────────────┤
│  人类入口           │  AI 入口               │
│  Passkeys           │  Delegation Token     │  ← 两条路径
│  (WebAuthn)         │  (AAP / JWT)          │
├─────────────────────┴───────────────────────┤
│              OAuth 2.1 + OIDC                │  ← 统一 Token 基础设施
├─────────────────────────────────────────────┤
│  Channel Confirm    │  MCP Auth             │  ← 交互层
│  (vue-mind)         │  (工具生态)            │
└─────────────────────────────────────────────┘
```

**一句话**：用 Passkeys 让人登录，用 OAuth 2.1 管 Token，用能力模型控权限，用委托令牌授权 AI，用 Channel 确认敏感操作。

### AI 凭证管理器（AI Credential Manager）

上面解决了"应用侧怎么设计认证"，但还有一个更实际的问题：**AI 怎么管理跨网站、跨账号、跨设备的凭证？**

本质上需要一个 **"1Password for AI"**——统一保险箱 + 每站独立凭证 + 智能匹配 + 健康监控 + 跨设备同步。

#### 社区现有方案

| 项目 | 核心思路 | 协议 |
|---|---|---|
| [Keychains.dev](https://keychains.dev/) | SSH 密钥身份 + 服务端凭证注入，AI 永远不接触原始密码 | 商业 |
| [AgentVault](https://secureagenttools.github.io/AgentVault/) | 开源多 Agent 凭证管理，含注册发现 + KeyManager | Apache 2.0 |
| [Authed Identity](https://github.com/authed-dev/authed-identity) | Agent-to-Agent 加密身份认证协议，消除静态凭证 | MIT |
| [Agent Identity Management](https://github.com/opena2a-org/agent-identity-management) | 非人类身份（NHI）平台，加密身份 + 治理 + 访问控制 | Apache 2.0 |

#### 问题一：AI 怎么知道在哪个网站用什么登录？

三层发现机制，逐级降级：

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: 标准自动发现（最优）                         │
│  GET /.well-known/oauth-authorization-server         │
│  → 返回支持的 auth 方法、端点、scope 等                │
│  → Google、GitHub、Microsoft 等已支持                 │
│  → 基于 RFC 8414 OAuth 2.0 Authorization Metadata    │
├─────────────────────────────────────────────────────┤
│  Layer 2: 社区注册表（兜底）                           │
│  → 类似 browserslist / caniuse 的社区维护数据库         │
│  → 覆盖不支持标准发现的网站（B站、腾讯视频、抖音等）      │
│  → 格式：{ host, authMethod, fields, refreshStrategy } │
├─────────────────────────────────────────────────────┤
│  Layer 3: AI 自学习（补充）                            │
│  → 首次访问未知网站时，AI 分析登录页 DOM 结构            │
│  → 识别表单字段、OAuth 按钮、二维码等                   │
│  → 记录并缓存到本地注册表供下次使用                      │
└─────────────────────────────────────────────────────┘
```

社区注册表数据格式示例：

```jsonc
{
  "bilibili.com": {
    "authMethod": "cookie-session",
    "credentials": ["SESSDATA", "bili_jct", "DedeUserID"],
    "loginUrl": "https://passport.bilibili.com/login",
    "sessionCheck": "https://api.bilibili.com/x/web-interface/nav",
    "sessionCheckField": "data.isLogin",
    "refreshStrategy": "browser-relogin" // Cookie 过期只能重新浏览器登录
  },
  "github.com": {
    "authMethod": "oauth2",
    "discovery": "https://github.com/.well-known/oauth-authorization-server",
    "alternativeAuth": ["personal-access-token"],
    "tokenRefresh": true
  }
}
```

#### 问题二：统一认证还是独立？

**统一保险箱 + 每站独立凭证**。和密码管理器完全一样的架构：

```
主密钥（生物识别 / Passkey / 主密码）
    │
    ▼ 解锁
┌─────────────────────────────────┐
│  加密凭证保险箱                    │
│  ├── bilibili: {SESSDATA, ...}  │
│  ├── github: {PAT: ghp_xxx}    │
│  ├── gmail: {refresh_token}     │
│  ├── npm: {automation_token}    │
│  └── ...                        │
└─────────────────────────────────┘
```

不可能做到"一个凭证走天下"——每个网站的认证系统完全不同。但可以做到 **"一个入口管所有凭证"**。AI 只需要有保险箱的访问权，保险箱负责按网站匹配和注入凭证。

推荐底层存储方案：

| 方案 | 优势 | 劣势 |
|---|---|---|
| **OS Keychain**（macOS Keychain / Windows Credential Manager） | 原生加密，生物识别解锁，零额外依赖 | 跨平台不统一 |
| **Bitwarden API** | 开源可自建，API 完善，跨平台 | 需要额外部署 |
| **加密 JSON 文件** | 最简单，可版本控制 | 安全性依赖加密实现 |

#### 问题三：多账号怎么办？

**Profile（上下文配置）机制**——类似 Chrome 多用户 / Git 条件配置：

```
AI Credential Manager
├── Profile: "个人"
│   ├── github: personal account (ghp_aaa)
│   ├── bilibili: 个人号 (SESSDATA_xxx)
│   └── gmail: personal@gmail.com (refresh_token_a)
│
├── Profile: "工作"
│   ├── github: work org account (ghp_bbb)
│   ├── npm: @company scope (npm_token_yyy)
│   └── gmail: me@company.com (refresh_token_b)
│
└── Profile: "副业"
    ├── github: side-project account (ghp_ccc)
    └── ...
```

AI 在执行任务时智能匹配上下文：

```
"帮我推送 vue-mind 代码" 
  → 检测 repo remote: github.com/vafast/vue-mind
  → 匹配到 "工作" Profile 的 GitHub 凭证
  → 自动使用 ghp_bbb

"帮我看看 B 站收藏" 
  → bilibili.com 只在 "个人" Profile 有凭证
  → 自动使用个人号

"帮我推送到 github.com/xxx/yyy"
  → 多个 Profile 都有 GitHub 凭证
  → 无法确定 → 询问用户："你想用哪个 GitHub 账号？"
```

匹配规则优先级：

```
1. 任务上下文精确匹配（repo owner / org 对应的 Profile）
2. 域名唯一匹配（该域名只有一个 Profile 有凭证）
3. 默认 Profile（用户设置的默认上下文）
4. 交互询问（以上都匹配不了时，问用户）
```

#### 问题四：改了密码怎么办？

**健康监控 + 自动刷新 + 优雅降级**：

```
┌──────────────┐    正常     ┌──────────────┐
│  凭证正常      │ ─────────→ │  正常使用      │
│  (healthy)    │            │              │
└──────┬───────┘            └──────────────┘
       │
       │ 请求返回 401/403
       │ 或 Token 即将过期
       ▼
┌──────────────┐   可刷新    ┌──────────────┐
│  检测到异常    │ ─────────→ │  自动刷新      │ ──→ 恢复正常
│              │            │  (OAuth)      │
└──────┬───────┘            └──────────────┘
       │
       │ 不可自动恢复（Cookie 过期 / 密码已改 / Token 吊销）
       ▼
┌──────────────┐   通知用户   ┌──────────────┐
│  标记为失效    │ ─────────→ │  请求重新认证   │
│  (expired)   │            │  "你的 B 站    │
└──────────────┘            │   登录已过期"   │
                            └──────┬───────┘
                                   │ 用户在浏览器重新登录
                                   ▼
                            ┌──────────────┐
                            │  提取新凭证    │ ──→ 更新保险箱 → 恢复
                            │  更新存储      │
                            └──────────────┘
```

按凭证类型的处理策略：

| 凭证类型 | 密码修改影响 | 恢复方式 |
|---|---|---|
| **OAuth refresh_token** | 密码改了 token 不一定失效（取决于服务商） | 自动 refresh；失败则重新授权 |
| **Personal Access Token** | 密码改了 PAT 不受影响 | 只有主动吊销才失效 |
| **Cookie Session** | 改密码通常导致所有 Session 失效 | 必须用户重新浏览器登录 |
| **API Key** | 通常不受密码影响 | 只有主动轮换才失效 |
| **Automation Token** | 同 API Key | 同上 |

健康检测机制：

```javascript
// 凭证管理器的健康检查循环
async function healthCheck(credential) {
  const result = await credential.sessionCheck() // 调各站的验证接口

  if (result.status === 'valid') {
    credential.lastChecked = Date.now()
    return
  }

  if (result.status === 'expiring' && credential.canRefresh) {
    await credential.refresh() // OAuth 自动刷新
    return
  }

  // 不可恢复 → 标记失效，通知用户
  credential.status = 'expired'
  notifyUser(`${credential.service} 的登录已过期，请重新登录`)
}
```

#### 问题五：多设备怎么同步？（Mac / Windows / 手机）

这是最复杂的问题。核心原则：**分层同步——可同步的同步，不该同步的不同步**。

```
┌─────────────────────────────────────────────────────┐
│                 可以跨设备同步                         │
│  ├── OAuth refresh_token  ← 有时效，泄露风险可控       │
│  ├── API Key / PAT        ← 可限 scope，可随时吊销     │
│  ├── Automation Token     ← 同上                      │
│  └── Service Registry     ← 非敏感的网站认证方式映射     │
├─────────────────────────────────────────────────────┤
│                 不应该跨设备同步                        │
│  ├── Cookie Session       ← 绑定设备/IP指纹，同步无意义 │
│  ├── WebAuthn Passkey     ← OS 原生同步（iCloud/Google）│
│  └── 主解锁密钥           ← 每设备独立，生物识别不可传输  │
└─────────────────────────────────────────────────────┘
```

三种同步方案对比：

**方案 A：依赖 OS 原生同步（推荐 Apple 用户）**

```
Mac ──── iCloud Keychain ──── iPhone
              │
              └── Passkeys 自动同步
              └── 凭证存在 Keychain，iCloud 加密同步
              └── Windows 无法参与
```

- 优势：零额外工具，端到端加密，生物识别解锁
- 劣势：生态锁定，Windows/Android 无法加入

**方案 B：密码管理器 API 同步（推荐跨平台用户）**

```
Mac ────┐
        │
Windows ├──── Bitwarden / 1Password ──── 加密同步
        │         (自建或云端)
手机  ───┘
```

```javascript
// AI Credential Manager 集成 Bitwarden 示例
const credential = await bitwarden.getItem({
  service: 'github.com',
  profile: 'work',
})
// Bitwarden 在所有设备同步，AI 各设备拿到的凭证一致
```

- 优势：真正跨平台，一处修改全设备同步
- 劣势：依赖第三方（可自建 Vaultwarden）

**方案 C：自建加密同步（推荐极客/企业）**

```
各设备 ──→ 加密凭证文件 ──→ Git / S3 / WebDAV ──→ 各设备拉取
                                                    │
                                  每台设备用本地主密钥解密
```

- 优势：完全自主可控
- 劣势：需要自己实现加密、冲突解决、同步逻辑

**推荐组合方案：**

```
┌─────────────────────────────────────────────────────────┐
│  同步层选择（按场景）                                       │
│                                                          │
│  Apple 全家桶用户 → macOS Keychain + iCloud               │
│  跨平台用户      → Bitwarden API（自建 Vaultwarden 可选）  │
│  企业用户        → HashiCorp Vault + 企业 SSO              │
│                                                          │
│  所有方案共同点：                                           │
│  ├── Passkey 由 OS 原生同步（不需要管）                     │
│  ├── Cookie 不同步（每设备各自浏览器登录）                   │
│  ├── Token 类凭证通过上述方案同步                           │
│  └── 每台设备各自的 AI Agent 共享同一个凭证库                │
└─────────────────────────────────────────────────────────┘
```

#### 完整架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Credential Manager                     │
│                  （AI 凭证管理器 — 完整架构）                   │
├──────────────┬──────────────┬───────────────┬───────────────┤
│ Service      │ Credential   │ Health        │ Sync          │
│ Registry     │ Store        │ Monitor       │ Layer         │
│ 网站认证注册表 │ 加密凭证保险箱 │ 健康监控       │ 跨设备同步     │
├──────────────┼──────────────┼───────────────┼───────────────┤
│ RFC 8414     │ OS Keychain  │ 定期心跳       │ iCloud        │
│ 自动发现      │ 或 Bitwarden │ Token 自刷新   │ Keychain      │
│              │              │               │               │
│ 社区注册表    │ Profile 多   │ 401 检测       │ Bitwarden     │
│ (caniuse式)  │ 账号隔离      │ 自动标记失效    │ API 同步      │
│              │              │               │               │
│ AI 自学习    │ 加密存储      │ 通知用户       │ 或自建        │
│ DOM 分析     │ 生物识别解锁  │ 重新认证       │ 加密同步      │
├──────────────┴──────────────┴───────────────┴───────────────┤
│                      Profile Matcher                        │
│               （上下文智能匹配 — 自动选账号）                   │
│  task context → repo/domain/org → profile → credential      │
└─────────────────────────────────────────────────────────────┘
```

**一句话总结**：统一保险箱存独立凭证，Profile 隔离多账号，三层发现识别网站认证方式，健康监控自动续期和报警，Token 可跨设备同步但 Cookie 不同步。

### 自有应用认证选型：落地方案

上面讨论了理想架构，这里给出 **"今天就开始写代码"** 的具体选型和实现路径。

#### 推荐技术栈

```
┌───────────────────────────────────────────────────────────┐
│                        自有应用完整 Auth 技术栈              │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  前端：Vue 3 + vue-mind                                    │
│  后端：Node.js（Hono / Express / Nitro 均可）               │
│  认证库：Better Auth  ← 核心选择                             │
│  Passkey：Better Auth Passkey Plugin（内置 SimpleWebAuthn）  │
│  数据库：PostgreSQL / SQLite（Better Auth 直接对接）          │
│  AI 委托：自定义 Better Auth Plugin                          │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

#### 为什么选 Better Auth？

对比主流方案：

| 方案 | 自主可控 | AI 友好 | Vue 支持 | Passkey | 复杂度 | 推荐度 |
|---|---|---|---|---|---|---|
| **Better Auth** | ★★★★★ 完全自有 | ★★★★★ 可自定义 | ★★★★★ 原生 | ★★★★★ 插件 | ★★★☆☆ | **首选** |
| Logto OSS | ★★★★★ 自建 | ★★★★☆ | ★★★☆☆ | ★★★★☆ | ★★☆☆☆ 需运维 | 企业级备选 |
| Supabase Auth | ★★★☆☆ 绑平台 | ★★★☆☆ | ★★★☆☆ | ★★★☆☆ | ★★★★★ 简单 | 快速原型 |
| Clerk | ★★☆☆☆ SaaS | ★★☆☆☆ | ★★★☆☆ | ★★★★☆ | ★★★★★ | 不推荐自有 |
| Auth.js | ★★★★☆ | ★★☆☆☆ | ★★☆☆☆ Next 为主 | ★★★☆☆ | ★★★☆☆ | Vue 不适合 |
| 自己撸 | ★★★★★ | ★★★★★ | ★★★★★ | ★★☆☆☆ 工作量大 | ★☆☆☆☆ | 不推荐 |

Better Auth 的核心优势：

1. **TypeScript-first**：类型推断到 Session、User、自定义字段，不需要 `as`
2. **Vue 原生客户端**：`better-auth/vue` 提供 `useSession()` 等响应式 API
3. **Passkey 开箱即用**：`@better-auth/passkey` 插件，底层是 SimpleWebAuthn
4. **插件系统**：可以写自定义插件实现 AI 委托令牌、能力模型，不需要 fork
5. **数据库直连**：不需要额外的 auth 服务器，直接连你的 PostgreSQL/SQLite
6. **零平台绑定**：数据完全在你手里，随时可迁移

#### 实现路径：分三步

**第一步：基础认证（1-2 天）**

安装和配置 Better Auth，实现人类登录：

```bash
# 安装
pnpm add better-auth @better-auth/passkey
```

服务端配置：

```typescript
// server/auth.ts
import { betterAuth } from 'better-auth'
import { passkey } from '@better-auth/passkey'
import Database from 'better-sqlite3'

export const auth = betterAuth({
  database: new Database('./app.db'),

  // 邮箱密码（兜底，但不推荐主力）
  emailAndPassword: { enabled: true },

  // Passkey（推荐主力登录方式）
  plugins: [
    passkey({
      rpID: 'yourdomain.com',
      rpName: 'Your App',
      origin: 'https://yourdomain.com',
    }),
  ],
})
```

Vue 客户端：

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/vue'
import { passkeyClient } from '@better-auth/passkey/client'

export const authClient = createAuthClient({
  plugins: [passkeyClient()],
})
```

在 Vue 组件中使用：

```vue
<script setup lang="ts">
import { authClient } from '@/lib/auth-client'

const session = authClient.useSession()

// 注册 Passkey（按指纹）
function registerPasskey() {
  authClient.passkey.register({ name: 'My MacBook' })
}

// Passkey 登录（按指纹）
function loginWithPasskey() {
  authClient.passkey.authenticate()
}
</script>
```

此时你的应用已经支持：Passkey 按指纹登录 + 邮箱密码兜底 + Session 管理。

**第二步：AI 委托层（1-2 天）**

写一个 Better Auth 自定义插件，实现 AI delegation token：

```typescript
// server/plugins/ai-delegation.ts
import { createAuthEndpoint } from 'better-auth/api'
import type { BetterAuthPlugin } from 'better-auth'
import { z } from 'zod'

/**
 * AI 委托令牌插件
 * 已登录用户可以给 AI 颁发受限 token
 */
export function aiDelegation(): BetterAuthPlugin {
  return {
    id: 'ai-delegation',

    // 扩展数据库：存储委托令牌
    schema: {
      delegationToken: {
        fields: {
          userId: { type: 'string', required: true, references: { model: 'user', field: 'id' } },
          agentId: { type: 'string', required: true },
          capabilities: { type: 'string', required: true }, // JSON 能力列表
          expiresAt: { type: 'date', required: true },
          revoked: { type: 'boolean', defaultValue: false },
        },
      },
    },

    endpoints: {
      // 颁发委托令牌（需要已登录）
      createDelegation: createAuthEndpoint(
        '/ai/delegate',
        { method: 'POST', body: z.object({
          agentId: z.string(),
          capabilities: z.array(z.string()),
          expiresIn: z.string().default('7d'),
        })},
        async (ctx) => {
          const session = ctx.context.session
          if (!session) return ctx.json({ error: 'unauthorized' }, { status: 401 })

          const token = await ctx.context.adapter.create({
            model: 'delegationToken',
            data: {
              userId: session.user.id,
              agentId: ctx.body.agentId,
              capabilities: JSON.stringify(ctx.body.capabilities),
              expiresAt: computeExpiry(ctx.body.expiresIn),
              revoked: false,
            },
          })

          return ctx.json({ token: token.id, expiresAt: token.expiresAt })
        },
      ),

      // 验证委托令牌（AI 调用 API 时用）
      verifyDelegation: createAuthEndpoint(
        '/ai/verify',
        { method: 'POST', body: z.object({ token: z.string() }) },
        async (ctx) => {
          const record = await ctx.context.adapter.findOne({
            model: 'delegationToken',
            where: [{ field: 'id', value: ctx.body.token }],
          })

          if (!record || record.revoked || new Date(record.expiresAt) < new Date()) {
            return ctx.json({ valid: false }, { status: 401 })
          }

          return ctx.json({
            valid: true,
            userId: record.userId,
            agentId: record.agentId,
            capabilities: JSON.parse(record.capabilities),
          })
        },
      ),
    },
  }
}
```

然后在 auth 配置中加入：

```typescript
// server/auth.ts
import { aiDelegation } from './plugins/ai-delegation'

export const auth = betterAuth({
  // ...之前的配置
  plugins: [
    passkey({ /* ... */ }),
    aiDelegation(), // 加上 AI 委托
  ],
})
```

**第三步：能力模型 + vue-mind 集成（2-3 天）**

在 Vue 组件中声明每个操作的认证等级，vue-mind 自动暴露给 AI：

```vue
<script setup lang="ts">
import { defineAIAction } from '@vue-mind/runtime'

// public — 不需要任何认证
defineAIAction('search', {
  description: '搜索视频',
  authLevel: 'public',
  params: { keyword: 'string' },
  handler: (params) => searchVideos(params.keyword),
})

// delegated — AI 有委托令牌就能操作
defineAIAction('play-video', {
  description: '播放视频',
  authLevel: 'delegated',
  capabilities: ['video.play'],
  params: { videoId: 'string' },
  handler: (params) => playVideo(params.videoId),
})

// confirm — AI 发起，但需要用户实时确认
defineAIAction('delete-playlist', {
  description: '删除播放列表',
  authLevel: 'confirm',
  capabilities: ['playlist.delete'],
  params: { playlistId: 'string' },
  handler: async (params) => {
    const confirmed = await showConfirmDialog('确定删除这个播放列表？')
    if (!confirmed) throw new Error('用户取消')
    return deletePlaylist(params.playlistId)
  },
})

// human-only — 必须人类亲自操作
defineAIAction('change-password', {
  description: '修改密码',
  authLevel: 'human-only',
  handler: () => { throw new Error('此操作需要人类亲自完成') },
})
</script>
```

AI 拿到的页面快照会包含完整的能力图谱：

```jsonc
{
  "actions": [
    { "name": "search", "authLevel": "public", "aiCanCall": true },
    { "name": "play-video", "authLevel": "delegated", "aiCanCall": true,
      "requiredCapabilities": ["video.play"] },
    { "name": "delete-playlist", "authLevel": "confirm", "aiCanCall": true,
      "requiresUserConfirm": true },
    { "name": "change-password", "authLevel": "human-only", "aiCanCall": false }
  ],
  "currentUser": { "id": "u_123", "capabilities": ["video.play", "playlist.*"] },
  "aiAgent": { "id": "vue-mind-agent", "delegatedCapabilities": ["video.play"] }
}
```

AI 看到这个快照就完全知道：哪些能调、哪些要确认、哪些碰都不要碰。

#### 完整架构图

```
用户（人类）                        AI Agent
    │                                 │
    │ 按指纹 / Passkey                │
    ▼                                 │
┌──────────┐                          │
│ Better   │── Session ──┐            │
│ Auth     │             │            │
│ Passkey  │             │            │
└──────────┘             │            │
                         ▼            │
                   ┌───────────┐      │
                   │ /ai/      │      │
                   │ delegate  │ ←────┘ AI 用 delegation token 调 API
                   │           │
                   │ 颁发受限   │
                   │ token     │
                   └─────┬─────┘
                         │
                         ▼
                   ┌───────────┐
                   │ Capability │
                   │ Check     │
                   │           │
                   │ token 有   │
                   │ video.play │──→ 允许播放
                   │ 没有       │
                   │ playlist.  │──→ 拒绝删除
                   │ delete     │
                   └───────────┘
```

#### 关于 OAuth 社交登录

如果你的应用还需要支持"用 Google 登录""用 GitHub 登录"，Better Auth 也原生支持：

```typescript
export const auth = betterAuth({
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  plugins: [passkey(), aiDelegation()],
})
```

用户可以选择：Passkey 按指纹 / Google 登录 / GitHub 登录 / 邮箱密码。登录后统一走 Session → Delegation Token 流程给 AI。

#### 时间估算

| 阶段 | 内容 | 时间 |
|---|---|---|
| **Step 1** | Better Auth + Passkey + 基本登录页 | 1-2 天 |
| **Step 2** | AI 委托插件 + delegation token | 1-2 天 |
| **Step 3** | 能力模型 + defineAIAction authLevel | 2-3 天 |
| **Step 4** | vue-mind 快照集成认证状态 | 1 天 |
| **总计** | 完整的人 + AI 双友好认证系统 | **5-8 天** |

### 自有 Agent + 自有应用：最短路径方案

上面的 Better Auth 方案是为 **"开放给第三方 AI/用户"** 设计的完整认证系统。但如果当前目标是 **自己的 Agent 操控自己的应用**，需要一个完全不同的思维模式：

> **当 Agent 和应用都是你的、跑在同一台机器上时，"连接本身就是认证"。不要过度工程化。**

#### 思维模式对比

```
通用方案（对外开放）：
  用户 → 登录 → Session → 颁发 Token → AI 拿 Token → API 鉴权 → 能力检查
  复杂度：★★★★★

自有方案（自己用）：
  我的 Agent → 连上我的应用 → 直接操作
  复杂度：★☆☆☆☆
```

类比：你在自己家里不需要每开一扇门都刷门禁卡。你的电脑上 VS Code 操作文件不需要"登录文件系统"——进程身份就是认证。Agent 也应该如此。

#### 三层架构，逐步升级

```
┌────────────────────────────────────────────────────────────────┐
│ Level 0 — Electron IPC（Agent 和应用在同一进程）                 │
│ 适用：Agent 就是你的 Electron 应用的一部分（如 smart-finder）     │
│ 认证：无需。同进程 = 完全信任                                    │
│ 复杂度：零                                                      │
├────────────────────────────────────────────────────────────────┤
│ Level 1 — Local Channel（Agent 和 Web 应用在同机不同进程）       │
│ 适用：Agent 是独立进程，应用跑在浏览器里（Vue + vue-mind）        │
│ 认证：localhost + 一次性握手 token（OS Keychain 共享）            │
│ 复杂度：低                                                      │
├────────────────────────────────────────────────────────────────┤
│ Level 2 — Remote Channel（Agent 和应用跨设备）                   │
│ 适用：Mac 上的 Agent 操控手机上的应用                             │
│ 认证：Better Auth + Delegation Token（上一节方案）               │
│ 复杂度：高，但只在需要时引入                                     │
└────────────────────────────────────────────────────────────────┘
```

**关键原则：从 Level 0 开始，不要跳级。** 大多数个人场景在 Level 1 就能完美覆盖。

#### Level 0：Electron IPC（零认证）

你的 `smart-finder` 已经在用这个模式：

```
┌───────────────────────────────────────┐
│  smart-finder (Electron)              │
│                                       │
│  ┌──────────┐     ┌──────────────┐   │
│  │ 渲染进程   │ IPC │ 主进程        │   │
│  │ (Vue UI)  │◄───►│ (Agent 逻辑) │   │
│  └──────────┘     └──────┬───────┘   │
│                          │            │
│                  Safari WebDriver     │
│                  AppleScript          │
│                          │            │
│                    ┌─────▼─────┐      │
│                    │ 外部网站   │      │
│                    │ B站/腾讯   │      │
│                    │ (复用浏览器 │      │
│                    │  Cookie)   │      │
│                    └───────────┘      │
└───────────────────────────────────────┘
```

优势：
- Agent 逻辑在主进程，UI 在渲染进程，Electron IPC 天然双向通信
- 操作外部网站走 Safari WebDriver + Cookie，和真人行为完全一致（你的 `biliApi.ts` 已经这么做了）
- **零认证开销**，同进程天然信任

**这就是当前最佳起点。**

#### Level 1：Local Channel（自有 Web 应用）

当你开始开发独立的 Vue Web 应用（不是 Electron），需要 Agent 从外部操控时：

```
┌────────────────────────────────────────────────────────────┐
│  你的 Mac                                                   │
│                                                             │
│  ┌─────────────────┐     WebSocket      ┌────────────────┐ │
│  │ 你的 AI Agent    │◄────(localhost)────►│ 你的 Vue App   │ │
│  │ (Node.js 进程)   │                    │ (浏览器中运行)  │ │
│  │                  │                    │                 │ │
│  │ 1. 读 Keychain   │                    │ 1. 启动时生成   │ │
│  │    拿到连接密钥   │                    │    一次性密钥    │ │
│  │ 2. 连接 WS       │                    │ 2. 存入 Keychain│ │
│  │ 3. 握手验证      │                    │ 3. 等待 Agent   │ │
│  │ 4. 操控 vue-mind │                    │ 4. Channel 通信 │ │
│  └─────────────────┘                    └────────────────┘ │
│                                                             │
│          共享：macOS Keychain（存一次性连接密钥）              │
└────────────────────────────────────────────────────────────┘
```

具体实现：

```typescript
// ============ 应用侧：Vue App 启动时 ============

import { createAIChannel } from '@vue-mind/runtime'

const channel = createAIChannel()

// 应用启动时生成一个随机连接密钥，存到固定位置
// Agent 读取这个密钥来证明"我在同一台机器上"
const connectionSecret = crypto.randomUUID()

// 方案 A：写入 OS Keychain（最安全）
// 方案 B：写入固定文件 ~/.vue-mind/channel-secret（够用）
await writeSecret('vue-mind-channel', connectionSecret)

// 启动 WebSocket 服务（仅监听 localhost）
const wss = new WebSocketServer({ host: '127.0.0.1', port: 9527 })

wss.on('connection', (ws) => {
  ws.once('message', (msg) => {
    const { secret } = JSON.parse(msg.toString())
    if (secret !== connectionSecret) {
      ws.close(4001, 'invalid secret')
      return
    }
    // 验证通过 → 桥接到 vue-mind Channel
    channel.bridgeToWebSocket(ws)
  })
})
```

```typescript
// ============ Agent 侧：连接应用 ============

// 读取应用写入的连接密钥
const secret = await readSecret('vue-mind-channel')

const ws = new WebSocket('ws://127.0.0.1:9527')
ws.onopen = () => {
  // 用密钥握手
  ws.send(JSON.stringify({ secret }))
}

ws.onmessage = (event) => {
  // 收到 vue-mind Channel 的消息
  // 可以调用 defineAIAction 定义的所有操作
  // 可以获取页面快照
  // 可以订阅状态变化
}
```

为什么只需要这么简单？

- **WebSocket 监听 127.0.0.1** → 只有本机进程能连，外部网络完全不可达
- **一次性密钥** → 防止本机其他应用意外连入（虽然概率极低）
- **密钥存 Keychain** → macOS 级别的进程隔离保护，只有你的 Agent 能读
- **不需要 OAuth、JWT、Session** → 同机两个进程，握手一次就够了

#### Level 1 对应的 vue-mind 改造

只需要给 `AIChannel` 增加 WebSocket 桥接能力：

```typescript
// @vue-mind/runtime 新增
export function createLocalServer(channel: AIChannel, options?: {
  port?: number        // 默认 9527
  secretProvider?: () => Promise<string>  // 默认 crypto.randomUUID()
}): void

// Agent SDK（新包 @vue-mind/agent）
export function connectToApp(options?: {
  port?: number
  secretProvider?: () => Promise<string>
}): AIChannel
```

Agent 拿到的 `AIChannel` 和应用内部的完全一样——同样的 `callAction`、`getSnapshot`、`subscribe`。

#### 实际场景：公网部署 + Electron 客户端

自有应用不是本地玩具——它是部署在公网的 Web 服务，用户通过浏览器或 Electron 客户端访问。这意味着 **从第一天起就需要正经认证**。

```
┌─────────────────────────────────────────────────────────────┐
│                       你的服务端（公网）                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Vue App      │  │ API Server   │  │ Better Auth  │      │
│  │ (静态资源)    │  │ (业务逻辑)    │  │ (认证服务)    │      │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘      │
│                           │                  │               │
│                    vue-mind Channel     认证 + Token          │
│                      (WSS 双向)        (Passkey/OAuth)       │
│                           │                  │               │
└───────────────────────────┼──────────────────┼───────────────┘
                            │                  │
              ┌─────────────┼──────────────────┼──────────┐
              │             │      公网         │          │
              │             │                  │          │
    ┌─────────▼──┐   ┌─────▼──────┐   ┌──────▼───────┐  │
    │ 浏览器用户  │   │ Electron   │   │ 第三方 Agent │  │
    │ (人类)     │   │ 客户端      │   │ (将来)       │  │
    │            │   │ (内置 AI   │   │              │  │
    │ Passkey 登录│   │  Agent)    │   │ Delegation   │  │
    │ Session    │   │            │   │ Token        │  │
    └────────────┘   │ 一次登录    │   └──────────────┘  │
                     │ Token 存   │                     │
                     │ OS Keychain│                     │
                     └────────────┘                     │
              └─────────────────────────────────────────┘
```

三类客户端，一套认证：

| 客户端 | 登录方式 | 凭证存储 | AI Agent 如何用 |
|---|---|---|---|
| **浏览器** | Passkey 按指纹 / OAuth 社交登录 | httpOnly Cookie | Agent 通过 vue-mind Channel（WSS）复用已有 Session |
| **Electron 客户端** | 首次启动 → 内嵌 WebView OAuth 授权 → 拿 Token | OS Keychain（macOS/Windows） | Agent 直接用 Keychain 中的 Token 调 API |
| **第三方 Agent** | Delegation Token（人类授权后颁发） | Agent 自行管理 | 受限 Token + 能力模型 |

#### 核心流程：Electron 客户端（内置 AI Agent）

这是你最主要的场景——Electron 客户端里跑 AI Agent，通过公网调你的服务：

```
首次启动（仅一次）：
──────────────────
用户打开 Electron App
    │
    ▼
Electron 弹出 OAuth 授权页（系统浏览器 / 内嵌 WebView）
    │ 用户 Passkey 按指纹 / Google 登录 / 邮箱密码
    ▼
服务端返回 { accessToken, refreshToken }
    │
    ▼
Electron 存入 OS Keychain
    │  macOS: Keychain Access
    │  Windows: Credential Manager
    ▼
完成。用户永远不需要再登录（除非主动登出）


日常使用：
──────────
Electron 启动
    │
    ▼ 从 Keychain 读取 Token
    │
    ├──→ AI Agent 调用后端 API
    │    headers: { Authorization: `Bearer ${accessToken}` }
    │
    ├──→ AI Agent 连接 vue-mind Channel（WSS）
    │    wss://yourapp.com/channel?token=xxx
    │
    ├──→ Token 快过期？自动用 refreshToken 换新的
    │    无感续期，用户完全不知道
    │
    └──→ refreshToken 也过期了？（比如 30 天没打开）
         弹出登录页，重新授权一次
```

#### 服务端实现（Better Auth + vue-mind Channel）

```typescript
// server/auth.ts — 认证服务
import { betterAuth } from 'better-auth'
import { passkey } from '@better-auth/passkey'

export const auth = betterAuth({
  database: postgres(process.env.DATABASE_URL),

  plugins: [
    passkey({
      rpID: 'yourapp.com',
      rpName: 'Your App',
      origin: 'https://yourapp.com',
    }),
  ],

  // Electron 客户端通过 OAuth PKCE 流程获取 Token
  session: {
    // 浏览器用户：httpOnly Cookie（自动管理）
    // Electron 用户：Bearer Token（手动传递）
    // Better Auth 两种都支持，根据请求头自动判断
  },
})
```

```typescript
// server/channel.ts — vue-mind Channel 公网版
import { WebSocketServer } from 'ws'
import { auth } from './auth'

const wss = new WebSocketServer({ noServer: true })

// HTTP Upgrade 时验证 Token
server.on('upgrade', async (request, socket, head) => {
  const url = new URL(request.url!, `https://${request.headers.host}`)

  if (url.pathname === '/channel') {
    const token = url.searchParams.get('token')
    const session = await auth.api.getSession({ headers: { authorization: `Bearer ${token}` } })

    if (!session) {
      socket.destroy()
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      // Token 合法 → 建立 Channel，注入用户身份
      const channel = createAIChannel({ user: session.user })
      channel.bridgeToWebSocket(ws)
    })
  }
})
```

```typescript
// electron/main.ts — Electron 客户端
import keytar from 'keytar'

const SERVICE_NAME = 'com.yourapp.agent'

/** 启动时获取 Token，没有则触发登录 */
async function getAccessToken(): Promise<string> {
  const stored = await keytar.getPassword(SERVICE_NAME, 'access_token')
  if (stored && !isExpired(stored)) return stored

  // 尝试刷新
  const refresh = await keytar.getPassword(SERVICE_NAME, 'refresh_token')
  if (refresh) {
    const result = await fetch('https://yourapp.com/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refresh }),
    }).then(r => r.json())

    if (result.accessToken) {
      await keytar.setPassword(SERVICE_NAME, 'access_token', result.accessToken)
      return result.accessToken
    }
  }

  // 都失败 → 弹出登录
  return showLoginWindow()
}

/** Agent 连接 vue-mind Channel */
async function connectChannel() {
  const token = await getAccessToken()
  const ws = new WebSocket(`wss://yourapp.com/channel?token=${token}`)

  // 连上就能操作：getSnapshot / callAction / subscribe
  return bridgeToChannel(ws)
}
```

#### 浏览器用户 + vue-mind Channel

浏览器用户已经有 Session Cookie，vue-mind Channel 直接复用：

```typescript
// 前端 Vue App 中（浏览器环境）
import { createAIChannel } from '@vue-mind/runtime'

const channel = createAIChannel()

// 浏览器内的 Channel 不走公网 WebSocket
// 而是直接在页面内运行——AI Agent 通过 WebMCP 或 WSS 接入后
// 调用的 action 在浏览器内执行，请求自动带 Cookie
```

#### 和"纯 Electron 本地应用"的区别

| | 纯本地（smart-finder 模式） | 公网部署 + Electron 客户端 |
|---|---|---|
| 服务端 | 无（逻辑全在本地） | 有（API + 数据库 + 认证） |
| 认证 | IPC，零认证 | Better Auth（Passkey + Token） |
| Agent 位置 | Electron 主进程内 | Electron 主进程，但调远端 API |
| 数据 | 全在本地 | 服务端存储 + 本地缓存 |
| Channel | 进程内直通 | WSS 公网连接（Token 验证） |
| 适用场景 | 个人工具 | 多用户产品 |

smart-finder 这种纯本地应用，IPC 零认证没问题。但只要有公网服务端，Better Auth + Token 就是第一天的事。

#### 实施优先级（修正版）

| 优先级 | 做什么 | 时间 |
|---|---|---|
| **P0** | Better Auth 服务端 + Passkey + OAuth | 2-3 天 |
| **P0** | vue-mind Channel WSS 公网版（Token 验证） | 1-2 天 |
| **P1** | Electron 客户端 OAuth 登录 + Keychain Token 存储 | 2-3 天 |
| **P1** | `@vue-mind/agent` SDK（Token 管理 + Channel 连接） | 1-2 天 |
| **P2** | AI Delegation Token（第三方 Agent 接入） | 按需 |
| **P2** | 能力模型（authLevel + Capability） | 按需 |

### 问题 B：操控第三方网站 — 通用浏览器桥接

`smart-finder` 现有的 Safari WebDriver + AppleScript 方案有一个硬伤：**只能在 macOS + Safari 上用**。换 Chrome 不行，换 Windows 不行，换手机更不行。

这不是一个可以忽略的问题——用户可能用 Chrome、Arc、Edge，你的 Agent 不能绑死在一个浏览器上。

#### 方案对比

| 方案 | 浏览器 | 平台 | 复用用户登录态 | 实时双向 | 复杂度 | 推荐 |
|---|---|---|---|---|---|---|
| **Safari WebDriver + AppleScript** | Safari 独占 | macOS 独占 | 是（Cookie 在浏览器内） | 否（请求/响应） | 中 | 不推荐通用 |
| **Chrome DevTools Protocol (CDP)** | Chromium 系 | 全平台 | 是（连接已有实例） | 是 | 中 | 短期首选 |
| **浏览器扩展 + Native Messaging** | 所有浏览器 | 全平台 | 是（运行在浏览器内） | 是 | 高 | 长期最优 |
| **Playwright** | Chromium/FF/WebKit | 全平台 | 部分（需 CDP 连接） | 否 | 低 | 测试场景 |
| **WebDriver BiDi** | 标准化中 | 全平台 | 是 | 是 | — | 未来标准 |

#### 推荐路径：CDP → 浏览器扩展 → WebDriver BiDi

**第一步（现在）：Chrome DevTools Protocol — 覆盖 70% 场景**

CDP 可以连接到用户已经打开的 Chrome/Edge/Arc/Brave，直接复用用户的登录态：

```
用户正常使用 Chrome，已登录 B站、GitHub 等
    │
    │ 启动时带 --remote-debugging-port=9222
    │ （或通过扩展暴露 CDP）
    ▼
┌────────────────────────────────────┐
│  Chrome（用户真实浏览器实例）         │
│  ├── Tab 1: bilibili.com (已登录)  │
│  ├── Tab 2: github.com (已登录)    │
│  └── Tab 3: ...                    │
└──────────────┬─────────────────────┘
               │ CDP WebSocket
               │ ws://127.0.0.1:9222
               ▼
┌────────────────────────────────────┐
│  你的 Agent（Node.js）              │
│                                    │
│  // 连接到用户已有的 Chrome          │
│  const browser = await chromium     │
│    .connectOverCDP('http://        │
│     localhost:9222')               │
│                                    │
│  // 拿到用户已登录的页面             │
│  const pages = browser             │
│    .contexts()[0].pages()          │
│                                    │
│  // 在 B站页面执行 JS — 带 Cookie   │
│  const result = await page         │
│    .evaluate(() =>                 │
│      fetch('/x/web-interface/nav') │
│        .then(r => r.json())        │
│    )                               │
└────────────────────────────────────┘
```

和 Safari WebDriver 方案的本质区别：

| | Safari WebDriver | CDP |
|---|---|---|
| 浏览器 | Safari 独占 | Chrome/Edge/Arc/Brave/Opera |
| 平台 | macOS 独占 | Mac/Windows/Linux |
| 通信 | HTTP 请求/响应（单向） | WebSocket（双向实时） |
| 能力 | 基本页面操作 | 网络拦截、Cookie 操控、JS 调试、性能分析… |
| 速度 | 慢（每次操作都是 HTTP 往返） | 快（持久连接、事件推送） |

CDP 的实际接入代码很简单：

```typescript
// agent/browser-bridge.ts
import { chromium } from 'playwright'

/**
 * 连接到用户已经在运行的 Chrome 浏览器
 * 要求：Chrome 启动时带 --remote-debugging-port=9222
 */
async function connectToUserBrowser() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  const context = browser.contexts()[0]!
  return context
}

/**
 * 在指定网站的已登录页面中执行 JS
 * 自动携带用户的 Cookie，和用户手动操作完全一致
 */
async function executeInSite(context: BrowserContext, url: string, script: string) {
  // 找到已打开的标签页，或新开一个
  let page = context.pages().find(p => p.url().includes(new URL(url).host))
  if (!page) {
    page = await context.newPage()
    await page.goto(url)
  }

  return page.evaluate(script)
}

// 用法：在 B站执行请求（复用 Chrome 中的登录态）
const navInfo = await executeInSite(
  context,
  'https://www.bilibili.com',
  `fetch('https://api.bilibili.com/x/web-interface/nav').then(r => r.json())`
)
```

**让用户的 Chrome 启动时带调试端口的方法：**

```bash
# macOS
open -a "Google Chrome" --args --remote-debugging-port=9222

# Windows
chrome.exe --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# 或者：修改 Chrome 快捷方式/启动脚本，永久生效
```

**第二步（中期）：浏览器扩展 — 真正的全浏览器通用**

CDP 还是有局限：只支持 Chromium 系浏览器，而且需要用户带参数启动 Chrome（不太方便）。

浏览器扩展才是终极方案：

```
┌──────────────────────────────────────────────────────────┐
│  浏览器（Chrome / Firefox / Edge / Safari）                │
│                                                           │
│  ┌─────────────────────────────────────────┐             │
│  │  AI Bridge Extension（你开发的扩展）      │             │
│  │                                          │             │
│  │  能力：                                   │             │
│  │  ├── chrome.cookies API — 读取任意 Cookie │             │
│  │  ├── chrome.tabs API — 管理标签页          │             │
│  │  ├── content script — 在页面中执行 JS     │             │
│  │  ├── chrome.webRequest — 拦截/修改请求     │             │
│  │  └── 检测登录状态、Cookie 过期              │             │
│  │                                          │             │
│  │  通信：                                   │             │
│  │  Native Messaging（和本地 Agent 通信）     │             │
│  │  或 WebSocket（ws://127.0.0.1:port）     │             │
│  └──────────────────┬──────────────────────┘             │
│                     │                                     │
└─────────────────────┼─────────────────────────────────────┘
                      │ Native Messaging (stdin/stdout)
                      │ 或 WebSocket
                      ▼
┌──────────────────────────────────────────────┐
│  你的 Agent（Node.js）                        │
│                                               │
│  agent.executeInTab('bilibili.com', script)   │
│  agent.getCookies('github.com')               │
│  agent.checkLoginStatus('bilibili.com')       │
└──────────────────────────────────────────────┘
```

为什么扩展是终极方案：

| 优势 | 说明 |
|---|---|
| **全浏览器** | Chrome、Firefox、Edge、Safari 都支持扩展（Manifest V3 / WebExtensions API） |
| **全平台** | Mac、Windows、Linux 统一 API |
| **零配置** | 用户安装一次扩展就行，不需要带参数启动浏览器 |
| **完整能力** | Cookie 读写、页面 JS 注入、网络拦截、标签管理——比 CDP 更贴近用户视角 |
| **安全** | 扩展运行在浏览器沙箱内，通过 Native Messaging 和 Agent 通信，权限可控 |
| **登录检测** | 扩展可以监听 Cookie 变化，主动通知 Agent "B 站登录已过期" |

社区已有的开源参考：

| 项目 | 说明 |
|---|---|
| [Nanobrowser](https://github.com/nanobrowser/nanobrowser) | AI 驱动的 Chrome 扩展，支持多 Agent 协作，12k+ stars |
| [NativeMind](https://github.com/NativeMindBrowser/NativeMindExtension) | 隐私优先，支持 Chrome/Firefox/Edge，本地 AI 模型 |
| [browser-use](https://github.com/browser-use/browser-use) | Python 生态的 AI 浏览器自动化 |

**第三步（远期）：WebDriver BiDi — W3C 标准化**

WebDriver BiDi 是 W3C 正在制定的新一代浏览器自动化标准，双向通信，所有浏览器厂商参与。目前还在 Working Draft 阶段（2024 年底发布首个公开草案），预计 2026-2027 年各浏览器全面支持。

等 BiDi 成熟后，不需要 CDP 也不需要扩展，标准化协议直接搞定。但现在还不能用。

#### 推荐的演进路线

```
现在                    3-6 个月后                 1-2 年后
  │                        │                         │
  ▼                        ▼                         ▼
CDP 连接 Chrome          浏览器扩展                 WebDriver BiDi
(快速可用)              (全浏览器通用)              (W3C 标准)
                                                     
覆盖：Chromium 系        覆盖：所有浏览器             覆盖：所有浏览器
平台：全平台              平台：全平台                 平台：全平台
成本：1-2 天              成本：1-2 周                 成本：等标准落地
```

#### smart-finder 的迁移路径

现有 `safariManager.ts` 的架构可以抽象为一个通用接口，然后按浏览器选择不同后端：

```typescript
// agent/browser-bridge.ts — 通用浏览器桥接接口

interface BrowserBridge {
  /** 在指定网站的页面中执行 JS（携带用户 Cookie） */
  executeInSite(host: string, script: string): Promise<string>

  /** 获取指定网站的 Cookie */
  getCookies(host: string): Promise<Cookie[]>

  /** 检查指定网站的登录状态 */
  checkLoginStatus(host: string): Promise<boolean>

  /** 打开 URL */
  openUrl(url: string): Promise<void>

  /** 获取当前所有标签页 */
  getTabs(): Promise<TabInfo[]>
}

// 根据运行环境自动选择后端
function createBrowserBridge(): BrowserBridge {
  // 优先级：扩展 > CDP > Safari WebDriver
  if (extensionAvailable()) return new ExtensionBridge()
  if (cdpAvailable())       return new CDPBridge()
  if (isMacOS())            return new SafariBridge()
  throw new Error('没有可用的浏览器后端')
}
```

这样 `biliApi.ts`、`tencentManager.ts` 等业务代码不需要改——它们只依赖 `BrowserBridge` 接口，底层用 Safari 还是 CDP 还是扩展对它们完全透明。

```typescript
// biliApi.ts — 改造后
import { createBrowserBridge } from '../browser-bridge'

const bridge = createBrowserBridge()

async function safariGet(url: string): Promise<string> {
  // 之前：runJavaScript(...)  ← Safari 专属
  // 之后：bridge.executeInSite(...)  ← 通用
  return bridge.executeInSite('bilibili.com', `
    fetch('${url}', { credentials: 'include' }).then(r => r.text())
  `)
}
```

#### 完整实施优先级（自有应用 + 第三方网站）

| 优先级 | 问题 | 做什么 | 时间 |
|---|---|---|---|
| **P0** | A | Better Auth 服务端 + Passkey + vue-mind Channel WSS | 3-4 天 |
| **P0** | A | Electron 客户端 OAuth 登录 + Keychain Token 存储 | 2-3 天 |
| **P1** | A | `@vue-mind/agent` SDK（Token 管理 + Channel 连接） | 1-2 天 |
| **P1** | B | 抽象 `BrowserBridge` 接口，加 CDP 后端 | 2-3 天 |
| **P2** | B | 迁移 biliApi/tencentManager 到 BrowserBridge | 1-2 天 |
| **P3** | B | 开发 AI Bridge 浏览器扩展（全浏览器通用） | 1-2 周 |
| **P3** | A | AI Delegation Token（第三方 Agent 接入） | 按需 |

---

## npm 发布

```bash
# 构建所有包
pnpm build

# 试运行（不真正发布）
pnpm publish:dry

# 正式发布（需要 npm 登录或 Automation Token）
pnpm publish:all

# 批量升级版本
pnpm version:patch   # 0.1.0 → 0.1.1
pnpm version:minor   # 0.1.0 → 0.2.0
```

发布顺序由 pnpm 自动处理依赖拓扑：`shared` → `runtime` / `vite-plugin` → `webmcp`。

---

## Roadmap

- [x] 编译时 SFC AST 元数据提取
- [x] 运行时组件追踪和页面快照
- [x] AIChannel 双向异步通信
- [x] defineAIAction 一次定义自动生成 Tool
- [x] WebMCP 桥接
- [ ] Better Auth 服务端 — Passkey + OAuth + Token，公网部署认证基础设施
- [ ] AIChannel WSS 公网版 — Channel 通过 WSS + Token 验证，支持公网双向通信
- [ ] Electron 客户端 OAuth — OAuth PKCE 登录 + OS Keychain Token 存储 + 自动续期
- [ ] @vue-mind/agent SDK — Token 管理 + Channel 连接，Agent 侧一行代码接入
- [ ] BrowserBridge 抽象层 — 统一接口（CDP / Extension / Safari WebDriver 多后端）
- [ ] CDP 后端 — 通过 Chrome DevTools Protocol 连接 Chromium 系浏览器
- [ ] AI Bridge 浏览器扩展 — 全浏览器通用（Chrome/Firefox/Edge/Safari），Native Messaging 通信
- [ ] Session 健康检测 — Cookie/Token 过期自动检测和通知
- [ ] Auth 认证感知 — 组件声明 authLevel，快照包含登录状态
- [ ] AI Credential Manager — 统一凭证管理器（保险箱 + Profile + 健康监控 + 跨设备同步）
- [ ] Service Registry — 社区维护的网站认证方式注册表
- [ ] Browser Auth Bridge — 从 Safari/Chrome 提取复用 Cookie
- [ ] 状态机建模 — 描述页面状态转换（idle → loading → playing → paused）
- [ ] Vue Router 全量路由图谱提取
- [ ] Pinia Store 自动追踪（state/getters/actions）
- [ ] DevTools 扩展 — 可视化 AI 看到的组件树
- [ ] React 适配 — 同理念的 Babel 插件实现

## License

MIT
