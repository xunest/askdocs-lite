"""
RAG 引擎 - 基于 LangChain + ChromaDB 的向量检索系统
负责：文档解析 → 分块 → Embedding → 向量存储 → 语义检索
"""
import os
import uuid
from typing import Optional

from langchain_community.document_loaders import (
    TextLoader,
    PyPDFLoader,
    Docx2txtLoader,
    CSVLoader,
    JSONLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_chroma import Chroma
from langchain_core.documents import Document as LangchainDocument
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

# ChromaDB 持久化存储路径
CHROMA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'chroma_db')
os.makedirs(CHROMA_DIR, exist_ok=True)

# 统一使用单一 collection，通过 metadata 过滤区分文档/知识库
COLLECTION_NAME = "rag_documents"


import re


def clean_text(text: str, clean_whitespace: bool = True, clean_url_email: bool = False) -> str:
    """文本预处理清洗。
    - clean_whitespace: 替换连续的空格/换行/制表符为单个空格
    - clean_url_email: 删除所有 URL 和邮箱地址
    """
    if clean_url_email:
        text = re.sub(r'https?://\S+|www\.\S+', '', text)
        text = re.sub(r'\b[\w.+-]+@[\w-]+\.[\w.-]+\b', '', text)
    if clean_whitespace:
        text = re.sub(r'[ \t\r\f\v]+', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _tokenize(text: str) -> list[str]:
    """轻量分词：英文/数字按词切，中文按 2-gram 切（无外部依赖）。"""
    text = text.lower()
    tokens = []
    # 英文单词与数字
    tokens += re.findall(r'[a-z0-9]+', text)
    # 中文字符做 bigram
    cjk = re.findall(r'[\u4e00-\u9fff]', text)
    for i in range(len(cjk) - 1):
        tokens.append(cjk[i] + cjk[i + 1])
    if len(cjk) == 1:
        tokens.append(cjk[0])
    return tokens


def keyword_search(query: str, chunks: list[dict], top_k: int = 5) -> list[dict]:
    """基于词频重叠的关键词检索（经济模式，不调用 embedding）。
    chunks: [{content, document_id, chunk_index}, ...]
    返回带 score(0~1) 的结果，按分数降序截断 top_k。
    """
    q_tokens = _tokenize(query)
    if not q_tokens or not chunks:
        return []
    from collections import Counter
    q_counter = Counter(q_tokens)
    q_total = sum(q_counter.values())

    scored = []
    for c in chunks:
        c_tokens = _tokenize(c.get("content", ""))
        if not c_tokens:
            continue
        c_counter = Counter(c_tokens)
        # 命中查询词的加权计数
        overlap = sum(min(q_counter[t], c_counter.get(t, 0)) for t in q_counter)
        if overlap <= 0:
            continue
        # 归一化到 0~1：命中占查询词比例
        score = overlap / q_total
        scored.append({
            "content": c.get("content", ""),
            "document_id": c.get("document_id", ""),
            "chunk_index": c.get("chunk_index", 0),
            "score": round(min(score, 1.0), 4),
        })
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


# ============= 文档解析 =============

def parse_document(file_path: str, file_type: str) -> str:
    """解析文档，返回纯文本内容"""
    ext = file_type.lower().replace('.', '')

    try:
        if ext in ('txt', 'md', 'log'):
            loader = TextLoader(file_path, encoding='utf-8')
            docs = loader.load()
            return "\n\n".join([d.page_content for d in docs])

        elif ext == 'pdf':
            loader = PyPDFLoader(file_path)
            docs = loader.load()
            return "\n\n".join([d.page_content for d in docs])

        elif ext in ('docx', 'doc'):
            loader = Docx2txtLoader(file_path)
            docs = loader.load()
            return "\n\n".join([d.page_content for d in docs])

        elif ext == 'csv':
            loader = CSVLoader(file_path, encoding='utf-8')
            docs = loader.load()
            return "\n\n".join([d.page_content for d in docs])

        elif ext == 'json':
            loader = JSONLoader(file_path, jq_schema='.', text_content=False)
            docs = loader.load()
            return "\n\n".join([d.page_content for d in docs])

        else:
            # 尝试作为文本读取
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()

    except Exception as e:
        raise ValueError(f"文档解析失败 ({ext}): {str(e)}")


# ============= 文本分块 =============

def chunk_text(
    text: str,
    doc_id: str,
    chunk_size: int = 500,
    chunk_overlap: int = 100,
    separators: Optional[list[str]] = None,
) -> list[LangchainDocument]:
    """
    使用 LangChain RecursiveCharacterTextSplitter 进行分块
    
    默认参数（工业界常用）：
    - chunk_size: 500 字符
    - chunk_overlap: 100 字符（约 20%）
    - separators: ["\\n\\n", "\\n", "。", ".", " ", ""]
    """
    if not text or not text.strip():
        return []

    if separators is None:
        separators = ["\n\n", "\n", "。", ".", " ", ""]

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=separators,
        length_function=len,
    )

    chunks = splitter.split_text(text)

    documents = []
    for i, chunk_content in enumerate(chunks):
        doc = LangchainDocument(
            page_content=chunk_content,
            metadata={
                "document_id": doc_id,
                "chunk_index": i,
                "source": doc_id,
            }
        )
        documents.append(doc)

    return documents


def chunk_text_parent_child(
    text: str,
    doc_id: str,
    parent_chunk_size: int = 1024,
    parent_separator: str = "\\n\\n",
    parent_mode: str = "paragraph",  # 'paragraph' or 'full'
    child_chunk_size: int = 512,
    child_separator: str = "\\n",
) -> list[LangchainDocument]:
    """
    父子分块模式：
    - 父块：用于提供上下文（大段落或全文）
    - 子块：用于检索（小段落）
    
    子块的 metadata 中包含 parent_content，检索到子块时返回父块内容作为上下文。
    """
    if not text or not text.strip():
        return []

    separators = ["\n\n", "\n", "。", ".", " ", ""]

    if parent_mode == "full":
        # 全文模式：整个文档作为一个父块
        parent_chunks = [text]
    else:
        # 段落模式：按分隔符拆分为段落作为父块
        parent_splitter = RecursiveCharacterTextSplitter(
            chunk_size=parent_chunk_size,
            chunk_overlap=0,
            separators=[parent_separator] + separators,
            length_function=len,
        )
        parent_chunks = parent_splitter.split_text(text)

    # 为每个父块创建子块
    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=child_chunk_size,
        chunk_overlap=0,
        separators=[child_separator] + separators,
        length_function=len,
    )

    documents = []
    chunk_index = 0
    for parent_idx, parent_content in enumerate(parent_chunks):
        child_chunks = child_splitter.split_text(parent_content)
        for child_content in child_chunks:
            doc = LangchainDocument(
                page_content=child_content,
                metadata={
                    "document_id": doc_id,
                    "chunk_index": chunk_index,
                    "parent_index": parent_idx,
                    "source": doc_id,
                    "parent_content": parent_content,  # 父块内容作为上下文
                }
            )
            documents.append(doc)
            chunk_index += 1

    return documents


# ============= Embedding & 向量存储 =============

def get_embeddings(api_base: str, api_key: str, model: str) -> OpenAIEmbeddings:
    """创建 OpenAI-compatible Embeddings 实例"""
    return OpenAIEmbeddings(
        openai_api_base=api_base,
        openai_api_key=api_key,
        model=model,
    )


def get_vectorstore(embeddings) -> Chroma:
    """获取统一的 Chroma 向量库实例（cosine 距离空间）"""
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=CHROMA_DIR,
        collection_metadata={"hnsw:space": "cosine"},
    )


def store_chunks_in_chroma(
    documents: list[LangchainDocument],
    doc_id: str,
    api_base: str,
    api_key: str,
    embedding_model: str,
    knowledge_base_id: Optional[str] = None,
) -> int:
    """将分块文档存入统一的 ChromaDB collection，用 metadata 标记归属"""
    if not documents:
        return 0

    embeddings = get_embeddings(api_base, api_key, embedding_model)

    # 补齐 metadata，确保可按文档/知识库过滤
    for i, doc in enumerate(documents):
        doc.metadata["document_id"] = doc_id
        if knowledge_base_id:
            doc.metadata["knowledge_base_id"] = knowledge_base_id
        if "chunk_index" not in doc.metadata:
            doc.metadata["chunk_index"] = i

    texts = [doc.page_content for doc in documents]
    metadatas = [doc.metadata for doc in documents]
    ids = [f"{doc_id}_chunk_{i}" for i in range(len(documents))]

    vectorstore = get_vectorstore(embeddings)
    vectorstore.add_texts(texts=texts, metadatas=metadatas, ids=ids)

    return len(documents)


def delete_document_vectors(doc_id: str, knowledge_base_id: Optional[str] = None):
    """从统一 collection 中删除指定文档的所有向量（按 metadata 过滤）"""
    try:
        import chromadb
        client = chromadb.PersistentClient(path=CHROMA_DIR)
        collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        collection.delete(where={"document_id": doc_id})
        print(f"[ChromaDB] 已删除文档向量: document_id={doc_id}")
    except Exception as e:
        print(f"[ChromaDB] 删除文档 {doc_id} 向量失败: {e}")


# ============= 语义检索 =============

def search_similar_chunks(
    query: str,
    api_base: str,
    api_key: str,
    embedding_model: str,
    top_k: int = 5,
    score_threshold: float = 0.0,
    doc_ids: Optional[list[str]] = None,
    knowledge_base_ids: Optional[list[str]] = None,
    exclude_doc_ids: Optional[list[str]] = None,
) -> list[dict]:
    """
    语义检索：在统一 collection 中按 metadata 过滤并做 cosine 相似度检索

    参数:
    - top_k: 返回最相关的前 k 个文本块
    - score_threshold: 相似度阈值(0~1)，低于该值的结果会被过滤；0 表示不过滤
    - doc_ids: 限定文档范围
    - knowledge_base_ids: 限定知识库范围
    - exclude_doc_ids: 排除的文档（禁用的文档）

    返回: [{"content", "document_id", "chunk_index", "score"(相似度0~1)}, ...]
    """
    embeddings = get_embeddings(api_base, api_key, embedding_model)
    vectorstore = get_vectorstore(embeddings)

    # 构建 metadata 过滤条件
    conditions = []
    if doc_ids:
        conditions.append({"document_id": {"$in": doc_ids}})
    if knowledge_base_ids:
        conditions.append({"knowledge_base_id": {"$in": knowledge_base_ids}})
    if exclude_doc_ids:
        conditions.append({"document_id": {"$nin": exclude_doc_ids}})

    where_filter = None
    if len(conditions) == 1:
        where_filter = conditions[0]
    elif len(conditions) > 1:
        where_filter = {"$and": conditions}

    # 多召回一些用于阈值过滤/rerank，最终再截断到 top_k
    fetch_k = max(top_k * 4, 20)
    try:
        results = vectorstore.similarity_search_with_score(query, k=fetch_k, filter=where_filter)
    except Exception as e:
        print(f"[RAG] 向量检索失败: {e}")
        return []

    parsed = []
    for doc, distance in results:
        # cosine 空间下 Chroma 返回的是距离(0~2)，相似度 = 1 - 距离
        similarity = 1.0 - float(distance)
        if score_threshold and similarity < score_threshold:
            continue
        # 父子模式：使用父块内容作为上下文
        content = doc.metadata.get("parent_content") or doc.page_content
        parsed.append({
            "content": content,
            "document_id": doc.metadata.get("document_id", ""),
            "chunk_index": doc.metadata.get("chunk_index", 0),
            "score": round(similarity, 4),
        })

    # 按相似度降序，截断到 top_k
    parsed.sort(key=lambda x: x["score"], reverse=True)
    return parsed[:top_k]


def rerank_chunks(
    query: str,
    chunks: list[dict],
    api_base: str,
    api_key: str,
    rerank_model: str,
    top_k: int = 5,
) -> list[dict]:
    """使用 rerank 模型对候选块二次精排（OpenAI 兼容 /rerank 接口）。
    失败时返回原候选，保证优雅降级。"""
    if not chunks or not rerank_model:
        return chunks[:top_k]
    try:
        import requests
        url = api_base.rstrip("/") + "/rerank"
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": rerank_model,
                "query": query,
                "documents": [c["content"] for c in chunks],
                "top_n": top_k,
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        reranked = []
        for item in data.get("results", []):
            idx = item.get("index")
            if idx is not None and 0 <= idx < len(chunks):
                c = dict(chunks[idx])
                c["score"] = round(float(item.get("relevance_score", c.get("score", 0))), 4)
                reranked.append(c)
        if reranked:
            print(f"[Rerank] 重排完成，候选 {len(chunks)} -> 返回 {len(reranked)}")
            return reranked[:top_k]
        return chunks[:top_k]
    except Exception as e:
        print(f"[Rerank] 重排失败，降级为原始检索结果: {e}")
        return chunks[:top_k]


def rewrite_query_with_history(
    query: str,
    history_messages: list[dict],
    api_base: str,
    api_key: str,
    model: str,
) -> str:
    """结合历史对话把可能含指代的追问改写成独立完整的检索问题。
    失败或无历史时返回原问题。"""
    # 收集最近的对话历史（仅取 user/assistant 文本）
    hist = [m for m in history_messages if m.get("role") in ("user", "assistant")]
    if not hist:
        return query
    try:
        recent = hist[-6:]
        convo = "\n".join(
            f"{'用户' if m['role'] == 'user' else '助手'}：{m['content']}" for m in recent
        )
        prompt = (
            "以下是历史对话，请把用户的最新问题改写成一个不依赖上下文、语义完整、可独立用于文档检索的问题。"
            "只输出改写后的问题本身，不要任何解释。\n\n"
            f"历史对话：\n{convo}\n\n最新问题：{query}\n\n改写后的问题："
        )
        llm = ChatOpenAI(
            openai_api_base=api_base,
            openai_api_key=api_key,
            model_name=model,
            temperature=0.0,
            max_tokens=200,
            streaming=False,
        )
        result = llm.invoke([HumanMessage(content=prompt)])
        rewritten = (result.content or "").strip()
        if rewritten:
            print(f"[QueryRewrite] '{query}' -> '{rewritten}'")
            return rewritten
        return query
    except Exception as e:
        print(f"[QueryRewrite] 改写失败，使用原问题: {e}")
        return query


# ============= LLM 调用 =============

def get_chat_llm(api_base: str, api_key: str, model: str,
                 temperature: Optional[float] = None,
                 max_tokens: Optional[int] = None,
                 top_p: Optional[float] = None,
                 thinking: Optional[bool] = None) -> ChatOpenAI:
    """创建 OpenAI-compatible Chat LLM 实例。

    温度/最大token/top_p/思考模式均为可选，None 表示不设置、使用服务商默认值。
    thinking 通过 extra_body.enable_thinking 传递（兼容通义/智谱等），不支持的模型会自动忽略。
    """
    model_kwargs = {}
    extra_body = {}
    if top_p is not None:
        model_kwargs["top_p"] = top_p
    if thinking is not None:
        extra_body["enable_thinking"] = bool(thinking)
    if extra_body:
        model_kwargs["extra_body"] = extra_body

    kwargs = dict(
        openai_api_base=api_base,
        openai_api_key=api_key,
        model_name=model,
        streaming=True,
        model_kwargs=model_kwargs,
    )
    if temperature is not None:
        kwargs["temperature"] = temperature
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    return ChatOpenAI(**kwargs)
