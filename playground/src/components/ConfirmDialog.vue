<script setup lang="ts">
/**
 * 确认对话框 — 演示双向异步交互
 *
 * AI 调用 confirm → 组件弹出对话框 → 等待用户点击 → 返回结果给 AI
 * 全程异步，没有 setTimeout，没有轮询，Promise 驱动。
 */
import { ref } from 'vue'
import { defineAIAction, createDeferredPromise } from '@vue-mind/runtime'

const visible = ref(false)
const title = ref('')
const message = ref('')

let currentDeferred: ReturnType<typeof createDeferredPromise<boolean>> | null = null

const { pending } = defineAIAction('confirm', {
  description: '弹出确认对话框，等待用户确认或取消，返回布尔结果',
  params: {
    title: { type: 'string', description: '对话框标题', required: true },
    message: { type: 'string', description: '确认消息内容', required: true },
  },
  async handler(params) {
    title.value = String(params.title || '确认')
    message.value = String(params.message || '')

    // 创建 deferred promise，等待用户操作
    currentDeferred = createDeferredPromise<boolean>()
    visible.value = true

    // 挂起，直到用户点击确认/取消
    const confirmed = await currentDeferred.promise

    visible.value = false
    currentDeferred = null

    return { confirmed, answeredAt: new Date().toISOString() }
  },
})

function handleConfirm() {
  currentDeferred?.resolve(true)
}

function handleCancel() {
  currentDeferred?.resolve(false)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay" @click.self="handleCancel">
      <div class="dialog">
        <h3>{{ title }}</h3>
        <p>{{ message }}</p>
        <div class="actions">
          <button class="cancel" @click="handleCancel">取消</button>
          <button class="confirm" @click="handleConfirm">确认</button>
        </div>
      </div>
    </div>
  </Teleport>

  <div class="status" v-if="pending">
    <span class="dot"></span> AI 正在等待用户确认...
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.dialog { background: #fff; border-radius: 12px; padding: 24px; min-width: 320px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.dialog h3 { margin: 0 0 12px; font-size: 18px; }
.dialog p { margin: 0 0 20px; color: #666; }
.actions { display: flex; gap: 12px; justify-content: flex-end; }
button { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
.cancel { background: #f0f0f0; color: #666; }
.confirm { background: #42b883; color: #fff; }
.status { padding: 8px 16px; background: #fff3cd; border-radius: 6px; color: #856404; display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #ffc107; animation: pulse 1s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
