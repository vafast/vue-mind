<script setup lang="ts">
/**
 * 文件上传 — 演示异步进度 + AI 实时感知
 *
 * AI 调用 upload → 组件开始上传 → 实时推送进度事件 → 完成后返回结果
 * AI 全程知道上传进度，不用猜，不用等。
 */
import { ref, computed } from 'vue'
import { defineAIAction, notifyAI, useAIMind } from '@vue-mind/runtime'

const files = ref<Array<{ name: string; size: number; progress: number; status: string }>>([])
const uploading = ref(false)

const totalProgress = computed(() => {
  if (!files.value.length) return 0
  return Math.round(files.value.reduce((sum, f) => sum + f.progress, 0) / files.value.length)
})

defineAIAction('startUpload', {
  description: '模拟文件上传，AI 会收到实时进度事件',
  params: {
    fileName: { type: 'string', description: '文件名', required: true },
    fileSize: { type: 'number', description: '文件大小(KB)', required: false },
  },
  async handler(params) {
    const name = String(params.fileName)
    const size = Number(params.fileSize) || 1024

    const file = { name, size, progress: 0, status: 'uploading' }
    files.value.push(file)
    uploading.value = true

    // 模拟上传进度 — 每 200ms 推送一次进度事件
    for (let i = 1; i <= 10; i++) {
      await sleep(200)
      file.progress = i * 10

      // 实时推送进度给 AI
      notifyAI('uploadProgress', {
        fileName: name,
        progress: file.progress,
        status: 'uploading',
      })
    }

    file.status = 'done'
    uploading.value = files.value.some(f => f.status === 'uploading')

    // 推送完成事件
    notifyAI('uploadComplete', {
      fileName: name,
      fileSize: size,
      url: `https://cdn.example.com/${name}`,
    })

    return {
      fileName: name,
      url: `https://cdn.example.com/${name}`,
      uploadedAt: new Date().toISOString(),
    }
  },
})

defineAIAction('clearUploads', {
  description: '清除所有上传记录',
  params: {},
  async handler() {
    const count = files.value.length
    files.value = []
    uploading.value = false
    return { cleared: count }
  },
})

useAIMind({
  description: '文件上传组件，支持模拟上传并实时推送进度',
  actions: {
    startUpload: { description: '开始上传文件' },
    clearUploads: { description: '清除上传记录' },
  },
})

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
</script>

<template>
  <div class="file-upload">
    <h3>文件上传</h3>

    <div v-if="!files.length" class="empty">
      暂无上传文件。AI 可以调用 <code>FileUpload.startUpload</code> 开始上传。
    </div>

    <div v-for="file in files" :key="file.name" class="file-item">
      <div class="file-info">
        <span class="name">{{ file.name }}</span>
        <span class="status" :class="file.status">{{ file.status === 'done' ? '✓ 完成' : `${file.progress}%` }}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: file.progress + '%' }"></div>
      </div>
    </div>

    <div v-if="uploading" class="total">
      总进度: {{ totalProgress }}%
    </div>
  </div>
</template>

<style scoped>
.file-upload { border: 1px solid #ccc; border-radius: 8px; padding: 16px; max-width: 480px; }
h3 { margin: 0 0 12px; }
.empty { color: #999; padding: 20px; text-align: center; }
.file-item { margin-bottom: 12px; }
.file-info { display: flex; justify-content: space-between; margin-bottom: 4px; }
.name { font-weight: 500; }
.status { font-size: 13px; }
.status.done { color: #42b883; }
.status.uploading { color: #e67e22; }
.progress-bar { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: #42b883; transition: width 0.2s; }
.total { margin-top: 12px; text-align: center; font-weight: 500; color: #333; }
code { background: #e8e8e8; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
</style>
