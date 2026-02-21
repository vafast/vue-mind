<script setup lang="ts">
import { ref } from 'vue'
import VideoPlayer from './components/VideoPlayer.vue'
import TodoList from './components/TodoList.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import FileUpload from './components/FileUpload.vue'

const volume = ref(0.8)
</script>

<template>
  <div class="app">
    <header>
      <h1>vue-mind playground</h1>
      <p>打开浏览器控制台体验 AI ↔ UI 双向交互</p>
    </header>

    <main>
      <section>
        <h2>📡 双向异步通信（Channel）</h2>
        <div class="card-row">
          <ConfirmDialog />
          <FileUpload />
        </div>
      </section>

      <section>
        <h2>🎬 组件元数据自动提取</h2>
        <div class="card-row">
          <VideoPlayer src="https://example.com/video.mp4" v-model:volume="volume" />
          <TodoList />
        </div>
      </section>
    </main>

    <footer>
      <details open>
        <summary>控制台快速体验</summary>
        <div class="commands">
          <div class="cmd-group">
            <h4>双向通信 — AI 调用 UI，等待用户操作</h4>
            <code>await __AI_MIND__.channel.invoke('ConfirmDialog.confirm', { title: '删除确认', message: '确定要删除这个文件吗？' })</code>
            <code>await __AI_MIND__.channel.invoke('FileUpload.startUpload', { fileName: 'photo.jpg', fileSize: 2048 })</code>
          </div>
          <div class="cmd-group">
            <h4>事件监听 — AI 收到 UI 实时通知</h4>
            <code>__AI_MIND__.channel.onEvent('FileUpload.uploadProgress', e => console.log('进度:', e.data))</code>
            <code>__AI_MIND__.channel.onEvent('*', e => console.log('事件:', e.source, e.event, e.data))</code>
          </div>
          <div class="cmd-group">
            <h4>工具生成 — 一键获取 AI Tools</h4>
            <code>__AI_MIND__.getTools().map(t => t.function.name)</code>
            <code>JSON.stringify(__AI_MIND__.getTools(), null, 2)</code>
          </div>
          <div class="cmd-group">
            <h4>快照 — AI 感知页面全貌</h4>
            <code>__AI_MIND__.snapshot()</code>
            <code>__AI_MIND__.channel.getState()</code>
          </div>
        </div>
      </details>
    </footer>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafafa; }
.app { max-width: 800px; margin: 0 auto; padding: 32px 16px; }
header { text-align: center; margin-bottom: 32px; }
h1 { font-size: 28px; color: #42b883; }
p { color: #666; margin-top: 8px; }
main { display: flex; flex-direction: column; gap: 32px; }
section h2 { font-size: 18px; margin-bottom: 16px; color: #333; }
.card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 640px) { .card-row { grid-template-columns: 1fr; } }
footer { margin-top: 40px; }
details summary { cursor: pointer; font-weight: 600; color: #42b883; }
.commands { margin-top: 12px; display: flex; flex-direction: column; gap: 16px; }
.cmd-group h4 { font-size: 13px; color: #999; margin-bottom: 6px; }
code { display: block; background: #1a1a2e; color: #42b883; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 4px; word-break: break-all; cursor: pointer; }
code:hover { background: #2a2a3e; }
</style>
