---
name: vue-component
description: 照專案慣例建立或改寫 Vue 3 元件（script setup + TypeScript、props 與 emits 型別、無障礙、RWD、reduced-motion）。使用者要新增 Vue 元件、頁面、uni-app 頁面，或把元件改寫成 Composition API 時使用。
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# Vue 3 元件

## 步驟

1. 找專案慣例：看 2–3 個現有元件，記下檔案位置、命名、樣式寫法（scoped CSS / Tailwind / UnoCSS）、元件庫、測試位置。
2. 確認需求：props、emits、slots、狀態、要不要呼叫 API 或用 store。不清楚就問。
3. 用下面的骨架寫元件，套用專案慣例。
4. 有測試慣例就補測試（例如 Vitest + Vue Test Utils）。
5. 跑型別檢查（`vue-tsc --noEmit`），在瀏覽器看 375px 和 1280px。
6. 回報：檔案路徑、用法範例、驗證結果。

## 骨架

```vue
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  title: string
  count?: number
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
})

const emit = defineEmits<{
  select: [id: string]
}>()

const label = computed(() => `${props.title}（${props.count}）`)
</script>

<template>
  <section class="card" :aria-label="title">
    <h2>{{ label }}</h2>
    <button type="button" @click="emit('select', title)">選擇</button>
  </section>
</template>

<style scoped>
.card {
  padding: var(--space-4, 16px);
}

@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
}
</style>
```

## 檢查清單

- [ ] `<script setup lang="ts">`，沒有 `any`
- [ ] props / emits 都有型別
- [ ] 互動元素用 `button` / `a`，鍵盤可操作
- [ ] 圖片有 `alt`，表單欄位有 `label`
- [ ] 有動畫就處理 `prefers-reduced-motion`
- [ ] uni-app：用 `uni.*` API 與 `rpx`，平台差異用條件編譯
