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
- [ ] Auth 认证感知 — 组件声明认证需求，快照包含登录状态
- [ ] Browser Auth Bridge — 从 Safari/Chrome 提取复用 Cookie
- [ ] 状态机建模 — 描述页面状态转换（idle → loading → playing → paused）
- [ ] Vue Router 全量路由图谱提取
- [ ] Pinia Store 自动追踪（state/getters/actions）
- [ ] DevTools 扩展 — 可视化 AI 看到的组件树
- [ ] React 适配 — 同理念的 Babel 插件实现

## License

MIT
