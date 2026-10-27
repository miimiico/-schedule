# 課表與生活（NFC 碰一下就開）

檔案說明
- `index.html`／`style.css`／`app.js`：網站本體，不用改
- `data.js`：課表與習慣資料，**要改課表、改健身時間，只改這個檔案**

## 一、放上 GitHub Pages
1. 登入 github.com → 右上角 **+** → **New repository**
2. Repository name 取一個名字（例如 `schedule`），選 **Public**，按 **Create repository**
3. 在新 repo 頁面點 **uploading an existing file**，把解壓縮後的 5 個檔案（index.html、style.css、app.js、data.js、README.md）直接拖進去，按 **Commit changes**
4. 上方 **Settings** → 左側 **Pages** → Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`，按 **Save**
5. 等 1～2 分鐘，重新整理 Pages 頁面，頂端會出現網址：`https://你的帳號.github.io/schedule/`

## 二、寫入 NFC 貼紙
1. 貼紙選 NTAG213 或 NTAG215（便宜、iPhone／Android 都能讀）
2. 手機安裝 **NFC Tools**（iOS／Android 都有）
3. 開 **寫入** → **新增記錄** → **網址/URL** → 貼上第一步的網址 → **寫入**，手機貼近貼紙
4. 之後碰一下貼紙就會開啟今天的清單（iPhone XS 以上免開 App；Android 需開啟 NFC）

## 三、日常使用
- 點一整列就能勾選完成，進度條會更新
- 底部「月曆」看整月，點某天可在下方查看與勾選
- 「＋ 加一件要做的事」可新增自己的待辦
- 勾選紀錄存在這支手機的瀏覽器裡，換手機或換瀏覽器不會同步；iPhone 請固定用 Safari 開啟，不要同時加到主畫面又用 Safari

## 四、在網頁上直接改行程（v2）
- 每個項目右側有「編輯」：可改標題、時間、備註；健身預設「套用到之後所有健身」，取消勾選就只改那一天
- 「＋ 新增行程」：可設日期、時間，也可選「每週的這一天／每天」重複到指定日期
- 課程可「從這天移除」，頁面底部能「全部還原」；改過的課程可按「還原原本」
- 「備份／還原我的修改」：把資料複製到備忘錄，換手機時貼回來匯入
- 這些修改只存在這支手機的瀏覽器，不會改到 data.js

## 五、修改資料（data.js）
- 健身時間：改 `habits` 裡的 `start`／`end`
- 某天不想健身或改時間：`"skip": ["2026-11-09"]` 或 `"overrides": {"2026-11-09": {"start": "07:00", "end": "08:00"}}`
- 改課：在 `days` 找到日期，改該筆的內容即可
- 在 GitHub 網頁點該檔案 → 鉛筆圖示 → 修改 → Commit，約 1 分鐘後網站更新
