import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, AlertCircle, SendHorizonal, Paperclip, StopCircle, Database, Check, Settings, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { Select, Checkbox, Input, Textarea, Dialog, Tooltip } from 'tdesign-react';
import { marked } from 'marked';
import { Session, Document, SourceRef, ApiConfig, KnowledgeBase } from '../types';
import { APP_CONFIG } from '../config';

interface ChatPageProps {
  currentSession?: Session;
  isLoading: boolean;
  inputValue: string;
  apiConfigured: boolean;
  documents: Document[];
  configs: ApiConfig[];
  knowledgeBases: KnowledgeBase[];
  activeConfigId: string | null;
  selectedConfigId: string | null;
  selectedKnowledgeBaseIds: string[];
  systemPrompt: string;
  onSendMessage: (message: string, configId?: string, knowledgeBaseIds?: string[], systemPrompt?: string) => void;
  onInputChange: (value: string) => void;
  onFileUpload: (file: File) => Promise<any>;
  onOpenSettings: () => void;
  onOpenKnowledgeBase: () => void;
  onSelectConfig: (configId: string) => void;
  onSelectKnowledgeBases: (ids: string[]) => void;
  onSystemPromptChange: (value: string) => void;
  onStopGenerate?: () => void;
}

export function ChatPage({ currentSession, isLoading, inputValue, apiConfigured, documents, configs, knowledgeBases, activeConfigId, selectedConfigId, selectedKnowledgeBaseIds, systemPrompt, onSendMessage, onInputChange, onFileUpload, onOpenSettings, onOpenKnowledgeBase, onSelectConfig, onSelectKnowledgeBases, onSystemPromptChange, onStopGenerate }: ChatPageProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [kbSectionOpen, setKbSectionOpen] = useState(true);
  const [sourceViewer, setSourceViewer] = useState<{ documentId: string; chunkIndex: number; chunkContent: string; documentName: string } | null>(null);
  const [sourceFullContent, setSourceFullContent] = useState<string>('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const sourceContentRef = useRef<HTMLDivElement>(null);
  const sourceHighlightRef = useRef<HTMLSpanElement>(null);

  const showNewChatView = !currentSession || currentSession.messages.length === 0;

  // 当前选中的配置
  const currentConfigId = selectedConfigId || activeConfigId;
  const currentConfig = configs.find(c => c.id === currentConfigId);

  // 模型选择器选项
  const configOptions = configs.map(c => ({
    label: `${c.name} (${c.model})`,
    value: c.id,
  }));

  // 自动滚动到底部
  useEffect(() => {
    if (currentSession?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentSession?.messages?.length, currentSession?.messages?.[currentSession?.messages?.length - 1]?.content]);

  // 发送消息
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading || !apiConfigured) return;
    onSendMessage(inputValue.trim(), currentConfigId || undefined, selectedKnowledgeBaseIds, systemPrompt || undefined);
  }, [inputValue, isLoading, apiConfigured, onSendMessage, currentConfigId, selectedKnowledgeBaseIds, systemPrompt]);

  // Enter 键发送
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // 输入变化
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
  }, [onInputChange]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        try { await onFileUpload(file); } catch { /* ignore */ }
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 拖拽上传
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    for (const file of Array.from(files)) {
      try { await onFileUpload(file); } catch { /* ignore */ }
    }
  };

  // 渲染高亮内容（在全文中定位并高亮 chunk）
  const renderHighlightedContent = (fullContent: string, chunkContent: string) => {
    if (!chunkContent || !fullContent.includes(chunkContent)) {
      return fullContent;
    }
    const idx = fullContent.indexOf(chunkContent);
    const before = fullContent.slice(0, idx);
    const highlight = fullContent.slice(idx, idx + chunkContent.length);
    const after = fullContent.slice(idx + chunkContent.length);
    return (
      <>
        {before}
        <span ref={sourceHighlightRef} style={{ backgroundColor: '#fff3cd', padding: '2px 0', borderRadius: '2px' }}>
          {highlight}
        </span>
        {after}
      </>
    );
  };

  // 查看来源原文
  const handleViewSource = useCallback(async (src: SourceRef) => {
    setSourceViewer({
      documentId: src.documentId,
      chunkIndex: src.chunkIndex,
      chunkContent: src.content || src.contentPreview,
      documentName: src.documentName || '文档',
    });
    setSourceFullContent('');
    setSourceLoading(true);
    try {
      const res = await fetch(`/api/documents/${src.documentId}/content`);
      const data = await res.json();
      if (data.content) {
        setSourceFullContent(data.content);
      }
    } catch {
      // 使用预览内容
    } finally {
      setSourceLoading(false);
    }
  }, []);

  // 高亮定位
  useEffect(() => {
    if (sourceViewer && sourceHighlightRef.current && sourceContentRef.current) {
      sourceHighlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [sourceViewer, sourceFullContent]);

  // Markdown 渲染 + inline 引用链接
  const renderMessageContent = useCallback((content: string, sources?: SourceRef[]) => {
    if (!content) return '';
    let html: string;
    try {
      html = marked.parse(content, { breaks: true, gfm: true }) as string;
    } catch {
      html = content;
    }
    // 将 [N] 替换为可点击的引用链接
    if (sources && sources.length > 0) {
      html = html.replace(/\[(\d+)\]/g, (match, num) => {
        const idx = parseInt(num, 10) - 1;
        if (idx >= 0 && idx < sources.length) {
          const src = sources[idx];
          return `<span class="inline-citation" data-idx="${idx}" title="${src.documentName || '文档'} · 点击查看原文" style="cursor:pointer;color:var(--td-brand-color);font-weight:600;text-decoration:underline;text-underline-offset:2px;">[${num}]</span>`;
        }
        return match;
      });
    }
    return html;
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0"
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* 拖拽提示 */}
      {dragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,52,217,0.1)' }}>
          <div className="upload-zone dragover p-8 text-center">
            <Upload size={48} style={{ color: 'var(--td-brand-color)' }} />
            <p className="mt-2 text-lg font-medium" style={{ color: 'var(--td-brand-color)' }}>拖拽文件到这里上传</p>
            <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>支持 {APP_CONFIG.supportedFileTypes.join(', ')} 格式</p>
          </div>
        </div>
      )}

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {showNewChatView ? (
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: 'linear-gradient(135deg, #5b67e0 0%, #4f5bd5 100%)', boxShadow: '0 8px 24px rgba(79, 91, 213, 0.28)' }}>
              <Sparkles size={32} color="white" />
            </div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--td-text-color-primary)' }}>AskDocs-Lite</h2>
            <p className="text-sm mb-8" style={{ color: 'var(--td-text-color-secondary)' }}>
              创建知识库并上传文档，选择知识库后 AI 会根据文档内容回答。也可以直接对话。
            </p>

            {!apiConfigured && (
              <div className="mb-6 p-4 rounded-lg cursor-pointer" style={{ backgroundColor: '#fff1e9', border: '1px solid #ffe0b2' }} onClick={onOpenSettings}>
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} style={{ color: '#ed7b2f' }} />
                  <span className="font-medium" style={{ color: '#ed7b2f' }}>请先配置大模型 API</span>
                </div>
                <p className="mt-1 text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                  点击这里前往模型管理 → 支持硅基流动、火山引擎、DeepSeek、通义千问等
                </p>
              </div>
            )}

            {/* 系统提示词（可选） */}
            {apiConfigured && (
              <div className="text-left mt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Settings size={14} style={{ color: 'var(--td-text-color-secondary)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>系统提示词（可选）</p>
                </div>
                <Textarea
                  value={systemPrompt}
                  onChange={(v: string) => onSystemPromptChange(v)}
                  placeholder="自定义 AI 助手的角色和行为，留空则使用默认提示词"
                  autosize
                  maxcharacter={2000}
                  style={{ backgroundColor: 'var(--td-bg-color-component)', border: '1px solid var(--td-component-border)' }}
                />
              </div>
            )}

            {/* 知识库选择 */}
            {apiConfigured && knowledgeBases.length > 0 && (
              <div className="text-left mt-6">
                <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => setKbSectionOpen(!kbSectionOpen)}>
                  <div className="flex items-center gap-2">
                    {kbSectionOpen ? <ChevronDown size={14} style={{ color: 'var(--td-text-color-secondary)' }} /> : <ChevronRight size={14} style={{ color: 'var(--td-text-color-secondary)' }} />}
                    <p className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>选择知识库（可选）</p>
                  </div>
                  <button className="text-xs cursor-pointer" style={{ color: 'var(--td-brand-color)' }} onClick={e => { e.stopPropagation(); onOpenKnowledgeBase(); }}>
                    管理知识库 →
                  </button>
                </div>
                {kbSectionOpen && (
                  <div className="space-y-1.5">
                    {knowledgeBases.map(kb => {
                      const isSelected = selectedKnowledgeBaseIds.includes(kb.id);
                      const hasDocs = kb.documentCount > 0;
                      const isReady = kb.status === 'ready';
                      const canSelect = hasDocs && isReady;
                      return (
                        <div key={kb.id}
                          className="flex items-center gap-3 p-3 rounded-lg transition-colors"
                          style={{
                            backgroundColor: isSelected ? 'var(--td-brand-color-light)' : 'var(--td-bg-color-component)',
                            border: `1px solid ${isSelected ? 'var(--td-brand-color)' : 'var(--td-component-border)'}`,
                            opacity: canSelect ? 1 : 0.5,
                            cursor: canSelect ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => {
                            if (!canSelect) return;
                            if (isSelected) {
                              onSelectKnowledgeBases(selectedKnowledgeBaseIds.filter(id => id !== kb.id));
                            } else {
                              onSelectKnowledgeBases([...selectedKnowledgeBaseIds, kb.id]);
                            }
                          }}
                        >
                          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: isSelected ? 'var(--td-brand-color)' : 'var(--td-bg-color-component-hover)', border: isSelected ? 'none' : '1px solid var(--td-component-border)' }}>
                            {isSelected && <Check size={12} color="white" />}
                          </div>
                          <Database size={16} style={{ color: isSelected ? 'var(--td-brand-color)' : 'var(--td-text-color-placeholder)' }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium" style={{ color: isSelected ? 'var(--td-brand-color)' : 'var(--td-text-color-primary)' }}>{kb.name}</span>
                            <span className="text-xs ml-2" style={{ color: 'var(--td-text-color-placeholder)' }}>{kb.documentCount} 个文档</span>
                          </div>
                          {!isReady && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fff1e9', color: '#ed7b2f' }}>未就绪</span>
                          )}
                          {isReady && !hasDocs && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-placeholder)' }}>暂无文档</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 无知识库时的提示 */}
            {apiConfigured && knowledgeBases.length === 0 && (
              <div className="mt-6 text-center">
                <button className="text-sm cursor-pointer px-4 py-2 rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--td-brand-color-light)', color: 'var(--td-brand-color)', border: '1px solid var(--td-brand-color)' }}
                  onClick={onOpenKnowledgeBase}>
                  <Database size={14} className="inline mr-1" />
                  创建知识库，上传文档后开始智能问答
                </button>
              </div>
            )}

            {/* 示例问题 */}
            {apiConfigured && (
              <div className="mt-6">
                <p className="text-sm mb-3" style={{ color: 'var(--td-text-color-secondary)' }}>
                  {selectedKnowledgeBaseIds.length > 0 ? '试试这些问题：' : '直接开始对话：'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(selectedKnowledgeBaseIds.length > 0
                    ? ['这份文档的主要内容是什么？', '文档中提到的关键概念有哪些？', '请总结文档的核心观点']
                    : ['帮我解释一下什么是 RAG', 'Python 和 JavaScript 有什么区别？', '如何提高工作效率？']
                  ).map(q => (
                    <button key={q} className="px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                      style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-primary)', border: '1px solid var(--td-component-border)' }}
                      onClick={() => onSendMessage(q, currentConfigId || undefined, selectedKnowledgeBaseIds, systemPrompt || undefined)}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--td-brand-color-light)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--td-bg-color-component)'}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-5xl mx-auto">
            {currentSession!.messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full self-start"
                  style={{ backgroundColor: msg.role === 'user' ? 'var(--td-brand-color)' : 'var(--td-bg-color-component)', color: msg.role === 'user' ? 'white' : 'var(--td-text-color-primary)' }}>
                  {msg.role === 'user' ? <span className="text-sm font-medium">U</span> : <Sparkles size={18} />}
                </div>
                <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                  {msg.role === 'user' ? (
                    <div className="px-4 py-3 leading-relaxed break-words" style={{ backgroundColor: 'var(--td-brand-color)', color: 'white', borderRadius: '16px 16px 4px 16px' }}>
                      {msg.content}
                    </div>
                  ) : (
                    <>
                      {msg.content ? (
                        <div className="px-4 py-3 leading-relaxed break-words" style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-primary)', borderRadius: '16px 16px 16px 4px' }}>
                          <div className="chat-markdown" dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.content, msg.sources) }}
                            onClick={(e: React.MouseEvent) => {
                              const target = e.target as HTMLElement;
                              const citation = target.closest('.inline-citation') as HTMLElement;
                              if (citation && msg.sources) {
                                const idx = parseInt(citation.dataset.idx || '0', 10);
                                if (msg.sources[idx]) {
                                  handleViewSource(msg.sources[idx]);
                                }
                              }
                            }}
                          />
                          {msg.isStreaming && <span className="animate-cursor-blink ml-0.5" style={{ color: 'var(--td-brand-color)' }}>|</span>}
                        </div>
                      ) : msg.isStreaming ? (
                        <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: 'var(--td-bg-color-component)', borderRadius: '16px 16px 16px 4px' }}>
                          <div className="thinking-dots flex gap-1">
                            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--td-brand-color)', animationDelay: '0ms' }} />
                            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--td-brand-color)', animationDelay: '150ms' }} />
                            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--td-brand-color)', animationDelay: '300ms' }} />
                          </div>
                          <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>正在思考...</span>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <div className="px-4 pb-6 pt-4" style={{ backgroundColor: 'var(--td-bg-color-page)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="chat-input-box flex flex-col gap-2 px-3 pt-3 pb-2 rounded-2xl transition-all"
            style={{ backgroundColor: 'var(--td-bg-color-container)' }}>
            {/* 输入框 */}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={apiConfigured ? "输入问题... (Enter 发送，Shift+Enter 换行)" : "请先在设置中配置 API..."}
              disabled={!apiConfigured}
              rows={1}
              className="w-full resize-none outline-none px-1 text-sm leading-relaxed"
              style={{
                color: apiConfigured ? 'var(--td-text-color-primary)' : 'var(--td-text-color-disabled)',
                backgroundColor: 'transparent',
                maxHeight: '180px',
                minHeight: '40px',
                overflowY: 'auto',
              }}
              onInput={() => {
                const ta = textareaRef.current;
                if (ta) {
                  ta.style.height = 'auto';
                  ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
                }
              }}
            />

            {/* 内嵌底部工具栏 */}
            <div className="flex items-center gap-1.5">
              {/* 附件按钮 */}
              <button
                className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 cursor-pointer transition-colors"
                style={{ color: 'var(--td-text-color-placeholder)', backgroundColor: 'transparent' }}
                onClick={() => fileInputRef.current?.click()}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--td-brand-color)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--td-text-color-placeholder)'}
                title="上传文件"
              >
                <Paperclip size={18} />
              </button>
              <input ref={fileInputRef} type="file" multiple accept=".txt,.md,.pdf,.docx,.doc,.csv,.json,.log" className="hidden" onChange={handleFileChange} />

              {/* 模型选择 */}
              {configs.length > 0 && (
                <Select
                  value={currentConfigId || ''}
                  options={configOptions}
                  onChange={(val) => onSelectConfig(String(val))}
                  borderless
                  autoWidth
                  size="small"
                  placeholder="选择模型"
                  empty="暂无配置"
                  className="toolbar-select"
                  prefixIcon={<Sparkles size={14} />}
                />
              )}

              {/* 知识库选择 */}
              {knowledgeBases.length > 0 && (
                <Select
                  value={selectedKnowledgeBaseIds}
                  options={knowledgeBases.map(kb => ({
                    label: kb.name,
                    value: kb.id,
                    disabled: !(kb.documentCount > 0 && kb.status === 'ready'),
                  }))}
                  onChange={(val) => onSelectKnowledgeBases((val as string[]) || [])}
                  multiple
                  borderless
                  autoWidth
                  size="small"
                  empty="暂无知识库"
                  minCollapsedNum={1}
                  valueDisplay={() => {
                    const names = knowledgeBases
                      .filter(kb => selectedKnowledgeBaseIds.includes(kb.id))
                      .map(kb => kb.name);
                    const text = names.length > 0 ? names.join(' | ') : '选择知识库';
                    return (
                      <Tooltip content={names.length > 0 ? text : ''} placement="top" showArrow>
                        <span className="kb-value-text">
                          <Database size={14} />
                          <span className="kb-value-label">{text}</span>
                        </span>
                      </Tooltip>
                    );
                  }}
                  className="toolbar-select toolbar-select-kb"
                />
              )}

              {/* 发送/停止按钮 */}
              {isLoading ? (
                <button
                  className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 cursor-pointer transition-colors ml-auto"
                  style={{ color: 'white', backgroundColor: '#e34d59' }}
                  onClick={onStopGenerate}
                  title="停止生成"
                >
                  <StopCircle size={18} />
                </button>
              ) : (
                <button
                  className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 transition-all ml-auto"
                  style={{
                    color: 'white',
                    backgroundColor: inputValue.trim() && apiConfigured ? 'var(--td-brand-color)' : 'var(--td-bg-color-component-hover)',
                    boxShadow: inputValue.trim() && apiConfigured ? '0 4px 12px rgba(79, 91, 213, 0.28)' : 'none',
                    cursor: inputValue.trim() && apiConfigured ? 'pointer' : 'not-allowed',
                  }}
                  onClick={handleSend}
                  disabled={!inputValue.trim() || !apiConfigured}
                  title="发送消息"
                >
                  <SendHorizonal size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 来源原文查看器 */}
      <Dialog
        header={`${sourceViewer?.documentName || '文档'} · 第 ${sourceViewer ? sourceViewer.chunkIndex + 1 : 0} 块`}
        visible={sourceViewer !== null}
        onClose={() => setSourceViewer(null)}
        footer={null}
        width="700px"
      >
        <div ref={sourceContentRef} className="max-h-[60vh] overflow-y-auto" style={{ lineHeight: 1.8 }}>
          {sourceLoading ? (
            <div className="text-center py-8" style={{ color: 'var(--td-text-color-placeholder)' }}>加载中...</div>
          ) : sourceFullContent ? (
            <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--td-text-color-primary)', fontFamily: 'inherit', margin: 0 }}>
              {renderHighlightedContent(sourceFullContent, sourceViewer?.chunkContent || '')}
            </pre>
          ) : (
            <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--td-text-color-primary)', fontFamily: 'inherit', margin: 0 }}>
              {sourceViewer?.chunkContent || ''}
            </pre>
          )}
        </div>
      </Dialog>
    </div>
  );
}
