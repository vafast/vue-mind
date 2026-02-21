import { createApp } from 'vue'
import { createAIMind } from '@vue-mind/runtime'
import { enableWebMCP } from '@vue-mind/webmcp'
import App from './App.vue'

const app = createApp(App)

// 两行代码接入 vue-mind：所有组件自动暴露 AI 元数据
app.use(createAIMind())
enableWebMCP()

app.mount('#app')

// 开发提示
console.log(
  '%c[vue-mind] 已启用',
  'color: #42b883; font-weight: bold',
  '\n在控制台输入 __AI_MIND__.snapshot() 查看当前页面的 AI 快照',
  '\n或 __WEBMCP_POLYFILL__.list() 查看已注册的 WebMCP 工具'
)
