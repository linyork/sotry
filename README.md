# Sotry

> 故意拼錯的 Story——因為這不是一個你讀的故事，而是一個你和 AI 一起寫壞的故事。

一個以 AI 驅動的互動敘事引擎，用於角色扮演與協作說故事。

本專案同時也是一個 **Prompt Context Harness 工程的簡單示範**——展示如何透過系統設計（而非單純靠 prompt 內容）來控制 LLM 的行為：將不確定的事情結構化、分工、並讓模型在有明確框架的情況下運作。

## 核心概念

本專案採用 **Director-Generator 雙階段架構**：

- **Director**：負責「導演決策」——根據當前劇情與對話歷史，決定由誰說話、載入哪些 context block。這一層只做選擇，不產生內容。
- **Generator**：負責「內容生成」——拿到 Director 的決策結果後，載入對應的 block 作為 context，串流輸出角色對白或旁白。

這種分工是 Harness 工程的典型模式：**把 LLM 難以同時做好的事情拆開，讓每個模型只負責一件事。**

## Block 系統

故事的所有設定以「Block」為單位組織，而非一次性塞進一個巨大的 system prompt。Director 每輪根據情境動態選取相關 block，讓 Generator 只看到當下需要的 context。

| 類型 | 用途 | 載入方式 |
|------|------|----------|
| `timespace` | 世界觀與核心規則 | 永遠自動載入 |
| `plot` | 當前劇情狀態 | 永遠自動載入 |
| `location` | 地點描述 | Director 選取 |
| `character` | 角色資料 | Director 選取 |
| `response_style` | 回覆格式與語氣規則 | 依說話者自動套用 |
| `other` | 世界觀規則、系統、雜項 | Director 選取 |

## Context 長度管理

隨著對話增長，context 會越來越長。本專案的做法是：每累積 N 條訊息，自動以一次 LLM 呼叫將對話歷史與當前劇情融合摘要，以結構化格式寫回 `plot` block。

這樣一來，Director 和 Generator 永遠只需要看最近幾條對話 + 最新的劇情狀態，而不是全部歷史。

## 技術架構

```
使用者輸入
    │
    ▼
Director (LLM)
  讀取：timespace 內容、plot 內容、角色摘要、近期對話
  輸出：nextSpeaker + selectedBlockIds
    │
    ▼
Generator (LLM)
  讀取：完整 block 內容 + 近期對話
  輸出：串流角色對白或旁白
    │
    ▼
SSE 串流 → 前端即時顯示
```

## 技術棧

- **Frontend**：React 18 + Vite + Tailwind CSS
- **Backend**：Node.js + Express + TypeScript
- **Database**：SQLite（better-sqlite3）
- **LLM**：Ollama（本地執行，支援 GPU）
- **Proxy**：Nginx

## 快速開始

需要 [Docker](https://www.docker.com/) 與 NVIDIA GPU（選用，無 GPU 可移除 docker-compose 中的 GPU 設定）。

```bash
git clone https://github.com/linyork/sotry.git
cd sotry
docker-compose up
```

| 服務 | 網址 |
|------|------|
| Sotry 主介面 | http://localhost |
| 資料庫 UI | http://localhost/db |
| Backend API | http://localhost:3001 |
| Ollama | http://localhost:11434 |

啟動後，進入設定選擇 Director 與 Generator 使用的 Ollama 模型，接著建立 Block 定義你的故事世界，即可開始對話。
