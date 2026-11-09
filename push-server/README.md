# 宿舍系統：私人 Web Push

## 目前狀態

前端、通知專用 Service Worker、Cloudflare Worker / SQLite Durable Object、三類事件及測試已加入。
Cloudflare 後端已部署於 `https://dorm-private-push.qwqqq0000.workers.dev`。
`push-config.js` 已指向此服務並設定 `protectData:true`；發布後，帳本、預算與餐廳頁會先驗證裝置，再讀取資料。
通知需各裝置自行啟用並授權。後端部署成功不代表已完成 iPhone 實際收件驗收。
不需要 Google 登入；裝置以私人啟用碼選擇至凱或柏致，再保存裝置憑證。

## 費用與平台

- 維持 GitHub Pages、Firebase Spark。不要升級 Blaze、Workers Paid 或輸入信用卡。
- Cloudflare Workers Free + **SQLite** Durable Object；不是只在付費方案可用的舊 KV-backed Durable Object。
- Workers Free 每日 100,000 次請求；Durable Object Free 每日 100,000 次請求、13,000 GB-s 執行時間，亦有儲存與讀寫額度。
- 免費方案超額會失敗，不是自動按量計費。本機程式不會開通／升級任何方案。若管理台要求付費，先停止，不要直接接受。
- 沒有常駐伺服器、資料庫輪詢或 Firebase Functions。尚未完成的事件才排 durable alarm。
- iPhone 須 iOS 16.4+、HTTPS，且從「加入主畫面」的 Web App 開啟；不需要付費 Apple Developer 帳號。
- iOS、電量、專注模式與網路可能延後／抑制通知，不能保證即時送達。

官方說明：[Workers](https://developers.cloudflare.com/workers/platform/pricing/)、[Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)、[Apple Web Push](https://webkit.org/blog/13878/)。額度仍應以部署當日官方方案為準。

## 安全邊界

這是依需求採用的「兩位可信任室友」模式，不是強身分認證或公開多人服務。
持有有效邀請的人可選任一身分；不要公開邀請，也不要當成銀行級帳號隔離。
邀請預設 24 小時、2 次使用，裝置最多每人 8 部。裝置授權在使用期間會自動延長；超過 180 天未使用才需要重新啟用。
伺服器只保存裝置 token 的 SHA-256，不回傳別人的訂閱／金鑰。
管理密鑰與一般裝置憑證分開；一般裝置不能發系統公告或指定支出接收者。
訂閱僅接受 Apple、FCM、Mozilla 的 HTTPS push endpoint，避免任意網址 SSRF。
通知只帶總額與固定摘要，不帶備註、帳戶資料或姓名。

`database.rules.json` 拒絕公開讀寫，只允許已啟用且未過期的裝置及專用服務身分。更換規則前必須備份原規則並驗證登入；本機檔案不會自行套用到正式環境。
安全版使用服務帳戶私鑰簽發短效 Firebase 自訂憑證；實際資料庫讀寫使用受規則約束的 Firebase ID token，而非繞過 Rules 的管理員 OAuth token。
私鑰即使不授予額外 IAM 角色，仍可簽發此 Firebase 專案的使用者身分，**只能放 Worker Secrets**，不能放前端、Git、Pages、截圖或聊天。
請建立專用服務帳戶，避免使用預設 Admin 服務帳戶的寬廣 IAM 權限；若私鑰外洩，必須刪除金鑰並更換。
握力與首頁公告使用另一個 Firebase 專案，這組規則不會自動保護該專案。
若未來改為公開服務，應先導入真正登入與伺服器權限驗證，再開放註冊。

## 部署與維護順序

1. 建立免費 [Cloudflare 帳號](https://dash.cloudflare.com/sign-up)，保持 Workers Free；不需更換域名或搬離 GitHub Pages。
2. 在這個資料夾執行 `npm ci`、`npx wrangler login`，登入應在自己的瀏覽器完成，不要提供密碼給聊天。
3. 檢查 `wrangler.jsonc`：`APP_URL` 必須以 `/` 結尾，`ALLOWED_ORIGINS` 只填真正網站 origin，Firebase URL 必須是既有帳本專案，不是首頁公告的另一個專案。
4. 產生一次 VAPID 及管理密鑰，**指定專案外的新檔案**。同一部署不要任意重產 VAPID，否則舊裝置需重新訂閱。

```powershell
node admin.mjs keys "$env:USERPROFILE\dorm-push-keys.secret.json"
```

5. 在 Firebase / Google Cloud 為既有帳本專案建立專用服務帳戶，避免授予額外 IAM 角色，再產生私鑰 JSON，存到專案外。確保 Firebase Authentication 已初始化並可使用自訂憑證。不要為此啟用 Blaze；若介面要求開通計費，先停止。
6. 使用 Wrangler Secrets 儲存以下四項。請在自己終端機貼入或由本機檔案安全輸入；不能填在 `wrangler.jsonc`、`push-config.js` 或 `.dev.vars.example`。

```powershell
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
Get-Content -Raw -LiteralPath "$env:USERPROFILE\dorm-firebase.secret.json" | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
```

7. 再次確認帳號是 Free，執行 `npm run check` 後 `npm run deploy`，使用免費 `workers.dev` URL。保持 `preview_urls:false`，避免額外的預覽入口。
8. 開啟 `<Worker URL>/config`，須為 `ready:true`。這只檢查設定存在，不代表 Firebase 權限／真實推播已驗證。
9. 將網站 `push-config.js` 的 `apiUrl` 改成 Worker HTTPS URL（不含結尾 `/`）並設定 `protectData:true`，部署既有 GitHub Pages。只有 API URL 是公開設定；私鑰不在此處。正式資料庫規則暫時保持原樣，先確認 Firebase Authentication 與兩台裝置都能啟用。
10. 設定本機管理環境變數，建立私人啟用連結，私下分享給兩位室友。環境變數與終端輸出不要公開。

```powershell
$env:DORM_PUSH_API = 'https://你的-worker.workers.dev'
# DORM_ADMIN_SECRET 從私有檔案讀取，避免把密鑰寫進命令歷史
$keys = Get-Content -Raw -LiteralPath "$env:USERPROFILE\dorm-push-keys.secret.json" | ConvertFrom-Json
$env:DORM_ADMIN_SECRET = $keys.ADMIN_SECRET
node admin.mjs invite 2
```

11. iPhone Safari 開啟正式網站 → 分享 → 加入主畫面 → 從主畫面開啟 →「通知設定」貼入啟用連結／碼 → 選裝置主人 → 啟用裝置 → 點開關授予權限。Safari 與主畫面 App 儲存空間可能不共用，應以主畫面 App 中完成設定為準。
12. 先用兩個獨立裝置憑證驗證 Firebase 登入與四個資料路徑，確認受保護網頁及私人啟用流程可用，再備份現有規則並將 `database.rules.json` 套用到帳本專案。重新實測未授權裝置無法讀寫、兩個已授權身分正常、解除裝置立即生效。若失敗，依備份恢復原規則並排除問題；不得清空資料庫。最後由兩支 iPhone 完成真正通知驗收。

**注意：啟用後，新增與結清需要有效裝置憑證及後端連線；通知關閉仍可正常記帳。**
後端斷線不會靜默改回無通知的直接寫入，以免操作結果與通知事件分離。畫面會提示失敗／待確認，可保持原內容重試。
欲回到原寫入模式，可把 `apiUrl` 清空後重新部署；已接受的後端事件仍須從管理端確認，避免不確定的操作被重複新增。

## 管理操作

```powershell
node admin.mjs status
node admin.mjs revoke <status顯示的deviceId>
node admin.mjs announce notice-20261109 both '重要公告' '系統維護說明'
```

公告接收者限 `both` / `p1` / `p2`；重試同一公告須使用相同 ID 與內容。這不修改首頁 Firebase 公告內容；重要推播由管理者明確發送，沒有新增公開公告後台。
不要在除錯時發送正式公告。`status` 不包含私鑰、裝置原始 token 或 push endpoint。

## 事件與帳務相容性

- 只接受支出新增、結清新增、管理公告。編輯／刪除／重新整理不建立新通知。
- 新增由 Worker 白名單驗證欄位後寫入相同 `split/records` 格式；沿用 `split-core.js`，以原 `budgetSync` / `splitOps` 流程對帳。
- 結清沿用既有 `settlementSummary` 公式，透過 Firebase ETag 條件寫入同一 `split`，衝突時重新讀取，不覆蓋其他裝置更新。
- 每筆操作在本機保存穩定 ID；同瀏覽器頁籤使用 Web Locks 排隊。斷網／關頁重試仍使用同一 ID，重新啟動不重播成功特效。
- 唯一事件 ID 為 `expense:<recordId>`、`settlement:<settlementId>`、`system:<adminId>`，裝置及出站佇列存在 Durable Object。Firebase 新增 `_dormAccess/devices` 保存可撤銷的裝置授權與期限，原有帳務資料格式不變。
- 正常回應後，畫面保留原 6 秒 Undo；伺服器從畫面 ACK 再等至少 7 秒。若回應時瀏覽器關閉而沒有 ACK，預設成功提交後等 60 秒。
- 發送前讀取真正已儲存的紀錄，已刪除／復原的資料不發送。已發出的鎖定畫面通知無法撤回。
- 推播服務 404 / 410 移除訂閱；其他錯誤有限次退避重試。每個訂閱分別記錄送達嘗試，待送事件最久 1 日，終態紀錄保留 30 日。
- 「推播服務已接受，但儲存狀態前當機」仍可能重送；同事件 push topic / Notification tag 會合併顯示，但**不保證絕對 exactly-once**。
- 總開關關閉會停止此使用者所有裝置的後續發送，並移除訂閱；不影響另一人。已在網路／OS 佇列中的通知不能保證撤回。重新啟用後其他裝置可能需要點「重新連接此裝置」。
- 不做離線帳務快取，Service Worker 沒有 fetch 攔截，不緩存 Firebase 或代替成功寫入。
- 支出以付款受益者兩筆消費合計顯示；發送者是裝置主人，不是付款人。

## 自動化驗證

在開發 workspace 根目錄執行：

```powershell
npm test
npm run test:push-server
npm run test:push-ui
npm run lint
npm run build
npm run check:push-server
```

後端測試使用模擬 Durable Storage / Firebase，不觸碰正式資料；包含 A/B 互通知、全開關組合、復原、去重、失效訂閱、權限與預算原函式比對。
加密測試實際執行 WebCrypto aes128gcm 與 VAPID 簽章驗證。瀏覽器測試模擬 Notification / PushManager 與 API，不算 iPhone 真正推播驗收。
`tests/deployment-smoke.mjs` 可使用私有管理環境變數驗證正式後端：建立兩個臨時裝置、登入 Firebase、只讀四個路徑，再撤銷裝置與刪除臨時登入身分；不新增帳目、不發推播。套用正式規則後以 `EXPECT_PROTECTED=1` 加測匿名與已撤銷憑證拒絕存取。
發布 repo 的網站在根目錄；開發 workspace 在 `SleepBank/` 下。後端相對引用與 Pages URL 已分別考慮，不要把開發 workspace 的根 npm scripts 當成網站 build。

## iPhone 實機驗收清單

- Cloudflare 免費部署成功、Firebase 專用服務帳戶讀寫及條件寫入成功。
- 兩支 iOS 16.4+ iPhone，從主畫面進入，分別綁 p1/p2、授權。
- A 新增支出 → B 在 App 關閉時收到；反向亦同；發送人自己不收到。
- A/B 新增結清亦各通知對方；點擊定位到正確紀錄。
- 6 秒內復原新增／結清不通知；編輯、刪除、重新整理不新增通知。
- 每人總開關關閉對其多裝置全部生效；另一人不受影響。
- 拒絕權限、iOS 系統關閉通知、失效訂閱、換機、解除裝置、慢網與回應遺失。
- 兩人同時記帳／結清、網路重試與重開頁面後的冪等性。
- 一般裝置不能發管理公告；只有持有管理密鑰的工具能發指定目標公告。

兩人關閉 App 後的實際 iPhone 收件仍需操作實機確認，不能以自動化測試代替。
