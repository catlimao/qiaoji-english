# 巧记英语

把四六级 / 考研等单词自然嵌入你自定义风格的中文小说。

**已改为纯前端**：生成与查词都在浏览器完成，**不再依赖本站服务端 API**，适合 GitHub Pages 托管，别人打开链接就能用。

## 本地运行

需要 Node.js 18+：

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 发布给别人用（GitHub Pages）

### 1. 推到 GitHub

```bash
git init
git add .
git commit -m "feat: static site for GitHub Pages"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

### 2. 打开 Pages

仓库 → **Settings → Pages → Build and deployment**

- Source 选 **GitHub Actions**

### 3. 等待部署

推送后会自动跑 `.github/workflows/deploy-pages.yml`。

完成后地址大致为：

- 项目站：`https://你的用户名.github.io/仓库名/`
- 若仓库名是 `你的用户名.github.io`：`https://你的用户名.github.io/`

把这个网址发给别人即可。他们各自浏览器本地保存词书 / 生词本 / 历史。

### 4. 本地预览静态包

```bash
npm run build
npx serve out
```

## 说明

| 能力 | 说明 |
|------|------|
| 默认免费生成 | 浏览器直连公开免费模型通道 |
| 查词典 / 例句 | 浏览器直连公开词典与翻译接口 |
| 自备 DeepSeek 等 | 部分厂商禁止网页跨域（CORS），可能失败；失败时请用免费模型，或改用 Vercel 等带代理的部署 |

可选构建变量（一般不用）：

```env
NEXT_PUBLIC_FREE_LLM_BASE_URL=
NEXT_PUBLIC_FREE_LLM_API_KEY=
NEXT_PUBLIC_FREE_LLM_MODEL=
NEXT_PUBLIC_BASE_PATH=/仓库名
```

## 词书格式

```json
[
  {
    "word": "slip",
    "meaning": "滑落",
    "meanings": ["滑落", "滑动", "疏忽"],
    "phonetic": "/slɪp/",
    "pos": "v.",
    "examples": ["The paper slipped from his fingers."],
    "exampleTranslations": ["纸从他指间滑落。"]
  }
]
```
