"""
FastAPI 主服务 - RAG 智能问答系统后端
保持与前端完全兼容的 REST API 接口
"""
import os
import json
import uuid
import asyncio
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import database as db
from rag_engine import (
    parse_document,
    chunk_text,
    chunk_text_parent_child,
    store_chunks_in_chroma,
    delete_document_vectors,
    search_similar_chunks,
    rerank_chunks,
    rewrite_query_with_history,
    get_chat_llm,
    get_embeddings,
    clean_text,
    keyword_search,
)
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

# ============= 初始化 =============

app = FastAPI(title="RAG 智能问答系统", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 上传目录
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), '..', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# 初始化数据库
db.init_db()


def resolve_embedding_model(api_config: dict) -> tuple[str, str, str]:
    """解析嵌入模型、API 地址和 API Key。
    优先使用独立配置的 embedding_api_base/embedding_api_key/embedding_model；
    留空则回退到对话配置并按服务商自动推断。
    返回 (embedding_model, api_base, api_key)。"""
    embedding_model = (api_config.get("embedding_model") or "").strip()
    emb_base = (api_config.get("embedding_api_base") or "").strip()
    emb_key = (api_config.get("embedding_api_key") or "").strip()
    api_base = (emb_base or api_config["api_base"]).rstrip("/")
    api_key = emb_key or api_config["api_key"]
    if not embedding_model:
        if "siliconflow" in api_base:
            embedding_model = "BAAI/bge-m3"
        elif "volces" in api_base or "volcengine" in api_base:
            embedding_model = "doubao-embedding"
        elif "dashscope" in api_base:
            embedding_model = "text-embedding-v3"
        elif "bigmodel" in api_base or "zhipu" in api_base:
            embedding_model = "embedding-3"
        elif "localhost" in api_base or "127.0.0.1" in api_base:
            embedding_model = "nomic-embed-text"
        else:
            # 兜底：OpenAI 兼容默认（DeepSeek、Moonshot 等官方无 embedding 的服务商会落此，
            # 高级索引需在「高级模型设置」中单独配置支持 embedding 的服务商）
            embedding_model = "text-embedding-3-small"
    return embedding_model, api_base, api_key


def resolve_rerank_model(api_config: dict) -> tuple[Optional[str], str, str]:
    """解析重排(rerank)模型、API 地址和 API Key。
    优先使用独立配置的 rerank_api_base/rerank_api_key/rerank_model；
    留空则回退到对话配置并按服务商自动推断（无法推断时模型为 None，跳过 rerank）。
    返回 (rerank_model, api_base, api_key)。"""
    rerank_model = (api_config.get("rerank_model") or "").strip()
    rr_base = (api_config.get("rerank_api_base") or "").strip()
    rr_key = (api_config.get("rerank_api_key") or "").strip()
    api_base = (rr_base or api_config["api_base"]).rstrip("/")
    api_key = rr_key or api_config["api_key"]
    if not rerank_model:
        if "siliconflow" in api_base:
            rerank_model = "BAAI/bge-reranker-v2-m3"
        elif "bigmodel" in api_base or "zhipu" in api_base:
            # 智谱 BigModel：端点 /paas/v4/rerank，模型名固定为 rerank
            rerank_model = "rerank"
        elif "jina" in api_base:
            # Jina：/v1/rerank 标准 OpenAI 兼容格式
            rerank_model = "jina-reranker-v2-base-multilingual"
        elif "dashscope" in api_base:
            # 通义：rerank 使用特殊端点（非 /rerank），简单拼接可能失败，失败时自动跳过
            rerank_model = "gte-rerank"
        else:
            # 其他服务商多数不提供 OpenAI 兼容 /rerank 接口，返回 None 以优雅跳过
            rerank_model = None
    return rerank_model, api_base, api_key


# ============= 请求模型 =============

class ChatRequest(BaseModel):
    sessionId: Optional[str] = None
    message: str
    configId: Optional[str] = None
    knowledgeBaseIds: Optional[list[str]] = None  # 新对话时指定知识库
    systemPrompt: Optional[str] = None  # 自定义系统提示词

class ConfigCreateRequest(BaseModel):
    name: Optional[str] = None
    apiBase: str
    apiKey: str
    model: str
    embeddingModel: Optional[str] = None
    rerankModel: Optional[str] = None
    embeddingApiBase: Optional[str] = None
    embeddingApiKey: Optional[str] = None
    rerankApiBase: Optional[str] = None
    rerankApiKey: Optional[str] = None
    maxTokens: Optional[int] = 2048
    temperature: Optional[float] = 0.7
    topP: Optional[float] = 1.0
    topK: Optional[int] = 0
    temperatureEnabled: Optional[bool] = False
    topPEnabled: Optional[bool] = False
    maxTokensEnabled: Optional[bool] = False
    thinkingEnabled: Optional[bool] = False
    thinking: Optional[bool] = False

class ConfigUpdateRequest(BaseModel):
    name: Optional[str] = None
    apiBase: Optional[str] = None
    apiKey: Optional[str] = None
    model: Optional[str] = None
    embeddingModel: Optional[str] = None
    rerankModel: Optional[str] = None
    embeddingApiBase: Optional[str] = None
    embeddingApiKey: Optional[str] = None
    rerankApiBase: Optional[str] = None
    rerankApiKey: Optional[str] = None
    maxTokens: Optional[int] = None
    temperature: Optional[float] = None
    topP: Optional[float] = None
    topK: Optional[int] = None
    temperatureEnabled: Optional[bool] = None
    topPEnabled: Optional[bool] = None
    maxTokensEnabled: Optional[bool] = None
    thinkingEnabled: Optional[bool] = None
    thinking: Optional[bool] = None
    isActive: Optional[bool] = None

class SessionCreateRequest(BaseModel):
    title: Optional[str] = None
    knowledgeBaseIds: Optional[list[str]] = None

class ChunkSettingsRequest(BaseModel):
    chunkSize: int = 500
    chunkOverlap: int = 100
    separator: str = "\\n\\n"

class KnowledgeBaseCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    chunkMode: Optional[str] = "general"  # 'general' or 'parent_child'
    chunkSize: Optional[int] = 500
    chunkOverlap: Optional[int] = 100
    separator: Optional[str] = "\\n\\n"
    parentChunkSize: Optional[int] = 1024
    parentSeparator: Optional[str] = "\\n\\n"
    parentMode: Optional[str] = "paragraph"  # 'paragraph' or 'full'
    childChunkSize: Optional[int] = 512
    childSeparator: Optional[str] = "\\n"
    rerankEnabled: Optional[bool] = False
    indexMode: Optional[str] = "high_quality"  # 'high_quality' or 'economic'
    retrievalTopK: Optional[int] = 5
    scoreThresholdEnabled: Optional[bool] = False
    scoreThreshold: Optional[float] = 0.5
    cleanWhitespace: Optional[bool] = True
    cleanUrlEmail: Optional[bool] = False

class KnowledgeBaseUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    chunkMode: Optional[str] = None
    chunkSize: Optional[int] = None
    chunkOverlap: Optional[int] = None
    separator: Optional[str] = None
    parentChunkSize: Optional[int] = None
    parentSeparator: Optional[str] = None
    parentMode: Optional[str] = None
    childChunkSize: Optional[int] = None
    childSeparator: Optional[str] = None
    rerankEnabled: Optional[bool] = None
    indexMode: Optional[str] = None
    retrievalTopK: Optional[int] = None
    scoreThresholdEnabled: Optional[bool] = None
    scoreThreshold: Optional[float] = None
    cleanWhitespace: Optional[bool] = None
    cleanUrlEmail: Optional[bool] = None


# ============= 健康检查 =============

@app.get("/api/health")
async def health_check():
    config = db.get_active_api_config()
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "apiConfigured": config is not None,
    }


# ============= 文档上传与处理 =============

@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    knowledgeBaseId: Optional[str] = None,
):
    doc_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    # 如果指定了知识库，验证知识库存在
    kb = None
    if knowledgeBaseId:
        kb = db.get_knowledge_base(knowledgeBaseId)
        if not kb:
            raise HTTPException(status_code=404, detail="知识库不存在")

    # 保存文件
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{doc_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    file_size = len(content)

    # 创建文档记录
    doc = db.create_document(
        doc_id=doc_id,
        filename=filename,
        original_name=file.filename,
        file_type=ext.replace('.', ''),
        file_size=file_size,
        file_path=file_path,
        status="processing",
        knowledge_base_id=knowledgeBaseId,
    )

    try:
        # 获取分块配置（优先使用知识库配置）
        if kb:
            chunk_settings = {
                "chunk_size": kb["chunk_size"],
                "chunk_overlap": kb["chunk_overlap"],
                "separator": kb["separator"],
            }
        else:
            chunk_settings = db.get_chunk_settings()

        # 索引方式：high_quality(向量) 或 economic(关键词)
        index_mode = kb.get("index_mode", "high_quality") if kb else "high_quality"

        # 获取活跃 API 配置（高质量模式需要 embedding；经济模式不需要）
        api_config = db.get_active_api_config()
        embedding_model, api_base = (None, None)
        if index_mode != "economic":
            if not api_config:
                db.update_document_status(doc_id, "error")
                raise HTTPException(status_code=400, detail="请先配置大模型 API（高质量索引需要 Embedding 模型）")
            embedding_model, api_base, emb_api_key = resolve_embedding_model(api_config)
            print(f"[Document] 使用嵌入模型: {embedding_model} (api_base: {api_base})")
        else:
            print(f"[Document] 经济模式：使用关键词检索，不调用 embedding")

        # 1. 解析文档
        print(f"[Document] 开始解析文档: {file.filename}")
        text_content = parse_document(file_path, ext)
        print(f"[Document] 解析完成, 内容长度: {len(text_content)}")

        if not text_content or not text_content.strip():
            db.update_document_status(doc_id, "error")
            raise HTTPException(status_code=400, detail="文档内容为空或无法解析")

        # 1.5 文本清洗（按知识库配置）
        if kb:
            text_content = clean_text(
                text_content,
                clean_whitespace=bool(kb.get("clean_whitespace", 1)),
                clean_url_email=bool(kb.get("clean_url_email", 0)),
            )

        # 2. 分块（根据知识库模式选择分块策略）
        chunk_mode = kb.get("chunk_mode", "general") if kb else "general"
        if chunk_mode == "parent_child" and kb:
            chunks = chunk_text_parent_child(
                text=text_content,
                doc_id=doc_id,
                parent_chunk_size=kb.get("parent_chunk_size", 1024),
                parent_separator=kb.get("parent_separator", "\\n\\n"),
                parent_mode=kb.get("parent_mode", "paragraph"),
                child_chunk_size=kb.get("child_chunk_size", 512),
                child_separator=kb.get("child_separator", "\\n"),
            )
            print(f"[Document] 父子分块完成, 共 {len(chunks)} 个子块")
        else:
            chunks = chunk_text(
                text=text_content,
                doc_id=doc_id,
                chunk_size=chunk_settings["chunk_size"],
                chunk_overlap=chunk_settings["chunk_overlap"],
            )
            print(f"[Document] 分块完成, 共 {len(chunks)} 个分块")

        # 3. 存储：经济模式存关键词表，高质量模式存向量库
        if index_mode == "economic":
            db.save_doc_chunks(doc_id, knowledgeBaseId, [c.page_content for c in chunks])
            stored_count = len(chunks)
            print(f"[Document] 经济模式存储完成, 共 {stored_count} 个关键词分块")
        else:
            stored_count = store_chunks_in_chroma(
                documents=chunks,
                doc_id=doc_id,
                api_base=api_base,
                api_key=emb_api_key,
                embedding_model=embedding_model,
                knowledge_base_id=knowledgeBaseId,
            )
            print(f"[Document] 向量存储完成, 共 {stored_count} 个向量")

        # 4. 更新文档状态
        content_preview = text_content[:2000] + "..." if len(text_content) > 2000 else text_content
        db.update_document_status(doc_id, "ready", chunk_count=stored_count, content=content_preview)

        # 5. 更新知识库文档计数
        if knowledgeBaseId:
            kb_docs = db.get_documents_by_kb(knowledgeBaseId)
            ready_count = sum(1 for d in kb_docs if d["status"] == "ready")
            db.update_kb_doc_count(knowledgeBaseId, ready_count)

        doc = db.get_document(doc_id)
        return {
            "document": {
                **doc,
                "contentPreview": content_preview,
                "chunkCount": stored_count,
            },
            "message": f"文档 \"{file.filename}\" 已成功处理，共生成 {stored_count} 个向量块"
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Document] 处理失败: {e}")
        db.update_document_status(doc_id, "error")
        raise HTTPException(status_code=500, detail=f"文档处理失败: {str(e)}")


@app.get("/api/documents")
async def get_documents(knowledgeBaseId: Optional[str] = None):
    docs = db.get_all_documents(knowledgeBaseId)
    result = []
    for d in docs:
        content = d["content"]
        if len(content) > 200:
            content = content[:200] + "..."
        result.append({**d, "content": content})
    return {"documents": result}


@app.post("/api/documents/preview-chunks")
async def preview_chunks(req: dict):
    """预览分段结果（不存储），用于查看当前分段设置的效果"""
    doc_id = req.get("docId")
    chunk_mode = req.get("chunkMode", "general")
    chunk_size = req.get("chunkSize", 500)
    chunk_overlap = req.get("chunkOverlap", 100)
    separator = req.get("separator", "\\n\\n")
    parent_chunk_size = req.get("parentChunkSize", 1024)
    parent_separator = req.get("parentSeparator", "\\n\\n")
    parent_mode = req.get("parentMode", "paragraph")
    child_chunk_size = req.get("childChunkSize", 512)
    child_separator = req.get("childSeparator", "\\n")

    # 获取文档内容
    if doc_id:
        doc = db.get_document(doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="文档不存在")
        text_content = doc.get("content", "")
    else:
        text_content = req.get("content", "")

    if not text_content:
        raise HTTPException(status_code=400, detail="文档内容为空")

    # 解析分隔符
    sep = separator.replace("\\n", "\n").replace("\\t", "\t")
    separators = [sep, "\n\n", "\n", "。", ".", " ", ""]

    # 分块
    if chunk_mode == "parent_child":
        p_sep = parent_separator.replace("\\n", "\n").replace("\\t", "\t")
        c_sep = child_separator.replace("\\n", "\n").replace("\\t", "\t")
        chunks = chunk_text_parent_child(
            text=text_content,
            doc_id="preview",
            parent_chunk_size=parent_chunk_size,
            parent_separator=p_sep,
            parent_mode=parent_mode,
            child_chunk_size=child_chunk_size,
            child_separator=c_sep,
        )
    else:
        chunks = chunk_text(
            text=text_content,
            doc_id="preview",
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=separators,
        )

    return {
        "chunks": [{
            "index": i,
            "content": c.page_content,
            "length": len(c.page_content),
            "parentContent": c.metadata.get("parent_content"),
        } for i, c in enumerate(chunks)],
        "totalChunks": len(chunks),
    }


@app.get("/api/documents/{doc_id}")
async def get_document_detail(doc_id: str):
    doc = db.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {"document": doc, "chunks": []}


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    doc = db.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    # 删除向量数据
    delete_document_vectors(doc_id, doc.get("knowledge_base_id"))
    # 删除元数据
    success = db.delete_document(doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="文档不存在")
    # 更新知识库文档计数
    kb_id = doc.get("knowledge_base_id")
    if kb_id:
        kb_docs = db.get_documents_by_kb(kb_id)
        ready_count = sum(1 for d in kb_docs if d["status"] == "ready")
        db.update_kb_doc_count(kb_id, ready_count)
    return {"success": True}


@app.patch("/api/documents/{doc_id}/toggle")
async def toggle_document(doc_id: str):
    doc = db.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    new_state = not bool(doc.get("is_enabled", 1))
    db.toggle_document_enabled(doc_id, new_state)
    return {"success": True, "is_enabled": new_state}


@app.get("/api/documents/{doc_id}/content")
async def get_document_content(doc_id: str):
    """获取文档完整内容"""
    doc = db.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    content = doc.get("content", "")
    return {
        "documentId": doc_id,
        "documentName": doc.get("original_name", ""),
        "content": content,
        "fileType": doc.get("file_type", ""),
    }


@app.post("/api/documents/{doc_id}/rechunk")
async def rechunk_document(doc_id: str, req: dict):
    """重新分段：删除旧向量，用新设置重新分块并存储"""
    doc = db.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    kb_id = doc.get("knowledge_base_id")
    kb = db.get_knowledge_base(kb_id) if kb_id else None

    # 获取新分段设置（不能改变分段模式）
    chunk_mode = kb.get("chunk_mode", "general") if kb else "general"
    chunk_size = req.get("chunkSize", kb.get("chunk_size", 500) if kb else 500)
    chunk_overlap = req.get("chunkOverlap", kb.get("chunk_overlap", 100) if kb else 100)
    separator = req.get("separator", kb.get("separator", "\\n\\n") if kb else "\\n\\n")
    parent_chunk_size = req.get("parentChunkSize", kb.get("parent_chunk_size", 1024) if kb else 1024)
    parent_separator = req.get("parentSeparator", kb.get("parent_separator", "\\n\\n") if kb else "\\n\\n")
    parent_mode = req.get("parentMode", kb.get("parent_mode", "paragraph") if kb else "paragraph")
    child_chunk_size = req.get("childChunkSize", kb.get("child_chunk_size", 512) if kb else 512)
    child_separator = req.get("childSeparator", kb.get("child_separator", "\\n") if kb else "\\n")

    # 获取 API 配置
    index_mode = kb.get("index_mode", "high_quality") if kb else "high_quality"
    api_config = db.get_active_api_config()
    embedding_model, api_base, emb_api_key = (None, None, None)
    if index_mode != "economic":
        if not api_config:
            raise HTTPException(status_code=400, detail="请先配置大模型 API")
        embedding_model, api_base, emb_api_key = resolve_embedding_model(api_config)

    # 1. 删除旧数据（向量 + 关键词分块）
    delete_document_vectors(doc_id, kb_id)

    # 2. 重新解析文档
    file_path = doc["file_path"]
    file_type = doc["file_type"]
    text_content = parse_document(file_path, file_type)

    if not text_content or not text_content.strip():
        db.update_document_status(doc_id, "error")
        raise HTTPException(status_code=400, detail="文档内容为空或无法解析")

    # 2.5 文本清洗
    if kb:
        text_content = clean_text(
            text_content,
            clean_whitespace=bool(kb.get("clean_whitespace", 1)),
            clean_url_email=bool(kb.get("clean_url_email", 0)),
        )

    # 3. 用新设置重新分块
    sep = separator.replace("\\n", "\n").replace("\\t", "\t")
    separators = [sep, "\n\n", "\n", "。", ".", " ", ""]

    if chunk_mode == "parent_child":
        p_sep = parent_separator.replace("\\n", "\n").replace("\\t", "\t")
        c_sep = child_separator.replace("\\n", "\n").replace("\\t", "\t")
        chunks = chunk_text_parent_child(
            text=text_content,
            doc_id=doc_id,
            parent_chunk_size=parent_chunk_size,
            parent_separator=p_sep,
            parent_mode=parent_mode,
            child_chunk_size=child_chunk_size,
            child_separator=c_sep,
        )
    else:
        chunks = chunk_text(
            text=text_content,
            doc_id=doc_id,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=separators,
        )

    # 4. 存储：经济模式存关键词表，高质量模式存向量库
    if index_mode == "economic":
        db.save_doc_chunks(doc_id, kb_id, [c.page_content for c in chunks])
        stored_count = len(chunks)
    else:
        stored_count = store_chunks_in_chroma(
            documents=chunks,
            doc_id=doc_id,
            api_base=api_base,
            api_key=emb_api_key,
            embedding_model=embedding_model,
            knowledge_base_id=kb_id,
        )

    # 5. 更新文档状态
    content_preview = text_content[:2000] + "..." if len(text_content) > 2000 else text_content
    db.update_document_status(doc_id, "ready", chunk_count=stored_count, content=content_preview)

    print(f"[Rechunk] 文档 {doc_id} 重新分段完成: {len(chunks)} 块 -> {stored_count} 向量 (mode={chunk_mode})")

    return {
        "success": True,
        "chunkCount": stored_count,
        "message": f"重新分段完成，共 {stored_count} 个向量块",
    }


# ============= 分块配置 =============

@app.get("/api/chunk-settings")
async def get_chunk_settings():
    return db.get_chunk_settings()


@app.put("/api/chunk-settings")
async def update_chunk_settings_api(req: ChunkSettingsRequest):
    if req.chunkSize < 100 or req.chunkSize > 10000:
        raise HTTPException(status_code=400, detail="chunk_size 需在 100-10000 之间")
    if req.chunkOverlap < 0 or req.chunkOverlap >= req.chunkSize:
        raise HTTPException(status_code=400, detail="chunk_overlap 需在 0 到 chunk_size 之间")
    db.update_chunk_settings(req.chunkSize, req.chunkOverlap, req.separator)
    return {"success": True}


# ============= API 配置 =============

@app.get("/api/configs")
async def get_configs():
    configs = db.get_all_api_configs()
    active = db.get_active_api_config()
    result = []
    def _mask(k):
        if not k:
            return k
        return k[:8] + "****" + k[-4:] if len(k) > 12 else "****"
    for c in configs:
        result.append({
            **c,
            "api_key": _mask(c["api_key"]),
            "embedding_api_key": _mask(c.get("embedding_api_key")),
            "rerank_api_key": _mask(c.get("rerank_api_key")),
        })
    return {"configs": result, "activeConfigId": active["id"] if active else None}


@app.get("/api/configs/{config_id}/full")
async def get_config_full(config_id: str):
    config = db.get_api_config(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    return {"config": config}


@app.post("/api/configs")
async def create_config(req: ConfigCreateRequest):
    if not req.apiBase or not req.apiKey or not req.model:
        raise HTTPException(status_code=400, detail="请填写 API Base URL、API Key 和模型名称")

    config_id = str(uuid.uuid4())
    config = db.create_api_config(
        config_id=config_id,
        name=req.name or "default",
        api_base=req.apiBase,
        api_key=req.apiKey,
        model=req.model,
        embedding_model=req.embeddingModel,
        rerank_model=req.rerankModel,
        embedding_api_base=req.embeddingApiBase,
        embedding_api_key=req.embeddingApiKey,
        rerank_api_base=req.rerankApiBase,
        rerank_api_key=req.rerankApiKey,
        max_tokens=req.maxTokens or 2048,
        temperature=req.temperature if req.temperature is not None else 0.7,
        top_p=req.topP if req.topP is not None else 1.0,
        top_k=req.topK if req.topK is not None else 0,
        temperature_enabled=1 if req.temperatureEnabled else 0,
        top_p_enabled=1 if req.topPEnabled else 0,
        max_tokens_enabled=1 if req.maxTokensEnabled else 0,
        thinking_enabled=1 if req.thinkingEnabled else 0,
        thinking=1 if req.thinking else 0,
        is_active=1,
    )
    key = config["api_key"]
    masked = key[:8] + "****" + key[-4:] if len(key) > 12 else "****"
    return {"config": {**config, "api_key": masked}}


@app.patch("/api/configs/{config_id}")
async def update_config(config_id: str, req: ConfigUpdateRequest):
    updates = {}
    if req.name is not None: updates["name"] = req.name
    if req.apiBase is not None: updates["api_base"] = req.apiBase
    if req.apiKey is not None: updates["api_key"] = req.apiKey
    if req.model is not None: updates["model"] = req.model
    if req.embeddingModel is not None: updates["embedding_model"] = req.embeddingModel
    if req.rerankModel is not None: updates["rerank_model"] = req.rerankModel
    if req.embeddingApiBase is not None: updates["embedding_api_base"] = req.embeddingApiBase
    if req.embeddingApiKey is not None: updates["embedding_api_key"] = req.embeddingApiKey
    if req.rerankApiBase is not None: updates["rerank_api_base"] = req.rerankApiBase
    if req.rerankApiKey is not None: updates["rerank_api_key"] = req.rerankApiKey
    if req.maxTokens is not None: updates["max_tokens"] = req.maxTokens
    if req.temperature is not None: updates["temperature"] = req.temperature
    if req.topP is not None: updates["top_p"] = req.topP
    if req.topK is not None: updates["top_k"] = req.topK
    if req.temperatureEnabled is not None: updates["temperature_enabled"] = 1 if req.temperatureEnabled else 0
    if req.topPEnabled is not None: updates["top_p_enabled"] = 1 if req.topPEnabled else 0
    if req.maxTokensEnabled is not None: updates["max_tokens_enabled"] = 1 if req.maxTokensEnabled else 0
    if req.thinkingEnabled is not None: updates["thinking_enabled"] = 1 if req.thinkingEnabled else 0
    if req.thinking is not None: updates["thinking"] = 1 if req.thinking else 0
    if req.isActive is not None: updates["is_active"] = 1 if req.isActive else 0

    success = db.update_api_config(config_id, updates)
    if not success:
        raise HTTPException(status_code=404, detail="配置不存在")

    if req.isActive:
        db.set_active_api_config(config_id)

    return {"success": True}


@app.post("/api/configs/{config_id}/activate")
async def activate_config(config_id: str):
    success = db.set_active_api_config(config_id)
    if not success:
        raise HTTPException(status_code=404, detail="配置不存在")
    return {"success": True}


@app.delete("/api/configs/{config_id}")
async def delete_config(config_id: str):
    success = db.delete_api_config(config_id)
    if not success:
        raise HTTPException(status_code=404, detail="配置不存在")
    return {"success": True}


# ============= 会话管理 =============

@app.get("/api/sessions")
async def get_sessions():
    sessions = db.get_all_sessions()
    result = []
    for s in sessions:
        messages = db.get_messages_by_session(s["id"])
        result.append({**s, "messageCount": len(messages)})
    return {"sessions": result}


@app.post("/api/sessions")
async def create_session(req: SessionCreateRequest):
    session_id = str(uuid.uuid4())
    session = db.create_session(session_id, req.title or "新对话", req.knowledgeBaseIds)
    return {"session": session}


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    success = db.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"success": True}


@app.patch("/api/sessions/{session_id}/rename")
async def rename_session(session_id: str, req: dict):
    title = req.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="标题不能为空")
    db.rename_session(session_id, title)
    return {"success": True, "title": title}


@app.post("/api/sessions/{session_id}/toggle-pin")
async def toggle_pin_session(session_id: str):
    new_val = db.toggle_pin_session(session_id)
    return {"success": True, "is_pinned": new_val}


@app.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    messages = db.get_messages_by_session(session_id)
    parsed_messages = []
    for m in messages:
        sources = json.loads(m["sources"]) if m["sources"] else None
        parsed_messages.append({**m, "sources": sources})
    return {"session": session, "messages": parsed_messages}


# ============= 知识库管理 =============

@app.get("/api/knowledge-bases")
async def get_knowledge_bases():
    kbs = db.get_all_knowledge_bases()
    result = []
    for kb in kbs:
        docs = db.get_documents_by_kb(kb["id"])
        result.append({
            **kb,
            "documentCount": kb["doc_count"],
            "chunkMode": kb.get("chunk_mode") or "general",
            "chunkSize": kb.get("chunk_size") or 500,
            "chunkOverlap": kb.get("chunk_overlap") or 100,
            "separator": kb.get("separator") or "\\n\\n",
            "parentChunkSize": kb.get("parent_chunk_size") or 1024,
            "parentSeparator": kb.get("parent_separator") or "\\n\\n",
            "parentMode": kb.get("parent_mode") or "paragraph",
            "childChunkSize": kb.get("child_chunk_size") or 512,
            "childSeparator": kb.get("child_separator") or "\\n",
            "rerankEnabled": bool(kb.get("rerank_enabled", 0)),
            "indexMode": kb.get("index_mode") or "high_quality",
            "retrievalTopK": kb.get("retrieval_top_k") or 5,
            "scoreThresholdEnabled": bool(kb.get("score_threshold_enabled", 0)),
            "scoreThreshold": kb.get("score_threshold") if kb.get("score_threshold") is not None else 0.5,
            "cleanWhitespace": bool(kb.get("clean_whitespace", 1)),
            "cleanUrlEmail": bool(kb.get("clean_url_email", 0)),
            "documents": [{
                "id": d["id"],
                "originalName": d["original_name"],
                "fileType": d["file_type"],
                "fileSize": d["file_size"],
                "chunkCount": d["chunk_count"],
                "status": d["status"],
                "isEnabled": bool(d.get("is_enabled", 1)),
                "createdAt": d["created_at"],
            } for d in docs],
        })
    return {"knowledgeBases": result}


@app.post("/api/knowledge-bases")
async def create_knowledge_base(req: KnowledgeBaseCreateRequest):
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="知识库名称不能为空")
    kb_id = str(uuid.uuid4())
    kb = db.create_knowledge_base(
        kb_id=kb_id,
        name=req.name.strip(),
        description=req.description or "",
        chunk_mode=req.chunkMode or "general",
        chunk_size=req.chunkSize or 500,
        chunk_overlap=req.chunkOverlap or 100,
        separator=req.separator or "\\n\\n",
        parent_chunk_size=req.parentChunkSize or 1024,
        parent_separator=req.parentSeparator or "\\n\\n",
        parent_mode=req.parentMode or "paragraph",
        child_chunk_size=req.childChunkSize or 512,
        child_separator=req.childSeparator or "\\n",
        rerank_enabled=1 if req.rerankEnabled else 0,
        index_mode=req.indexMode or "high_quality",
        retrieval_top_k=req.retrievalTopK or 5,
        score_threshold_enabled=1 if req.scoreThresholdEnabled else 0,
        score_threshold=req.scoreThreshold or 0.5,
        clean_whitespace=1 if req.cleanWhitespace else 0,
        clean_url_email=1 if req.cleanUrlEmail else 0,
    )
    return {"knowledgeBase": kb}


@app.patch("/api/knowledge-bases/{kb_id}")
async def update_knowledge_base(kb_id: str, req: KnowledgeBaseUpdateRequest):
    kb = db.get_knowledge_base(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    updates = {}
    if req.name is not None: updates["name"] = req.name
    if req.description is not None: updates["description"] = req.description
    if req.chunkMode is not None: updates["chunk_mode"] = req.chunkMode
    if req.chunkSize is not None: updates["chunk_size"] = req.chunkSize
    if req.chunkOverlap is not None: updates["chunk_overlap"] = req.chunkOverlap
    if req.separator is not None: updates["separator"] = req.separator
    if req.parentChunkSize is not None: updates["parent_chunk_size"] = req.parentChunkSize
    if req.parentSeparator is not None: updates["parent_separator"] = req.parentSeparator
    if req.parentMode is not None: updates["parent_mode"] = req.parentMode
    if req.childChunkSize is not None: updates["child_chunk_size"] = req.childChunkSize
    if req.childSeparator is not None: updates["child_separator"] = req.childSeparator
    if req.rerankEnabled is not None: updates["rerank_enabled"] = 1 if req.rerankEnabled else 0
    if req.indexMode is not None: updates["index_mode"] = req.indexMode
    if req.retrievalTopK is not None: updates["retrieval_top_k"] = req.retrievalTopK
    if req.scoreThresholdEnabled is not None: updates["score_threshold_enabled"] = 1 if req.scoreThresholdEnabled else 0
    if req.scoreThreshold is not None: updates["score_threshold"] = req.scoreThreshold
    if req.cleanWhitespace is not None: updates["clean_whitespace"] = 1 if req.cleanWhitespace else 0
    if req.cleanUrlEmail is not None: updates["clean_url_email"] = 1 if req.cleanUrlEmail else 0
    success = db.update_knowledge_base(kb_id, updates)
    if not success:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return {"success": True}


@app.delete("/api/knowledge-bases/{kb_id}")
async def delete_knowledge_base(kb_id: str):
    # 删除知识库下的所有文档向量
    docs = db.get_documents_by_kb(kb_id)
    for doc in docs:
        delete_document_vectors(doc["id"], kb_id)
    # 删除知识库（CASCADE 会删除关联文档记录）
    success = db.delete_knowledge_base(kb_id)
    if not success:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return {"success": True}


# ============= RAG 聊天（流式） =============

@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="消息不能为空")

    # 获取 API 配置
    api_config = None
    if req.configId:
        api_config = db.get_api_config(req.configId)
    if not api_config:
        api_config = db.get_active_api_config()
    if not api_config:
        raise HTTPException(status_code=400, detail="请先配置大模型 API")

    api_base = api_config["api_base"].rstrip("/")
    api_key = api_config["api_key"]
    model = api_config["model"]
    embedding_model, emb_api_base, emb_api_key = resolve_embedding_model(api_config)
    # 生成参数：仅在对应开关打开时生效，否则用服务商默认（不发送）
    temp_enabled = api_config.get("temperature_enabled", 0)
    top_p_enabled = api_config.get("top_p_enabled", 0)
    max_tokens_enabled = api_config.get("max_tokens_enabled", 0)
    thinking_enabled = api_config.get("thinking_enabled", 0)
    temperature = api_config.get("temperature", 0.7) if temp_enabled else None
    max_tokens = api_config.get("max_tokens", 2048) if max_tokens_enabled else None
    top_p = api_config.get("top_p", 1.0) if top_p_enabled else None
    thinking = bool(api_config.get("thinking", 0)) if thinking_enabled else None
    rerank_model, rerank_api_base, rerank_api_key = resolve_rerank_model(api_config)

    # 获取或创建会话
    now = datetime.utcnow().isoformat()
    session = None
    if req.sessionId:
        session = db.get_session(req.sessionId)
    if not session:
        session_id = req.sessionId or str(uuid.uuid4())
        title = req.message[:30] + ("..." if len(req.message) > 30 else "")
        session = db.create_session(session_id, title, req.knowledgeBaseIds)
    else:
        session_id = session["id"]

    # 保存用户消息
    user_msg_id = str(uuid.uuid4())
    db.create_message(user_msg_id, session_id, "user", req.message)

    # 获取会话关联的知识库
    session_kb_ids = []
    if req.sessionId:
        _s = db.get_session(req.sessionId)
        if _s and _s.get("knowledge_base_ids"):
            session_kb_ids = json.loads(_s["knowledge_base_ids"])

    # 历史对话（保存用户消息之前的记录，用于多轮 query 改写）
    prior_messages = db.get_messages_by_session(session_id)
    prior_messages = [m for m in prior_messages if m["id"] != user_msg_id]

    # 检索相关文档（每个知识库使用各自的索引方式与检索参数）
    relevant_chunks = []
    overall_top_k = 5
    try:
        # 禁用的文档 ID 列表
        exclude_doc_ids = []
        if session_kb_ids:
            for kb_id in session_kb_ids:
                for d in db.get_documents_by_kb(kb_id):
                    if not d.get("is_enabled", 1):
                        exclude_doc_ids.append(d["id"])

        # 多轮对话：结合历史把追问改写为独立检索问题
        search_query = req.message
        if prior_messages and session_kb_ids:
            search_query = rewrite_query_with_history(
                query=req.message,
                history_messages=prior_messages,
                api_base=api_base,
                api_key=api_key,
                model=model,
            )

        if session_kb_ids:
            for kb_id in session_kb_ids:
                kb = db.get_knowledge_base(kb_id)
                if not kb:
                    continue
                kb_top_k = kb.get("retrieval_top_k", 5) or 5
                overall_top_k = max(overall_top_k, kb_top_k)
                kb_threshold = (kb.get("score_threshold", 0.5) or 0.0) if kb.get("score_threshold_enabled") else 0.0
                kb_index_mode = kb.get("index_mode", "high_quality")

                if kb_index_mode == "economic":
                    # 经济模式：关键词检索（不调 embedding）
                    kb_chunks = db.get_doc_chunks_by_kbs([kb_id], exclude_doc_ids or None)
                    hits = keyword_search(search_query, kb_chunks, top_k=kb_top_k)
                    if kb_threshold:
                        hits = [h for h in hits if h["score"] >= kb_threshold]
                    relevant_chunks.extend(hits)
                    print(f"[RAG] 经济模式检索 kb={kb_id}: {len(hits)} 块 (top_k={kb_top_k}, 阈值={kb_threshold})")
                else:
                    # 高质量模式：向量检索
                    hits = search_similar_chunks(
                        query=search_query,
                        api_base=emb_api_base,
                        api_key=emb_api_key,
                        embedding_model=embedding_model,
                        top_k=kb_top_k,
                        score_threshold=kb_threshold,
                        knowledge_base_ids=[kb_id],
                        exclude_doc_ids=exclude_doc_ids if exclude_doc_ids else None,
                    )
                    # rerank（该知识库开启且能推断出 rerank 模型时）
                    if kb.get("rerank_enabled") and rerank_model and hits:
                        hits = rerank_chunks(
                            query=search_query, chunks=hits,
                            api_base=rerank_api_base, api_key=rerank_api_key,
                            rerank_model=rerank_model, top_k=kb_top_k,
                        )
                    relevant_chunks.extend(hits)
                    print(f"[RAG] 高质量检索 kb={kb_id}: {len(hits)} 块 (top_k={kb_top_k}, 阈值={kb_threshold}, rerank={bool(kb.get('rerank_enabled'))})")

            # 多知识库合并后按分数降序截断
            relevant_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
            relevant_chunks = relevant_chunks[:overall_top_k]
    except Exception as e:
        print(f"[RAG] 检索失败: {e}")

    # 构建上下文（不标注序号，由后端算法自动匹配引用）
    sources_info = []
    context_text = ""
    if relevant_chunks:
        context_text = "以下是从文档中检索到的相关内容，请基于这些内容回答用户的问题：\n\n"
        for i, chunk in enumerate(relevant_chunks):
            doc = db.get_document(chunk["document_id"])
            doc_name = doc["original_name"] if doc else "未知文档"
            context_text += f"《{doc_name}》：\n{chunk['content']}\n\n"
            sources_info.append({
                "documentId": chunk["document_id"],
                "chunkIndex": chunk["chunk_index"],
                "contentPreview": chunk["content"][:100] + ("..." if len(chunk["content"]) > 100 else ""),
                "content": chunk["content"],
                "documentName": doc_name,
            })

    # 获取历史对话（最近 10 条）
    history_messages = db.get_messages_by_session(session_id)[-10:]

    # 构建系统 prompt
    has_documents = len(relevant_chunks) > 0
    if req.systemPrompt and req.systemPrompt.strip():
        # 使用自定义系统提示词
        system_prompt = req.systemPrompt.strip()
    elif has_documents:
        system_prompt = """你是一个专业的文档问答助手。你的任务是根据提供的文档内容回答问题。

规则：
1. 优先基于文档内容回答，确保准确引用文档中的信息
2. 如果文档中没有相关信息，请说明并给出你的理解
3. 回答要简洁清晰，有条理
4. 不要自行添加任何引用标记（如 [1]、[2] 等），直接回答即可"""
    else:
        system_prompt = """你是一个智能 AI 助手。你可以帮助用户回答各种问题、提供建议和进行讨论。

规则：
1. 回答要准确、简洁、有条理
2. 如果不确定，请坦诚说明
3. 对复杂问题可以分步骤解释
4. 保持友善和专业的态度"""

    # 构建 LangChain 消息列表
    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

    lc_messages = [SystemMessage(content=system_prompt)]
    if has_documents:
        lc_messages.append(SystemMessage(content=context_text))
    for msg in history_messages:
        if msg["role"] == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_messages.append(AIMessage(content=msg["content"]))
    lc_messages.append(HumanMessage(content=req.message))

    # 创建 LLM 实例
    llm = get_chat_llm(api_base, api_key, model, temperature, max_tokens, top_p, thinking)

    # SSE 流式响应
    assistant_msg_id = str(uuid.uuid4())

    async def event_stream():
        # 发送初始化信息
        yield f"data: {json.dumps({'type': 'init', 'sessionId': session_id, 'userMessageId': user_msg_id, 'assistantMessageId': assistant_msg_id, 'sources': sources_info})}\n\n"

        full_response = ""
        try:
            # 流式调用 LLM
            for chunk in llm.stream(lc_messages):
                if chunk.content:
                    full_response += chunk.content
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk.content})}\n\n"

            # LLM 生成完成后，直接结束（不再进行引用匹配）
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            print(f"[Chat] LLM 调用失败: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'API 调用失败: {str(e)}'})}\n\n"

        # 保存助手消息（使用带引用标记的答案）
        db.create_message(
            assistant_msg_id, session_id, "assistant", full_response,
            sources=json.dumps(sources_info) if sources_info else None
        )

        # 更新会话标题
        messages = db.get_messages_by_session(session_id)
        if len(messages) <= 2:
            db.update_session(session_id, req.message[:30])

        print(f"[RAG] 请求完成 ✓")

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ============= 启动 =============

if __name__ == "__main__":
    import uvicorn
    print("""
╔══════════════════════════════════════════════════╗
║                                                  ║
║     ◉ RAG 智能问答服务器 (Python) 已启动          ║
║                                                  ║
║     地址: http://localhost:3000                   ║
║     前端: http://localhost:5173                   ║
║     数据库: SQLite + ChromaDB                     ║
║                                                  ║
║     请先在前端配置大模型 API 后使用               ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    """)
    uvicorn.run(app, host="0.0.0.0", port=3000)
