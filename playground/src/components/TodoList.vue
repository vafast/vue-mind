<script setup lang="ts">
/**
 * 待办事项组件 — 演示状态管理场景的 vue-mind 自动提取
 *
 * AI 将自动知道：
 * - 有 items 状态（数组）和 newText 状态（字符串）
 * - 有 addTodo, removeTodo, toggleTodo, clearCompleted 四个动作
 * - remaining 和 completedCount 是计算属性
 */
import { ref, computed } from 'vue'
import { useAIMind } from '@vue-mind/runtime'

interface TodoItem {
  id: number
  text: string
  done: boolean
}

const items = ref<TodoItem[]>([
  { id: 1, text: '了解 vue-mind', done: false },
  { id: 2, text: '试试 AI 快照', done: false },
  { id: 3, text: '集成 WebMCP', done: false },
])

const newText = ref('')
let nextId = 4

const remaining = computed(() => items.value.filter(i => !i.done).length)
const completedCount = computed(() => items.value.filter(i => i.done).length)

function addTodo(text?: string) {
  const t = (text || newText.value).trim()
  if (!t) return
  items.value.push({ id: nextId++, text: t, done: false })
  newText.value = ''
}

function removeTodo(id: number) {
  items.value = items.value.filter(i => i.id !== id)
}

function toggleTodo(id: number) {
  const item = items.value.find(i => i.id === id)
  if (item) item.done = !item.done
}

function clearCompleted() {
  items.value = items.value.filter(i => !i.done)
}

defineExpose({ addTodo, removeTodo, toggleTodo, clearCompleted })

useAIMind({
  description: '待办事项列表，支持添加、删除、切换完成状态、清除已完成',
  actions: {
    addTodo: { description: '添加新待办，传 text 参数' },
    removeTodo: { description: '按 id 删除待办' },
    toggleTodo: { description: '按 id 切换完成状态' },
    clearCompleted: { description: '清除所有已完成的待办' },
  },
})
</script>

<template>
  <div class="todo-list">
    <h3>待办事项 ({{ remaining }} 剩余)</h3>
    <div class="input-row">
      <input v-model="newText" placeholder="输入新待办..." @keyup.enter="addTodo()" />
      <button @click="addTodo()">添加</button>
    </div>
    <ul>
      <li v-for="item in items" :key="item.id" :class="{ done: item.done }">
        <input type="checkbox" :checked="item.done" @change="toggleTodo(item.id)" />
        <span>{{ item.text }}</span>
        <button @click="removeTodo(item.id)">×</button>
      </li>
    </ul>
    <div v-if="completedCount > 0" class="footer">
      <button @click="clearCompleted()">清除 {{ completedCount }} 项已完成</button>
    </div>
  </div>
</template>

<style scoped>
.todo-list { border: 1px solid #ccc; border-radius: 8px; padding: 16px; max-width: 480px; }
.input-row { display: flex; gap: 8px; margin-bottom: 12px; }
.input-row input { flex: 1; padding: 6px; }
ul { list-style: none; padding: 0; }
li { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
li.done span { text-decoration: line-through; color: #999; }
li button { margin-left: auto; background: none; border: none; cursor: pointer; color: #e74c3c; font-size: 18px; }
.footer { margin-top: 12px; text-align: center; }
button { padding: 6px 16px; cursor: pointer; }
</style>
