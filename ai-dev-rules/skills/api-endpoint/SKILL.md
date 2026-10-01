---
name: api-endpoint
description: 新增後端 API 端點，含輸入驗證、授權檢查、統一錯誤格式、測試與文件。使用者要新增或修改 REST API、路由、controller、handler 時使用。
---

# API 端點

## 步驟

1. 找專案慣例：框架（Express、Fastify、Hono、NestJS…）、路由放哪、驗證套件、錯誤處理中介層、測試工具。
2. 確認規格：方法與路徑、請求參數、回應格式、誰可以呼叫、會不會改資料庫。
3. 寫 schema（例如 zod），請求與回應都要。
4. 寫 handler，依序：檢查登入 → 驗證輸入 → 檢查資料權限 → 商業邏輯 → 回應。
5. 寫測試，至少涵蓋：成功、輸入錯誤（400 / 422）、未登入（401）、沒權限（403）、找不到（404）。
6. 更新 API 文件（OpenAPI 或 README）。
7. 跑測試與型別檢查，回報。

## handler 骨架（TypeScript + zod）

```ts
const CreateItemBody = z.object({
  name: z.string().min(1).max(100),
  price: z.number().int().nonnegative(),
})

export async function createItem(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '請先登入' } })
  }

  const parsed = CreateItemBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: 'VALIDATION_FAILED', message: '欄位值不符規則', details: parsed.error.issues },
    })
  }

  const item = await itemService.create(req.user.id, parsed.data)
  return res.status(201).json(item)
}
```

## 檢查清單

- [ ] 路徑是名詞複數、kebab-case、有版本
- [ ] 所有輸入都經過 schema 驗證
- [ ] 檢查的是「能不能存取這筆資料」，不只是「有沒有登入」
- [ ] 錯誤用統一格式，500 不回傳 stack trace
- [ ] 清單端點有分頁
- [ ] 多筆寫入包在交易裡
- [ ] 日誌不含密碼、token、個資
- [ ] 測試涵蓋五種情況
