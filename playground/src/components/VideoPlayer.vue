<script setup lang="ts">
/**
 * 视频播放器组件 — 演示 vue-mind 自动提取能力
 *
 * AI 将自动知道这个组件：
 * - 接受 src, autoplay 两个 props
 * - 可触发 play, pause, ended 三个事件
 * - 有 volume 双向绑定
 * - 内部有 currentTime, duration, playing, progress 四个状态
 * - 暴露了 seek, togglePlay 两个可执行动作
 * - 模板有 button(@click) 和 input(@input) 两个交互元素
 */
import { ref, computed } from 'vue'
import { useAIMind } from '@vue-mind/runtime'

const props = defineProps<{
  src: string
  autoplay?: boolean
}>()

const emit = defineEmits<{
  play: []
  pause: []
  ended: []
}>()

const volume = defineModel<number>('volume', { default: 1 })

const currentTime = ref(0)
const duration = ref(120)
const playing = ref(false)
const progress = computed(() => duration.value ? currentTime.value / duration.value : 0)

function seek(seconds: number) {
  currentTime.value = Math.max(0, Math.min(seconds, duration.value))
}

function togglePlay() {
  playing.value = !playing.value
  emit(playing.value ? 'play' : 'pause')
}

function setVolume(val: number) {
  volume.value = Math.max(0, Math.min(1, val))
}

defineExpose({ seek, togglePlay, setVolume })

useAIMind({
  description: '视频播放器，支持播放、暂停、跳转、音量调节',
  actions: {
    seek: { description: '跳转到指定秒数' },
    togglePlay: { description: '切换播放/暂停' },
    setVolume: { description: '设置音量 (0-1)' },
  },
})
</script>

<template>
  <div class="video-player">
    <div class="screen">
      <div class="status">{{ playing ? '▶ 播放中' : '⏸ 已暂停' }}</div>
      <div class="time">{{ Math.floor(currentTime) }}s / {{ duration }}s</div>
    </div>
    <div class="controls">
      <button @click="togglePlay">{{ playing ? '暂停' : '播放' }}</button>
      <input type="range" :min="0" :max="duration" :value="currentTime" @input="seek(Number(($event.target as HTMLInputElement).value))" />
      <span>音量</span>
      <input type="range" :min="0" :max="100" :value="volume * 100" @input="setVolume(Number(($event.target as HTMLInputElement).value) / 100)" />
    </div>
  </div>
</template>

<style scoped>
.video-player { border: 1px solid #ccc; border-radius: 8px; padding: 16px; max-width: 480px; }
.screen { background: #1a1a2e; color: #fff; padding: 40px; text-align: center; border-radius: 4px; margin-bottom: 12px; }
.controls { display: flex; align-items: center; gap: 8px; }
button { padding: 6px 16px; cursor: pointer; }
input[type=range] { flex: 1; }
</style>
