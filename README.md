<div align="center">

# AskDocs-Lite

一个开箱即用的轻量级本地 RAG（检索增强生成）文档问答应用。

上传文档 → 构建知识库 → 基于文档进行语义问答。前端 React，后端 Python，向量检索由 LangChain + ChromaDB 驱动，兼容主流大模型 API。

</div>

---

## ✨ 特性

- 📚 **多知识库管理** — 创建多个知识库，独立管理文档与分段策略，支持文档启用/禁用
- 📄 **多格式解析** — 支持 PDF、DOCX、TXT、MD、CSV、JSON、LOG 等格式，自动解析分块
- ✂️ **两种分段模式** — 通用分段（检索/召回同块）与父子分段（子块检索、父块提供上下文）
- 🧹 **文本预处理** — 可选「压缩连续空白」「删除 URL/邮箱」，减少噪声提升检索质量
- 🗂️ **两种索引方式** — **基础**（关键词检索，不消耗 token，默认）与 **高级**（向量语义检索，更精准）
- 🎯 **检索调优** — 每个知识库独立配置 Top K、Score 相似度阈值（可开关）、Rerank 重排（可开关）
- 👀 **分段预览** — 创建知识库或重新分段时，可实时预览分段效果后再确认
- 🤖 **多模型接入** — 兼容 OpenAI 接口（DeepSeek、通义千问、Moonshot、智谱、硅基流动、火山引擎、Ollama 等），可配置多套并随时切换
- 🧠 **模型参数开关** — 温度、Top P、最大 Token、思考模式，按需开启自定义，关闭则用服务商默认
- ⚙️ **Embedding / Rerank 智能推断** — 默认按服务商自动选择模型；也可在「高级模型设置」中独立配置服务商与密钥
- 💬 **流式多轮对话** — SSE 流式输出，保持上下文，支持自定义系统提示词
- 🗂️ **会话管理** — 会话置顶、重命名、删除
- 🔗 **来源引用** — 回答时返回并展示引用的文档来源

## 🖼️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 · Vite 5 · TypeScript · TDesign React · Tailwind CSS |
| 后端 | Python · FastAPI · Uvicorn |
| RAG 引擎 | LangChain（文档加载 · RecursiveCharacterTextSplitter 分块 · Embedding · 检索）|
| 向量数据库 | ChromaDB（本地持久化，高级索引使用）|
| 元数据存储 | SQLite（WAL 模式）|
| 文档解析 | pypdf · docx2txt · langchain-community loaders |

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18
- Python ≥ 3.10

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd askdocs-lite
```

### 2. 安装依赖

```bash
# 前端依赖
npm install

# 后端依赖
cd python_server
python3 -m pip install -r requirements.txt
cd ..
```

### 3. 启动服务

需要同时运行前后端两个服务：

```bash
# 终端 1 — 启动后端（端口 3000）
cd python_server
python3 main.py        # 或 ./start.sh

# 终端 2 — 启动前端（端口 5173）
npm run dev
```

打开浏览器访问 **http://localhost:5173** 即可。

> 前端通过 Vite 代理将 `/api` 与 `/uploads` 转发到后端 `http://localhost:3000`（见 `vite.config.ts`）。
> 修改后端 Python 代码后需重启 `python3 main.py` 才能生效（未开启热重载）。

## 📖 使用指南

1. 打开应用，点击侧边栏 **模型设置**
2. 选择预设或手动填写 API 地址、密钥、聊天模型，保存并激活
   - Embedding / Rerank 模型默认按服务商**自动推断**，无需手动填
   - 如需指定不同服务商，可展开 **高级模型设置** 单独配置 API Base / Key / 模型（留空则自动推断）
3. 进入 **知识库** 页面，按三步创建知识库：
   1. 填写名称与描述
   2. 上传文档
   3. 配置分段模式、文本清洗、索引方式与检索设置，右侧实时预览分段效果后完成创建
4. 已有文档可点击 **分段设置** 调整参数并预览，再执行「重新分段」
5. 回到聊天页面，选择知识库即可开始基于文档的问答

> 💡 **基础索引** 使用关键词检索，开箱即用、不消耗 token；**高级索引** 使用向量语义检索，更精准但需要 Embedding 能力的 API。

## 🔌 API 配置预设

| 服务商 | API Base | 聊天模型 | 自动推断 Embedding | 自动推断 Rerank |
|--------|----------|----------|--------------------|-----------------|
| DeepSeek | https://api.deepseek.com/v1 | deepseek-chat | BAAI/bge-m3（经硅基流动）| BAAI/bge-reranker-v2-m3（经硅基流动）|
| OpenAI | https://api.openai.com/v1 | gpt-4o | text-embedding-3-small | —（跳过）|
| 通义千问 | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus | text-embedding-v3 | gte-rerank |
| Moonshot | https://api.moonshot.cn/v1 | moonshot-v1-8k | moonshot-embedding | —（跳过）|
| 智谱 AI | https://open.bigmodel.cn/api/paas/v4 | glm-4 | embedding-3 | rerank |
| 硅基流动 | https://api.siliconflow.cn/v1 | deepseek-ai/DeepSeek-V3 | BAAI/bge-m3 | BAAI/bge-reranker-v2-m3 |
| 火山引擎 | https://ark.cn-beijing.volces.com/api/v3 | doubao-1.5-pro-32k | doubao-embedding | —（跳过）|
| 本地 Ollama | http://localhost:11434/v1 | llama3 | nomic-embed-text | —（跳过）|

> 未显式配置时，后端会根据 API Base 自动推断 Embedding / Rerank 模型（见 `main.py` 的 `resolve_embedding_model` / `resolve_rerank_model`）。
> Rerank 自动推断覆盖：硅基流动、DeepSeek（经硅基流动）、智谱 BigModel、Jina、通义千问；其余服务商（如火山引擎、OpenAI）不提供兼容的 `/rerank` 接口，会自动跳过重排、仅用向量检索结果，不影响问答。如需使用其他服务商的 rerank，可在「高级模型设置」中手动填写。

## ✂️ 分段参数说明

**通用分段**（默认值）：

- `chunkSize`: 500 字符
- `chunkOverlap`: 100 字符（约 20% 重叠）
- `separator`: `\n\n`
- 内部回退分隔符：`["\n\n", "\n", "。", ".", " ", ""]`

**父子分段**：

- 父块：`parentMode`（`paragraph` 段落 / `full` 全文）、`parentChunkSize`、`parentSeparator`
- 子块：`childChunkSize`、`childSeparator`
- 检索命中子块，返回其所属父块内容作为上下文

分段效果可在前端「分段预览」中实时查看，无需真正写入向量库。

## 🧭 架构概览

```
用户提问
    ↓
（多轮对话）结合历史改写为独立检索问题
    ↓
按所选知识库各自的索引方式检索：
  · 基础 → 关键词重叠检索（SQLite 分块表，不调 Embedding）
  · 高级 → Embedding 向量化 + ChromaDB 余弦相似度 top_k（可选 Rerank 重排）
    ↓
按 Score 阈值过滤 + 多知识库结果合并排序
    ↓
检索到的相关文本块 + 历史对话 拼接为 Prompt
    ↓
流式返回答案（SSE）
```

## 📂 项目结构

```
askdocs-lite/
├── python_server/               # Python 后端
│   ├── main.py                  # FastAPI 主服务（REST API + SSE 流式聊天 + 模型推断）
│   ├── database.py              # SQLite 元数据管理（会话/消息/文档/配置/知识库/关键词分块）
│   ├── rag_engine.py            # LangChain RAG 引擎（解析+分块+清洗+Embedding+检索+Rerank+关键词检索）
│   ├── requirements.txt         # Python 依赖
│   └── start.sh                 # 启动脚本
├── src/                         # 前端源码
│   ├── App.tsx                  # 主应用组件（状态中枢 + SSE 处理）
│   ├── types.ts                 # 类型定义
│   ├── config.ts                # 前端品牌配置（应用名等）
│   ├── pages/                   # 聊天 / 知识库 / 模型设置 页面
│   ├── components/              # 侧边栏 / 头部 / 图标按钮
│   ├── main.tsx                 # 入口
│   └── index.css                # 全局样式
├── data/                        # 运行时数据（已 gitignore）
│   ├── rag.db                   # SQLite 元数据（含 API 密钥，切勿提交）
│   └── chroma_db/               # ChromaDB 向量数据库
├── uploads/                     # 上传文件目录（已 gitignore）
├── .env.example                 # 环境变量模板
├── vite.config.ts               # Vite 配置（代理 → localhost:3000）
└── package.json
```

## 🔒 隐私与安全

- API 密钥保存在本地 `data/rag.db`，上传的文档保存在 `uploads/`，两者均已在 `.gitignore` 中忽略，**不会**被提交到 Git。
- 源码中不含任何硬编码密钥。
- 首次提交前建议执行 `git status` 核对，确认 `data/`、`uploads/`、`.env` 不在待提交列表中。

## 🤝 贡献

欢迎提交 Issue 与 Pull Request。提交前请确保：

- 前端改动通过 `npm run build` 无类型错误
- 说明清楚变更动机与影响范围

## 📄 许可证

本项目的开源许可证待定。在补充 `LICENSE` 文件前，默认保留所有权利。
