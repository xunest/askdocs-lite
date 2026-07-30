import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import '@tdesign-react/chat/es/style/index.js';
import { Message, Session, Document, ApiConfig, KnowledgeBase } from './types';
import { APP_CONFIG } from './config';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppContent />} />
      <Route path="/chat/:sessionId" element={<AppContent />} />
      <Route path="/settings" element={<AppContent />} />
      <Route path="/knowledge-base" element={<AppContent />} />
    </Routes>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const isSettingsPage = location.pathname === '/settings';
  const isKnowledgeBasePage = location.pathname === '/knowledge-base';

  // 状态
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null); // 对话时选择的模型
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<string[]>([]); // 对话时选择的知识库
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const apiConfigured = !!activeConfigId;
  const currentSession = sessions.find(s => s.id === currentSessionId);

  // 从 URL 同步 sessionId
  useEffect(() => {
    if (urlSessionId && urlSessionId !== currentSessionId) {
      setCurrentSessionId(urlSessionId);
      loadSessionMessages(urlSessionId);
    }
  }, [urlSessionId]);

  // 加载会话列表
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.sessions) {
        setSessions(prev => {
          const existingMap = new Map(prev.map(s => [s.id, s]));
          return data.sessions.map((s: any) => {
            const existing = existingMap.get(s.id);
            if (existing && existing.messages.length > 0) {
              // 保留已加载的消息（避免覆盖流式接收中的内容）
              return { ...existing, title: s.title, isPinned: s.is_pinned === 1 };
            }
            return {
              id: s.id,
              title: s.title,
              createdAt: new Date(s.created_at),
              messages: [],
              isPinned: s.is_pinned === 1,
            };
          });
        });
      }
    } catch (e) { console.error('Fetch sessions error:', e); }
  }, []);

  // 加载文档列表
  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents.map((d: any) => ({
          id: d.id,
          filename: d.filename,
          originalName: d.original_name,
          fileType: d.file_type,
          fileSize: d.file_size,
          chunkCount: d.chunk_count,
          status: d.status,
          createdAt: d.created_at,
          contentPreview: d.content
        })));
      }
    } catch (e) { console.error('Fetch documents error:', e); }
  }, []);

  // 加载知识库列表
  const fetchKnowledgeBases = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge-bases');
      const data = await res.json();
      setKnowledgeBases(data.knowledgeBases || []);
    } catch (e) { console.error('Fetch knowledge bases error:', e); }
  }, []);

  // 加载配置列表
  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/configs');
      const data = await res.json();
      const configList: ApiConfig[] = (data.configs || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        apiBase: c.api_base,
        apiKey: c.api_key,  // 脱敏后的
        model: c.model,
        embeddingModel: c.embedding_model,
        embeddingApiBase: c.embedding_api_base,
        embeddingApiKey: c.embedding_api_key,
        rerankModel: c.rerank_model,
        rerankApiBase: c.rerank_api_base,
        rerankApiKey: c.rerank_api_key,
        maxTokens: c.max_tokens,
        temperature: c.temperature,
        topP: c.top_p,
        topK: c.top_k,
        temperatureEnabled: c.temperature_enabled === 1,
        topPEnabled: c.top_p_enabled === 1,
        maxTokensEnabled: c.max_tokens_enabled === 1,
        thinkingEnabled: c.thinking_enabled === 1,
        thinking: c.thinking === 1,
        isActive: c.is_active === 1,
        createdAt: c.created_at,
      }));
      setConfigs(configList);
      setActiveConfigId(data.activeConfigId || null);
      // 初始化选择：默认使用活跃配置
      if (!selectedConfigId && data.activeConfigId) {
        setSelectedConfigId(data.activeConfigId);
      }
    } catch (e) { console.error('Fetch configs error:', e); }
  }, [selectedConfigId]);

  // 加载会话消息
  const loadSessionMessages = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/sessions/${sid}`);
      const data = await res.json();
      if (data.messages) {
        const msgs: Message[] = data.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources || undefined,
          timestamp: new Date(m.created_at),
        }));
        setSessions(prev => prev.map(s => s.id === sid ? { ...s, messages: msgs } : s));
      }
    } catch (e) { console.error('Load messages error:', e); }
  }, []);

  // 发送消息
  const sendMessage = useCallback(async (messageContent: string, configId?: string, knowledgeBaseIds?: string[], systemPrompt?: string) => {
    if (!messageContent.trim()) return;

    let sid = currentSessionId;

    // 如果没有会话，先创建
    if (!sid) {
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: messageContent.slice(0, 30), knowledgeBaseIds: knowledgeBaseIds || [] })
        });
        const data = await res.json();
        sid = data.session.id;
        const newSession: Session = {
          id: data.session.id,
          title: messageContent.slice(0, 30),
          createdAt: new Date(),
          messages: []
        };
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(sid);
        navigate(`/chat/${sid}`);
      } catch (e) { console.error('Create session error:', e); return; }
    }

    // 添加用户消息到本地状态
    const userMsg: Message = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: new Date()
    };
    const assistantMsg: Message = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      sources: []
    };

    setSessions(prev => prev.map(s => s.id === sid ? {
      ...s,
      messages: [...s.messages, userMsg, assistantMsg]
    } : s));

    setInputValue('');
    setIsLoading(true);

    // 使用的配置：用户选择的 > 活跃的
    const useConfigId = configId || selectedConfigId || activeConfigId;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, message: messageContent, configId: useConfigId, knowledgeBaseIds: knowledgeBaseIds || [], systemPrompt: systemPrompt || '' })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: '请求失败' }));
        setSessions(prev => prev.map(s => s.id === sid ? {
          ...s,
          messages: s.messages.map(m => m.id === assistantMsg.id ? { ...m, content: `错误: ${errData.error || '请求失败'}`, isStreaming: false } : m)
        } : s));
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let realSessionId = sid;
      let realAssistantMsgId = assistantMsg.id;
      let sources: any[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'init') {
                  realSessionId = data.sessionId;
                  realAssistantMsgId = data.assistantMessageId;
                  sources = data.sources || [];
                } else if (data.type === 'text') {
                  fullContent += data.content;
                  setSessions(prev => prev.map(s => {
                    if (s.id === realSessionId) {
                      return { ...s, messages: s.messages.map(m => m.id === realAssistantMsgId ? { ...m, content: fullContent, sources } : m) };
                    }
                    return s;
                  }));
                } else if (data.type === 'done') {
                  setSessions(prev => prev.map(s => {
                    if (s.id === realSessionId) {
                      return { ...s, messages: s.messages.map(m => m.id === realAssistantMsgId ? { ...m, isStreaming: false, content: fullContent, sources } : m) };
                    }
                    return s;
                  }));
                } else if (data.type === 'error') {
                  setSessions(prev => prev.map(s => {
                    if (s.id === realSessionId) {
                      return { ...s, messages: s.messages.map(m => m.id === realAssistantMsgId ? { ...m, content: `错误: ${data.message}`, isStreaming: false } : m) };
                    }
                    return s;
                  }));
                }
              } catch { /* ignore SSE parse errors */ }
            }
          }
        }
      }

      // 确保 isStreaming 结束（兜底）
      setSessions(prev => prev.map(s => s.id === sid ? {
        ...s,
        messages: s.messages.map(m => m.id === assistantMsg.id ? { ...m, isStreaming: false, content: fullContent || m.content, sources } : m)
      } : s));

    } catch (error) {
      console.error('Chat error:', error);
      setSessions(prev => prev.map(s => s.id === sid ? {
        ...s,
        messages: s.messages.map(m => m.id === assistantMsg.id ? { ...m, content: '网络错误，请重试', isStreaming: false } : m)
      } : s));
    } finally {
      setIsLoading(false);
      // 从 API 重新加载当前会话消息，确保状态一致
      if (sid) {
        loadSessionMessages(sid);
      }
      // 延迟刷新会话列表（不影响当前消息显示）
      setTimeout(() => fetchSessions(), 500);
    }
  }, [currentSessionId, selectedConfigId, activeConfigId, navigate, fetchSessions, loadSessionMessages]);

  // 删除会话
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      navigate('/');
    }
  }, [currentSessionId, navigate]);

  // 重命名会话
  const handleRenameSession = useCallback(async (sessionId: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle } : s));
      }
    } catch (e) { console.error('Rename session error:', e); }
  }, []);

  // 置顶/取消置顶会话
  const handleTogglePinSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/toggle-pin`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isPinned: data.is_pinned } : s));
      }
    } catch (e) { console.error('Toggle pin error:', e); }
  }, []);

  // 上传文件
  const handleFileUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.document) {
        setDocuments(prev => [{
          id: data.document.id,
          filename: data.document.filename,
          originalName: data.document.original_name,
          fileType: data.document.file_type,
          fileSize: data.document.file_size,
          chunkCount: data.document.chunkCount || data.document.chunk_count,
          status: data.document.status,
          createdAt: data.document.created_at,
          contentPreview: data.document.contentPreview
        }, ...prev]);
      }
      fetchDocuments();
      return data;
    } catch (e) {
      console.error('Upload error:', e);
      throw e;
    }
  }, [fetchDocuments]);

  // 删除文件
  const handleDeleteDocument = useCallback(async (docId: string) => {
    await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
    setDocuments(prev => prev.filter(d => d.id !== docId));
  }, []);

  // 创建配置
  const handleCreateConfig = useCallback(async (config: any) => {
    try {
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          apiBase: config.apiBase,
          apiKey: config.apiKey,
          model: config.model,
          embeddingModel: config.embeddingModel,
          embeddingApiBase: config.embeddingApiBase,
          embeddingApiKey: config.embeddingApiKey,
          rerankModel: config.rerankModel,
          rerankApiBase: config.rerankApiBase,
          rerankApiKey: config.rerankApiKey,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          topP: config.topP,
          topK: config.topK,
          retrievalTopK: config.retrievalTopK,
          scoreThreshold: config.scoreThreshold,
          temperatureEnabled: config.temperatureEnabled,
          topPEnabled: config.topPEnabled,
          maxTokensEnabled: config.maxTokensEnabled,
          thinkingEnabled: config.thinkingEnabled,
          thinking: config.thinking,
        })
      });
      return await res.json();
    } catch (e) {
      console.error('Create config error:', e);
      throw e;
    }
  }, []);

  // 更新配置
  const handleUpdateConfig = useCallback(async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/configs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      return await res.json();
    } catch (e) {
      console.error('Update config error:', e);
      throw e;
    }
  }, []);

  // 删除配置
  const handleDeleteConfig = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/configs/${id}`, { method: 'DELETE' });
      return await res.json();
    } catch (e) {
      console.error('Delete config error:', e);
      throw e;
    }
  }, []);

  // 激活配置
  const handleActivateConfig = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/configs/${id}/activate`, { method: 'POST' });
      return await res.json();
    } catch (e) {
      console.error('Activate config error:', e);
      throw e;
    }
  }, []);

  // 选择对话时用的模型
  const handleSelectConfig = useCallback((configId: string) => {
    setSelectedConfigId(configId);
  }, []);

  // 选择知识库
  const handleSelectKnowledgeBases = useCallback((ids: string[]) => {
    setSelectedKnowledgeBaseIds(ids);
  }, []);

  // 初始加载
  useEffect(() => {
    fetchSessions();
    fetchDocuments();
    fetchConfigs();
    fetchKnowledgeBases();
  }, [fetchSessions, fetchDocuments, fetchConfigs, fetchKnowledgeBases]);

  // 导航处理
  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    setSelectedKnowledgeBaseIds([]);
    navigate('/');
    // 同步刷新知识库和配置列表
    fetchKnowledgeBases();
    fetchConfigs();
  }, [navigate, fetchKnowledgeBases, fetchConfigs]);

  const handleSelectSession = useCallback((sid: string) => {
    setCurrentSessionId(sid);
    navigate(`/chat/${sid}`);
    // 加载该会话的历史消息
    loadSessionMessages(sid);
  }, [navigate, loadSessionMessages]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const activeConfig = configs.find(c => c.id === activeConfigId) || null;

  return (
    <div className="flex h-screen w-screen" style={{ backgroundColor: 'var(--td-bg-color-page)' }}>
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        sidebarOpen={sidebarOpen}
        apiConfigured={apiConfigured}
        knowledgeBaseCount={knowledgeBases.length}
        configCount={configs.length}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onTogglePinSession={handleTogglePinSession}
        onOpenKnowledgeBase={() => navigate('/knowledge-base')}
        onOpenSettings={() => navigate('/settings')}
      />

      <main className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--td-bg-color-page)' }}>
        <Header
          sidebarOpen={sidebarOpen}
          currentSession={currentSession}
          apiConfigured={apiConfigured}
          activeConfig={activeConfig}
          selectedKnowledgeBaseIds={selectedKnowledgeBaseIds}
          knowledgeBases={knowledgeBases}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        {isSettingsPage ? (
          <SettingsPage
            configs={configs}
            activeConfigId={activeConfigId}
            onFetchConfigs={fetchConfigs}
            onCreateConfig={handleCreateConfig}
            onUpdateConfig={handleUpdateConfig}
            onDeleteConfig={handleDeleteConfig}
            onActivateConfig={handleActivateConfig}
          />
        ) : isKnowledgeBasePage ? (
          <KnowledgeBasePage
            onOpenChat={() => navigate('/')}
            onKbChange={fetchKnowledgeBases}
          />
        ) : (
          <ChatPage
            currentSession={currentSession}
            isLoading={isLoading}
            inputValue={inputValue}
            apiConfigured={apiConfigured}
            documents={documents}
            configs={configs}
            knowledgeBases={knowledgeBases}
            activeConfigId={activeConfigId}
            selectedConfigId={selectedConfigId}
            selectedKnowledgeBaseIds={selectedKnowledgeBaseIds}
            systemPrompt={systemPrompt}
            onSendMessage={sendMessage}
            onInputChange={setInputValue}
            onFileUpload={handleFileUpload}
            onOpenSettings={() => navigate('/settings')}
            onOpenKnowledgeBase={() => navigate('/knowledge-base')}
            onSelectConfig={handleSelectConfig}
            onSelectKnowledgeBases={handleSelectKnowledgeBases}
            onSystemPromptChange={setSystemPrompt}
          />
        )}
      </main>
    </div>
  );
}

export default App;
