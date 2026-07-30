"""
SQLite 数据库层 - 管理元数据（会话、消息、文档、API配置）
向量数据存储在 ChromaDB 中（见 rag_engine.py）
"""
import sqlite3
import os
import json
from datetime import datetime
from typing import Optional
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'rag.db')
DATA_DIR = os.path.dirname(DB_PATH)

os.makedirs(DATA_DIR, exist_ok=True)


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """初始化数据库表"""
    with get_db() as conn:
        # 临时关闭外键检查，避免 IF NOT EXISTS 时因列不存在而报错
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS knowledge_bases (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                chunk_mode TEXT NOT NULL DEFAULT 'general' CHECK (chunk_mode IN ('general', 'parent_child')),
                chunk_size INTEGER NOT NULL DEFAULT 500,
                chunk_overlap INTEGER NOT NULL DEFAULT 100,
                separator TEXT NOT NULL DEFAULT '\\n\\n',
                -- 父子分段模式专用
                parent_chunk_size INTEGER NOT NULL DEFAULT 1024,
                parent_separator TEXT NOT NULL DEFAULT '\\n\\n',
                parent_mode TEXT NOT NULL DEFAULT 'paragraph' CHECK (parent_mode IN ('paragraph', 'full')),
                child_chunk_size INTEGER NOT NULL DEFAULT 512,
                child_separator TEXT NOT NULL DEFAULT '\\n',
                rerank_enabled INTEGER NOT NULL DEFAULT 0,
                index_mode TEXT NOT NULL DEFAULT 'high_quality',
                retrieval_top_k INTEGER NOT NULL DEFAULT 5,
                score_threshold_enabled INTEGER NOT NULL DEFAULT 0,
                score_threshold REAL NOT NULL DEFAULT 0.5,
                clean_whitespace INTEGER NOT NULL DEFAULT 1,
                clean_url_email INTEGER NOT NULL DEFAULT 0,
                doc_count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'empty' CHECK (status IN ('empty', 'indexing', 'ready')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                knowledge_base_ids TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                content TEXT NOT NULL,
                sources TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                knowledge_base_id TEXT,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                file_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                content TEXT NOT NULL,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL CHECK (status IN ('uploading', 'pending', 'processing', 'ready', 'error')),
                is_enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            -- 关键词检索用的分块表（经济模式）
            CREATE TABLE IF NOT EXISTS doc_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                knowledge_base_id TEXT,
                chunk_index INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc ON doc_chunks(document_id);
            CREATE INDEX IF NOT EXISTS idx_doc_chunks_kb ON doc_chunks(knowledge_base_id);

            CREATE TABLE IF NOT EXISTS api_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT 'default',
                api_base TEXT NOT NULL,
                api_key TEXT NOT NULL,
                model TEXT NOT NULL,
                embedding_model TEXT,
                rerank_model TEXT,
                embedding_api_base TEXT,
                embedding_api_key TEXT,
                rerank_api_base TEXT,
                rerank_api_key TEXT,
                max_tokens INTEGER DEFAULT 2048,
                temperature REAL DEFAULT 0.7,
                top_p REAL DEFAULT 1.0,
                top_k INTEGER DEFAULT 0,
                temperature_enabled INTEGER DEFAULT 0,
                top_p_enabled INTEGER DEFAULT 0,
                max_tokens_enabled INTEGER DEFAULT 0,
                thinking_enabled INTEGER DEFAULT 0,
                thinking INTEGER DEFAULT 0,
                retrieval_top_k INTEGER DEFAULT 5,
                score_threshold REAL DEFAULT 0.0,
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            -- 分块配置表
            CREATE TABLE IF NOT EXISTS chunk_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                chunk_size INTEGER NOT NULL DEFAULT 500,
                chunk_overlap INTEGER NOT NULL DEFAULT 100,
                separator TEXT NOT NULL DEFAULT '\\n\\n',
                updated_at TEXT NOT NULL
            );
        """)
        conn.execute("PRAGMA foreign_keys=ON")
        
        # 迁移：为已有表添加新列
        try:
            conn.execute("ALTER TABLE sessions ADD COLUMN knowledge_base_ids TEXT")
        except Exception:
            pass  # 列已存在
        try:
            conn.execute("ALTER TABLE documents ADD COLUMN knowledge_base_id TEXT")
        except Exception:
            pass  # 列已存在
        try:
            conn.execute("ALTER TABLE knowledge_bases ADD COLUMN chunk_mode TEXT DEFAULT 'general'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE knowledge_bases ADD COLUMN parent_chunk_size INTEGER DEFAULT 1024")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE knowledge_bases ADD COLUMN parent_separator TEXT DEFAULT '\\n\\n'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE knowledge_bases ADD COLUMN parent_mode TEXT DEFAULT 'paragraph'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE knowledge_bases ADD COLUMN child_chunk_size INTEGER DEFAULT 512")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE knowledge_bases ADD COLUMN child_separator TEXT DEFAULT '\\n'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE documents ADD COLUMN is_enabled INTEGER DEFAULT 1")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE sessions ADD COLUMN is_pinned INTEGER DEFAULT 0")
        except Exception:
            pass
        # 迁移：knowledge_bases 增加 rerank 开关
        try:
            conn.execute("ALTER TABLE knowledge_bases ADD COLUMN rerank_enabled INTEGER DEFAULT 0")
        except Exception:
            pass
        # 迁移：knowledge_bases 增加索引方式/检索/清洗字段
        for _col, _ddl in [
            ("index_mode", "ALTER TABLE knowledge_bases ADD COLUMN index_mode TEXT DEFAULT 'high_quality'"),
            ("retrieval_top_k", "ALTER TABLE knowledge_bases ADD COLUMN retrieval_top_k INTEGER DEFAULT 5"),
            ("score_threshold_enabled", "ALTER TABLE knowledge_bases ADD COLUMN score_threshold_enabled INTEGER DEFAULT 0"),
            ("kb_score_threshold", "ALTER TABLE knowledge_bases ADD COLUMN score_threshold REAL DEFAULT 0.5"),
            ("clean_whitespace", "ALTER TABLE knowledge_bases ADD COLUMN clean_whitespace INTEGER DEFAULT 1"),
            ("clean_url_email", "ALTER TABLE knowledge_bases ADD COLUMN clean_url_email INTEGER DEFAULT 0"),
        ]:
            try:
                conn.execute(_ddl)
            except Exception:
                pass
        # 迁移：api_configs 增加生成/检索参数字段
        for _col, _ddl in [
            ("rerank_model", "ALTER TABLE api_configs ADD COLUMN rerank_model TEXT"),
            ("top_p", "ALTER TABLE api_configs ADD COLUMN top_p REAL DEFAULT 1.0"),
            ("top_k", "ALTER TABLE api_configs ADD COLUMN top_k INTEGER DEFAULT 0"),
            ("retrieval_top_k", "ALTER TABLE api_configs ADD COLUMN retrieval_top_k INTEGER DEFAULT 5"),
            ("score_threshold", "ALTER TABLE api_configs ADD COLUMN score_threshold REAL DEFAULT 0.0"),
            ("temperature_enabled", "ALTER TABLE api_configs ADD COLUMN temperature_enabled INTEGER DEFAULT 0"),
            ("top_p_enabled", "ALTER TABLE api_configs ADD COLUMN top_p_enabled INTEGER DEFAULT 0"),
            ("max_tokens_enabled", "ALTER TABLE api_configs ADD COLUMN max_tokens_enabled INTEGER DEFAULT 0"),
            ("thinking_enabled", "ALTER TABLE api_configs ADD COLUMN thinking_enabled INTEGER DEFAULT 0"),
            ("thinking", "ALTER TABLE api_configs ADD COLUMN thinking INTEGER DEFAULT 0"),
            ("embedding_api_base", "ALTER TABLE api_configs ADD COLUMN embedding_api_base TEXT"),
            ("embedding_api_key", "ALTER TABLE api_configs ADD COLUMN embedding_api_key TEXT"),
            ("rerank_api_base", "ALTER TABLE api_configs ADD COLUMN rerank_api_base TEXT"),
            ("rerank_api_key", "ALTER TABLE api_configs ADD COLUMN rerank_api_key TEXT"),
        ]:
            try:
                conn.execute(_ddl)
            except Exception:
                pass
        # 迁移：重建 documents 表以支持 pending 状态
        try:
            conn.execute("ALTER TABLE documents RENAME TO documents_old")
            conn.executescript("""
                CREATE TABLE documents (
                    id TEXT PRIMARY KEY,
                    knowledge_base_id TEXT,
                    filename TEXT NOT NULL,
                    original_name TEXT NOT NULL,
                    file_type TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    file_path TEXT NOT NULL,
                    content TEXT NOT NULL,
                    chunk_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL CHECK (status IN ('uploading', 'pending', 'processing', 'ready', 'error')),
                    is_enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                INSERT INTO documents SELECT * FROM documents_old;
                DROP TABLE documents_old;
            """)
        except Exception:
            pass  # 表已正确创建
        
        # 迁移：删除 chunk_settings 中的 citation_threshold 列（不再需要）
        try:
            conn.execute("ALTER TABLE chunk_settings RENAME TO chunk_settings_old")
            conn.executescript("""
                CREATE TABLE chunk_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    chunk_size INTEGER NOT NULL DEFAULT 500,
                    chunk_overlap INTEGER NOT NULL DEFAULT 100,
                    separator TEXT NOT NULL DEFAULT '\\n\\n',
                    updated_at TEXT NOT NULL
                );
                INSERT INTO chunk_settings SELECT id, chunk_size, chunk_overlap, separator, updated_at FROM chunk_settings_old;
                DROP TABLE chunk_settings_old;
            """)
        except Exception:
            pass  # 表已正确创建
        
        # 初始化默认值（如果表为空）
        row = conn.execute("SELECT * FROM chunk_settings WHERE id = 1").fetchone()
        if not row:
            conn.execute(
                "INSERT INTO chunk_settings (id, chunk_size, chunk_overlap, separator, updated_at) VALUES (?, ?, ?, ?, ?)",
                (1, 500, 100, '\\n\\n', datetime.utcnow().isoformat())
            )
        
        # 迁移完成后创建索引
        conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_kb_id ON documents(knowledge_base_id)")


# ============= 分块配置 =============

def get_chunk_settings() -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM chunk_settings WHERE id = 1").fetchone()
        return dict(row) if row else {
            "chunk_size": 500,
            "chunk_overlap": 100,
            "separator": "\\n\\n",
        }


def update_chunk_settings(chunk_size: int, chunk_overlap: int, separator: str = "\\n\\n") -> bool:
    with get_db() as conn:
        conn.execute(
            "UPDATE chunk_settings SET chunk_size=?, chunk_overlap=?, separator=?, updated_at=? WHERE id=1",
            (chunk_size, chunk_overlap, separator, datetime.utcnow().isoformat())
        )
    return True


# ============= 会话操作 =============

def get_all_sessions():
    with get_db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM sessions ORDER BY is_pinned DESC, updated_at DESC"
        ).fetchall()]


def get_session(session_id: str) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        return dict(row) if row else None


def create_session(session_id: str, title: str, knowledge_base_ids: Optional[list[str]] = None) -> dict:
    now = datetime.utcnow().isoformat()
    kb_ids_json = json.dumps(knowledge_base_ids) if knowledge_base_ids else None
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, title, knowledge_base_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (session_id, title, kb_ids_json, now, now)
        )
    return {"id": session_id, "title": title, "knowledge_base_ids": kb_ids_json, "created_at": now, "updated_at": now}


def update_session(session_id: str, title: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET title=?, updated_at=? WHERE id=?",
            (title, datetime.utcnow().isoformat(), session_id)
        )


def rename_session(session_id: str, title: str):
    """重命名会话"""
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET title=?, updated_at=? WHERE id=?",
            (title, datetime.utcnow().isoformat(), session_id)
        )


def toggle_pin_session(session_id: str) -> bool:
    """切换会话置顶状态，返回新的 is_pinned 值"""
    with get_db() as conn:
        row = conn.execute("SELECT is_pinned FROM sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            return False
        new_val = 1 - row["is_pinned"]
        conn.execute(
            "UPDATE sessions SET is_pinned=?, updated_at=? WHERE id=?",
            (new_val, datetime.utcnow().isoformat(), session_id)
        )
        return bool(new_val)


def update_session_knowledge_bases(session_id: str, kb_ids: list[str]):
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET knowledge_base_ids=?, updated_at=? WHERE id=?",
            (json.dumps(kb_ids), datetime.utcnow().isoformat(), session_id)
        )


def delete_session(session_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM sessions WHERE id=?", (session_id,))
        return cursor.rowcount > 0


# ============= 消息操作 =============

def get_messages_by_session(session_id: str):
    with get_db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM messages WHERE session_id=? ORDER BY created_at ASC", (session_id,)
        ).fetchall()]


def create_message(msg_id: str, session_id: str, role: str, content: str, sources: Optional[str] = None):
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO messages (id, session_id, role, content, sources, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, session_id, role, content, sources, now)
        )
        conn.execute("UPDATE sessions SET updated_at=? WHERE id=?", (now, session_id))
    return {"id": msg_id, "session_id": session_id, "role": role, "content": content, "sources": sources, "created_at": now}


# ============= 知识库操作 =============

def get_all_knowledge_bases():
    with get_db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM knowledge_bases ORDER BY updated_at DESC").fetchall()]


def get_knowledge_base(kb_id: str) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM knowledge_bases WHERE id=?", (kb_id,)).fetchone()
        return dict(row) if row else None


def create_knowledge_base(kb_id: str, name: str, description: str = "",
                          chunk_mode: str = "general",
                          chunk_size: int = 500, chunk_overlap: int = 100,
                          separator: str = "\\n\\n",
                          parent_chunk_size: int = 1024, parent_separator: str = "\\n\\n",
                          parent_mode: str = "paragraph",
                          child_chunk_size: int = 512, child_separator: str = "\\n",
                          rerank_enabled: int = 0,
                          index_mode: str = "high_quality",
                          retrieval_top_k: int = 5,
                          score_threshold_enabled: int = 0,
                          score_threshold: float = 0.5,
                          clean_whitespace: int = 1,
                          clean_url_email: int = 0) -> dict:
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO knowledge_bases (id, name, description, chunk_mode, chunk_size, chunk_overlap, separator,
               parent_chunk_size, parent_separator, parent_mode, child_chunk_size, child_separator, rerank_enabled,
               index_mode, retrieval_top_k, score_threshold_enabled, score_threshold, clean_whitespace, clean_url_email,
               doc_count, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'empty', ?, ?)""",
            (kb_id, name, description, chunk_mode, chunk_size, chunk_overlap, separator,
             parent_chunk_size, parent_separator, parent_mode, child_chunk_size, child_separator, rerank_enabled,
             index_mode, retrieval_top_k, score_threshold_enabled, score_threshold, clean_whitespace, clean_url_email,
             now, now)
        )
    return get_knowledge_base(kb_id)


def update_knowledge_base(kb_id: str, updates: dict) -> bool:
    allowed = ['name', 'description', 'chunk_mode', 'chunk_size', 'chunk_overlap', 'separator',
               'parent_chunk_size', 'parent_separator', 'parent_mode', 'child_chunk_size', 'child_separator',
               'rerank_enabled', 'index_mode', 'retrieval_top_k', 'score_threshold_enabled', 'score_threshold',
               'clean_whitespace', 'clean_url_email', 'status']
    fields = []
    values = []
    for k, v in updates.items():
        if k in allowed:
            fields.append(f"{k}=?")
            values.append(v)
    if not fields:
        return False
    fields.append("updated_at=?")
    values.append(datetime.utcnow().isoformat())
    values.append(kb_id)
    with get_db() as conn:
        cursor = conn.execute(f"UPDATE knowledge_bases SET {', '.join(fields)} WHERE id=?", values)
        return cursor.rowcount > 0


def update_kb_doc_count(kb_id: str, doc_count: int):
    status = 'ready' if doc_count > 0 else 'empty'
    with get_db() as conn:
        conn.execute(
            "UPDATE knowledge_bases SET doc_count=?, status=?, updated_at=? WHERE id=?",
            (doc_count, status, datetime.utcnow().isoformat(), kb_id)
        )


def delete_knowledge_base(kb_id: str) -> bool:
    with get_db() as conn:
        conn.execute("DELETE FROM doc_chunks WHERE knowledge_base_id=?", (kb_id,))
        cursor = conn.execute("DELETE FROM knowledge_bases WHERE id=?", (kb_id,))
        return cursor.rowcount > 0


# ============= 文档操作 =============

def get_all_documents(knowledge_base_id: Optional[str] = None):
    with get_db() as conn:
        if knowledge_base_id:
            return [dict(r) for r in conn.execute(
                "SELECT * FROM documents WHERE knowledge_base_id=? ORDER BY created_at DESC", (knowledge_base_id,)
            ).fetchall()]
        return [dict(r) for r in conn.execute("SELECT * FROM documents ORDER BY created_at DESC").fetchall()]


def get_documents_by_kb(knowledge_base_id: str):
    with get_db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM documents WHERE knowledge_base_id=? ORDER BY created_at DESC", (knowledge_base_id,)
        ).fetchall()]


def get_document(doc_id: str) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()
        return dict(row) if row else None


def create_document(doc_id: str, filename: str, original_name: str, file_type: str,
                    file_size: int, file_path: str, content: str = "", status: str = "processing",
                    knowledge_base_id: Optional[str] = None) -> dict:
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO documents (id, knowledge_base_id, filename, original_name, file_type, file_size, file_path, content, chunk_count, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)""",
            (doc_id, knowledge_base_id, filename, original_name, file_type, file_size, file_path, content, status, now, now)
        )
    return get_document(doc_id)


def update_document_status(doc_id: str, status: str, chunk_count: Optional[int] = None, content: Optional[str] = None):
    with get_db() as conn:
        if chunk_count is not None and content is not None:
            conn.execute(
                "UPDATE documents SET status=?, chunk_count=?, content=?, updated_at=? WHERE id=?",
                (status, chunk_count, content, datetime.utcnow().isoformat(), doc_id)
            )
        elif chunk_count is not None:
            conn.execute(
                "UPDATE documents SET status=?, chunk_count=?, updated_at=? WHERE id=?",
                (status, chunk_count, datetime.utcnow().isoformat(), doc_id)
            )
        else:
            conn.execute(
                "UPDATE documents SET status=?, updated_at=? WHERE id=?",
                (status, datetime.utcnow().isoformat(), doc_id)
            )


def toggle_document_enabled(doc_id: str, is_enabled: bool) -> bool:
    with get_db() as conn:
        cursor = conn.execute(
            "UPDATE documents SET is_enabled=?, updated_at=? WHERE id=?",
            (1 if is_enabled else 0, datetime.utcnow().isoformat(), doc_id)
        )
        return cursor.rowcount > 0


def delete_document(doc_id: str) -> bool:
    doc = get_document(doc_id)
    if doc and os.path.exists(doc["file_path"]):
        os.unlink(doc["file_path"])
    with get_db() as conn:
        conn.execute("DELETE FROM doc_chunks WHERE document_id=?", (doc_id,))
        cursor = conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))
        return cursor.rowcount > 0


# ============= 关键词分块操作（经济模式） =============

def save_doc_chunks(document_id: str, knowledge_base_id: Optional[str], chunks: list[str]):
    """保存文档的分块文本用于关键词检索（先清除旧的）"""
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute("DELETE FROM doc_chunks WHERE document_id=?", (document_id,))
        for i, content in enumerate(chunks):
            conn.execute(
                "INSERT INTO doc_chunks (id, document_id, knowledge_base_id, chunk_index, content, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (f"{document_id}_kw_{i}", document_id, knowledge_base_id, i, content, now)
            )


def get_doc_chunks_by_kbs(kb_ids: list[str], exclude_doc_ids: Optional[list[str]] = None) -> list[dict]:
    """获取指定知识库下的所有分块（用于关键词检索）"""
    if not kb_ids:
        return []
    with get_db() as conn:
        placeholders = ",".join("?" * len(kb_ids))
        sql = f"SELECT * FROM doc_chunks WHERE knowledge_base_id IN ({placeholders})"
        params = list(kb_ids)
        if exclude_doc_ids:
            ex = ",".join("?" * len(exclude_doc_ids))
            sql += f" AND document_id NOT IN ({ex})"
            params += list(exclude_doc_ids)
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


# ============= API 配置操作 =============

def get_active_api_config() -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM api_configs WHERE is_active=1 ORDER BY updated_at DESC LIMIT 1").fetchone()
        return dict(row) if row else None


def get_all_api_configs():
    with get_db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM api_configs ORDER BY updated_at DESC").fetchall()]


def get_api_config(config_id: str) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM api_configs WHERE id=?", (config_id,)).fetchone()
        return dict(row) if row else None


def create_api_config(config_id: str, name: str, api_base: str, api_key: str, model: str,
                      embedding_model: Optional[str] = None, rerank_model: Optional[str] = None,
                      embedding_api_base: Optional[str] = None, embedding_api_key: Optional[str] = None,
                      rerank_api_base: Optional[str] = None, rerank_api_key: Optional[str] = None,
                      max_tokens: int = 2048, temperature: float = 0.7,
                      top_p: float = 1.0, top_k: int = 0,
                      retrieval_top_k: int = 5, score_threshold: float = 0.0,
                      temperature_enabled: int = 0, top_p_enabled: int = 0,
                      max_tokens_enabled: int = 0, thinking_enabled: int = 0, thinking: int = 0,
                      is_active: int = 1) -> dict:
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO api_configs (id, name, api_base, api_key, model, embedding_model, rerank_model,
               embedding_api_base, embedding_api_key, rerank_api_base, rerank_api_key,
               max_tokens, temperature, top_p, top_k, retrieval_top_k, score_threshold,
               temperature_enabled, top_p_enabled, max_tokens_enabled, thinking_enabled, thinking,
               is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (config_id, name, api_base, api_key, model, embedding_model, rerank_model,
             embedding_api_base, embedding_api_key, rerank_api_base, rerank_api_key,
             max_tokens, temperature, top_p, top_k, retrieval_top_k, score_threshold,
             temperature_enabled, top_p_enabled, max_tokens_enabled, thinking_enabled, thinking,
             is_active, now, now)
        )
    return get_api_config(config_id)


def update_api_config(config_id: str, updates: dict) -> bool:
    allowed = ['name', 'api_base', 'api_key', 'model', 'embedding_model', 'rerank_model',
               'embedding_api_base', 'embedding_api_key', 'rerank_api_base', 'rerank_api_key',
               'max_tokens', 'temperature', 'top_p', 'top_k', 'retrieval_top_k', 'score_threshold',
               'temperature_enabled', 'top_p_enabled', 'max_tokens_enabled', 'thinking_enabled', 'thinking',
               'is_active']
    fields = []
    values = []
    for k, v in updates.items():
        if k in allowed:
            fields.append(f"{k}=?")
            values.append(v)
    if not fields:
        return False
    fields.append("updated_at=?")
    values.append(datetime.utcnow().isoformat())
    values.append(config_id)
    with get_db() as conn:
        cursor = conn.execute(f"UPDATE api_configs SET {', '.join(fields)} WHERE id=?", values)
        return cursor.rowcount > 0


def delete_api_config(config_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.execute("DELETE FROM api_configs WHERE id=?", (config_id,))
        return cursor.rowcount > 0


def set_active_api_config(config_id: str) -> bool:
    with get_db() as conn:
        conn.execute("UPDATE api_configs SET is_active=0")
        cursor = conn.execute(
            "UPDATE api_configs SET is_active=1, updated_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), config_id)
        )
        return cursor.rowcount > 0
