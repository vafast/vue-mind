/**
 * @vue-mind/vite-plugin
 *
 * Vite 插件：在编译时分析每个 Vue SFC，提取 AI 元数据，注入到组件上。
 *
 * 使用方式：
 *   import vue from '@vitejs/plugin-vue'
 *   import aiMind from '@vue-mind/vite-plugin'
 *   export default defineConfig({ plugins: [vue(), aiMind()] })
 *
 * 效果：每个 Vue 组件自动带上 __aiMeta 静态属性，包含完整的能力描述。
 */

import { basename } from 'node:path'
import { extractScriptMeta } from './extract-script'
import { extractTemplateMeta } from './extract-template'
import type { ComponentAIMeta } from '@vue-mind/shared'
import type { Plugin } from 'vite'

export interface VueMindPluginOptions {
  /** 是否在 production 环境也注入元数据（默认 true） */
  includeInProd?: boolean
  /** 排除的文件路径模式 */
  exclude?: RegExp[]
}

export default function vueMindPlugin(options: VueMindPluginOptions = {}): Plugin {
  const { includeInProd = true, exclude = [] } = options

  return {
    name: 'vue-mind',
    enforce: 'pre',

    transform(code, id) {
      if (!id.endsWith('.vue')) return
      if (exclude.some(re => re.test(id))) return

      // 提取元数据
      const scriptMeta = extractScriptMeta(code, id)
      const templateMeta = extractTemplateMeta(code, id)

      const componentName = inferComponentName(id)

      const aiMeta: ComponentAIMeta = {
        name: componentName,
        filePath: id,
        props: scriptMeta.props,
        events: scriptMeta.events,
        models: scriptMeta.models,
        state: scriptMeta.state,
        actions: scriptMeta.actions,
        interactions: templateMeta.interactions,
        navigations: templateMeta.navigations,
      }

      // 将元数据注入到 <script setup> 的末尾
      // Vue 编译后会把 setup 的返回值合并到组件对象，
      // 我们通过在模块级别定义一个后处理 hook 来注入 __aiMeta
      const metaJson = JSON.stringify(aiMeta)
      const injection = `
;(function __vueMindInject__() {
  if (typeof __VUE_MIND_REGISTER__ === 'function') {
    __VUE_MIND_REGISTER__(${metaJson});
  }
  if (typeof window !== 'undefined') {
    window.__VUE_MIND_PENDING__ = window.__VUE_MIND_PENDING__ || [];
    window.__VUE_MIND_PENDING__.push(${metaJson});
  }
})();
`

      // 在 <script setup> 块后追加注入代码
      if (code.includes('<script setup')) {
        const insertPos = code.lastIndexOf('</script>')
        if (insertPos !== -1) {
          const newCode = code.slice(0, insertPos) + injection + code.slice(insertPos)
          return { code: newCode, map: null }
        }
      }

      return null
    },
  }
}

function inferComponentName(filePath: string): string {
  const file = basename(filePath, '.vue')
  // PascalCase
  return file.replace(/(^|[-_])(\w)/g, (_m: string, _sep: string, c: string) => c.toUpperCase())
}

export { extractScriptMeta } from './extract-script'
export { extractTemplateMeta } from './extract-template'
