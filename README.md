# Extreme Fall Simulator

使用 Three.js 與 Rapier 3D 的繁體中文瀏覽器物理沙盒。可在城市測試平台起跳、跳入溪谷水池，或在虛構飛行場體驗傘降。

## 啟動

Windows 可雙擊 `Play-Extreme-Fall.cmd`。它使用本機 Node.js 提供已建置的 `dist/`，並開啟預設瀏覽器。關閉啟動視窗即可停止伺服器。

建議使用 Node.js 24.22.1 或更新版本。此專案已用 24.22.1 驗證正式建置。此電腦的系統 Node.js 24.12.0 在 Vite 打包時曾異常結束。物理測試使用 Node.js 的 TypeScript 型別移除功能。

```sh
npm install
npm run dev
npm test
npm run build
npm run test:browser
npm run test:flight
```

Windows PowerShell 若禁止執行 `npm.ps1`，改用 `npm.cmd`。開發伺服器會顯示本機與區網網址，同一區網的手機可以開啟後者。瀏覽器測試使用已安裝的 Chrome，亦可透過環境變數 `FALL_CHROME` 指定 Chromium 系瀏覽器執行檔。

## 操作

| 操作 | 桌面 | 手機 |
| --- | --- | --- |
| 移動、空中微調、游動、操控傘具 | WASD | 左下搖桿 |
| 旋轉鏡頭 | 在畫面上按住滑鼠拖曳 | 單指拖曳畫面 |
| 開始模擬 | Space | 開始模擬 |
| 開傘 | E | 開傘按鈕 |
| 切換視角 | V | 視角按鈕 |
| 重試 | R | 重試按鈕 |
| 暫停、繼續 | Esc | 暫停、繼續按鈕 |

## 場景與模型

- 高樓的測試平台是虛構的。住宅為 12 m、30 m。高雄 85 大樓的總高度與起始高度是 347.5 m、320 m。台北 101 為 508 m、449 m。
- 瀑布有 4、6、12、18、24 m 水面落差。入水後可在結果顯示前游動。
- 跳傘高度 1,600、2,000、2,500、3,000 ft 都以 AGL 設定，物理運算轉為公尺。正常與故障情境可按開傘，未開傘情境停用按鈕。
- 物理以 1/60 秒固定步長與 9.80665 m/s² 重力執行。風速與水流是三維速度場。水、降落傘及人物受力是即時遊戲的簡化近似。
- 傷害與死亡依遊戲門檻計算。低高度或故障情境僅供虛擬體驗，請勿用作真實跳傘指引或醫療判斷。

## 原始碼

- `src/game/config.ts` 儲存場景高度、畫質、材質及傷害門檻。
- `src/game/physics.ts` 實作風速、二次阻力、浮力與傘具氣動力。
- `src/game/actor.ts` 管理 17 個剛體、模型、關節與可分離部位。
- `src/game/scenery.ts` 建立場景、碰撞體、天氣、瀑布 shader 與 LOD。
- `src/game/game.ts` 協調固定步長、碰撞事件、攝影機、重置與渲染。
- `src/game/effects.ts` 管理可重用粒子、地面血跡及生成音效。
- `src/game/input.ts` 與 `src/ui/` 處理控制、設定、數據與結果。
- `public/assets/` 有程式產生的原創 GLB 標記物，可用 `node scripts/make-marker.mjs` 重建。
- `tests/` 有獨立物理測試、正式產物的桌面和 390px 觸控測試，以及用固定步長跑完三種傘降情境的測試。

## 正式建置與部署

執行 `npm run build`，將 `dist/` 內的檔案和目錄一起上傳到任意 HTTPS 靜態主機。Vite 使用相對資產路徑，可放網站根目錄或子目錄。透過 HTTP 或 HTTPS 開啟入口即可執行。無需後端，也無需 CDN 或第三方模型。

`npm run preview` 可在本機檢查正式建置。`npm run test:browser` 透過 `scripts/serve.mjs` 將同一份產物掛在 `/extreme-fall/`，驗證子目錄中的資產載入。

