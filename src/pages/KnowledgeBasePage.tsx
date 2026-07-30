import { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Input, MessagePlugin, Dialog, Tag, Textarea, Switch, Checkbox, Popup } from 'tdesign-react';
import { Plus, Trash2, Upload, FileText, X, Settings, Database, ChevronRight, ChevronDown, Edit3, Check, Eye, SlidersHorizontal, HelpCircle } from 'lucide-react';
import { IconBtn } from '../components/IconBtn';
import { KnowledgeBase, KbDocument } from '../types';

// 问号提示：鼠标悬停显示参数说明
function HelpTip({ text }: { text: string }) {
  return (
    <Popup content={<div style={{ maxWidth: 260, lineHeight: 1.6 }}>{text}</div>} placement="top" showArrow>
      <HelpCircle size={13} style={{ color: 'var(--td-text-color-placeholder)', cursor: 'help', flexShrink: 0 }} />
    </Popup>
  );
}

interface KnowledgeBasePageProps {
  onOpenChat: () => void;
  onKbChange?: () => void;
}

type CreateStep = 'info' | 'upload' | 'chunk';

export function KnowledgeBasePage({ onOpenChat, onKbChange }: KnowledgeBasePageProps) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('info');
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 防抖函数
  const debounce = (fn: Function, delay: number) => {
    let timer: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  // 创建流程状态
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [createdKbId, setCreatedKbId] = useState<string | null>(null); // 创建后暂存 KB ID
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]); // 已上传的文件名
  const [previewText, setPreviewText] = useState(''); // 用于预览的文本内容

  // 分段设置（创建流程第三步）
  const [chunkMode, setChunkMode] = useState<'general' | 'parent_child'>('general');
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(100);
  const [separator, setSeparator] = useState('\\n\\n');
  const [parentChunkSize, setParentChunkSize] = useState(1024);
  const [parentSeparator, setParentSeparator] = useState('\\n\\n');
  const [parentMode, setParentMode] = useState<'paragraph' | 'full'>('paragraph');
  const [childChunkSize, setChildChunkSize] = useState(512);
  const [childSeparator, setChildSeparator] = useState('\\n');
  const [rerankEnabled, setRerankEnabled] = useState(false);
  // 索引方式与检索设置
  const [indexMode, setIndexMode] = useState<'high_quality' | 'economic'>('economic');
  const [retrievalTopK, setRetrievalTopK] = useState(5);
  const [scoreThresholdEnabled, setScoreThresholdEnabled] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState(0.5);
  // 文本清洗
  const [cleanWhitespace, setCleanWhitespace] = useState(true);
  const [cleanUrlEmail, setCleanUrlEmail] = useState(false);

  // 编辑名称/描述
  const [editingNameKbId, setEditingNameKbId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // 上传状态
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadKbId, setActiveUploadKbId] = useState<string | null>(null);

  // 预览块状态
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewChunks, setPreviewChunks] = useState<{ index: number; content: string; length: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  // 步骤3实时预览状态
  const [step3PreviewChunks, setStep3PreviewChunks] = useState<{ index: number; content: string; length: number }[]>([]);
  const [step3PreviewLoading, setStep3PreviewLoading] = useState(false);

  // 重新分段状态
  const [rechunkDocId, setRechunkDocId] = useState<string | null>(null);
  const [rechunkLoading, setRechunkLoading] = useState(false);
  const [rechunkKb, setRechunkKb] = useState<KnowledgeBase | null>(null);
  const [rechunkSettings, setRechunkSettings] = useState({
    chunkSize: 500, chunkOverlap: 100, separator: '\\n\\n',
    parentChunkSize: 1024, parentSeparator: '\\n\\n', parentMode: 'paragraph' as 'paragraph' | 'full',
    childChunkSize: 512, childSeparator: '\\n',
  });
  // 重新分段预览状态
  const [rechunkPreviewChunks, setRechunkPreviewChunks] = useState<{ index: number; content: string; length: number }[]>([]);
  const [rechunkPreviewLoading, setRechunkPreviewLoading] = useState(false);

  const fetchKnowledgeBases = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge-bases');
      const data = await res.json();
      setKnowledgeBases(data.knowledgeBases || []);
    } catch (e) {
      console.error('Fetch knowledge bases error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKnowledgeBases();
  }, [fetchKnowledgeBases]);

  // 步骤1：创建知识库（只需名称和描述）
  const handleCreateKb = useCallback(async () => {
    if (!formName.trim()) {
      MessagePlugin.warning('请输入知识库名称');
      return;
    }
    try {
      const res = await fetch('/api/knowledge-bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), description: formDesc }),
      });
      const data = await res.json();
      if (data.knowledgeBase) {
        setCreatedKbId(data.knowledgeBase.id);
        setCreateStep('upload');
      }
    } catch {
      MessagePlugin.error('创建失败');
    }
  }, [formName, formDesc]);

  // 步骤2：上传文件
  const handleUploadFiles = useCallback(async (files: FileList) => {
    if (!createdKbId) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/documents/upload?knowledgeBaseId=${createdKbId}`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.document) {
          setUploadedFiles(prev => [...prev, file.name]);
          // 读取第一个文件的文本内容用于预览
          if (uploadedFiles.length === 0 && previewText === '') {
            const reader = new FileReader();
            reader.onload = (e) => {
              const text = e.target?.result as string;
              setPreviewText(text || '');
            };
            reader.readAsText(file);
          }
        }
      } catch {
        MessagePlugin.error(`"${file.name}" 上传失败`);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [createdKbId, uploadedFiles.length, previewText]);

  // 步骤3：保存分段设置并完成创建
  const handleFinishCreate = useCallback(async () => {
    if (!createdKbId) return;
    try {
      await fetch(`/api/knowledge-bases/${createdKbId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chunkMode, chunkSize, chunkOverlap, separator,
          parentChunkSize, parentSeparator, parentMode,
          childChunkSize, childSeparator, rerankEnabled,
          indexMode, retrievalTopK, scoreThresholdEnabled, scoreThreshold,
          cleanWhitespace, cleanUrlEmail,
        }),
      });
      MessagePlugin.success('知识库创建完成！');
      setShowCreateForm(false);
      setCreateStep('info');
      setCreatedKbId(null);
      setFormName('');
      setFormDesc('');
      setUploadedFiles([]);
      setChunkMode('general');
      setChunkSize(500);
      setChunkOverlap(100);
      setRerankEnabled(false);
      setIndexMode('economic');
      setRetrievalTopK(5);
      setScoreThresholdEnabled(false);
      setScoreThreshold(0.5);
      setCleanWhitespace(true);
      setCleanUrlEmail(false);
      fetchKnowledgeBases();
      onKbChange?.();
    } catch {
      MessagePlugin.error('保存分段设置失败');
    }
  }, [createdKbId, chunkMode, chunkSize, chunkOverlap, separator,
    parentChunkSize, parentSeparator, parentMode, childChunkSize, childSeparator, rerankEnabled,
    indexMode, retrievalTopK, scoreThresholdEnabled, scoreThreshold, cleanWhitespace, cleanUrlEmail,
    fetchKnowledgeBases, onKbChange]);

  // 步骤3实时预览
  const fetchStep3Preview = useCallback(async () => {
    console.log('[Step3 Preview] 开始预览, previewText长度:', previewText.length);
    if (!previewText.trim()) {
      console.log('[Step3 Preview] 文本为空，清空结果');
      setStep3PreviewChunks([]);
      return;
    }
    
    setStep3PreviewLoading(true);
    try {
      const requestBody = {
        content: previewText,
        chunkMode,
        chunkSize,
        chunkOverlap,
        separator,
        parentChunkSize,
        parentSeparator,
        parentMode,
        childChunkSize,
        childSeparator,
      };
      console.log('[Step3 Preview] 请求参数:', requestBody);
      
      const res = await fetch('/api/documents/preview-chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      console.log('[Step3 Preview] API 响应:', data);
      if (data.chunks) {
        setStep3PreviewChunks(data.chunks);
        console.log('[Step3 Preview] 设置 chunks, 数量:', data.chunks.length);
      }
    } catch (err) {
      console.error('[Step3 Preview] Error:', err);
    } finally {
      setStep3PreviewLoading(false);
    }
  }, [previewText, chunkMode, chunkSize, chunkOverlap, separator, parentChunkSize, parentSeparator, parentMode, childChunkSize, childSeparator]);

  // 防抖后的预览函数（500ms）
  const debouncedFetchPreview = useCallback(
    debounce(fetchStep3Preview, 500),
    [fetchStep3Preview]
  );

  // 监听参数变化，自动触发预览（仅在步骤3时）
  useEffect(() => {
    if (createStep === 'chunk' && previewText.trim()) {
      debouncedFetchPreview();
    }
  }, [
    createStep,
    previewText,
    chunkMode,
    chunkSize,
    chunkOverlap,
    separator,
    parentChunkSize,
    parentSeparator,
    parentMode,
    childChunkSize,
    childSeparator,
    debouncedFetchPreview,
  ]);
  const handleCancelCreate = useCallback(() => {
    // 如果已经创建了 KB 但还没完成，可以选择删除它
    if (createdKbId) {
      fetch(`/api/knowledge-bases/${createdKbId}`, { method: 'DELETE' }).catch(() => {});
    }
    setShowCreateForm(false);
    setCreateStep('info');
    setCreatedKbId(null);
    setFormName('');
    setFormDesc('');
    setUploadedFiles([]);
  }, [createdKbId]);

  // 删除知识库
  const handleDeleteKb = useCallback(async (kbId: string) => {
    try {
      await fetch(`/api/knowledge-bases/${kbId}`, { method: 'DELETE' });
      MessagePlugin.success('知识库已删除');
      fetchKnowledgeBases();
      onKbChange?.();
    } catch {
      MessagePlugin.error('删除失败');
    }
    setDeleteConfirmId(null);
  }, [fetchKnowledgeBases, onKbChange]);

  // 上传文件到已有知识库
  const handleUploadToKb = useCallback(async (kbId: string, files: FileList) => {
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/documents/upload?knowledgeBaseId=${kbId}`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.document) {
          MessagePlugin.success(`"${file.name}" 上传成功`);
        }
      } catch {
        MessagePlugin.error(`"${file.name}" 上传失败`);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => fetchKnowledgeBases(), 1000);
  }, [fetchKnowledgeBases]);

  // 删除文档
  const handleDeleteDoc = useCallback(async (kbId: string, docId: string) => {
    try {
      await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      MessagePlugin.success('文档已删除');
      fetchKnowledgeBases();
    } catch {
      MessagePlugin.error('删除失败');
    }
  }, [fetchKnowledgeBases]);

  // 切换文档启用/禁用
  const handleToggleDoc = useCallback(async (docId: string) => {
    try {
      await fetch(`/api/documents/${docId}/toggle`, { method: 'PATCH' });
      fetchKnowledgeBases();
    } catch {
      MessagePlugin.error('操作失败');
    }
  }, [fetchKnowledgeBases]);

  // 预览分段
  const handlePreviewChunks = useCallback(async (docId: string, kb: KnowledgeBase) => {
    console.log('[Preview] 开始预览文档:', docId);
    setPreviewDocId(docId);
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const res = await fetch('/api/documents/preview-chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId,
          chunkMode: kb.chunkMode,
          chunkSize: kb.chunkSize,
          chunkOverlap: kb.chunkOverlap,
          separator: kb.separator,
          parentChunkSize: kb.parentChunkSize,
          parentSeparator: kb.parentSeparator,
          parentMode: kb.parentMode,
          childChunkSize: kb.childChunkSize,
          childSeparator: kb.childSeparator,
        }),
      });
      const data = await res.json();
      console.log('[Preview] API 响应:', data);
      if (data.chunks) {
        setPreviewChunks(data.chunks);
      } else if (data.detail) {
        MessagePlugin.error(data.detail);
        setPreviewOpen(false);
      }
    } catch (err) {
      console.error('[Preview] 请求失败:', err);
      MessagePlugin.error('预览失败');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // 打开重新分段对话框
  const openRechunkDialog = useCallback((docId: string, kb: KnowledgeBase) => {
    setRechunkDocId(docId);
    setRechunkKb(kb);
    setRechunkPreviewChunks([]);
    setRechunkSettings({
      chunkSize: kb.chunkSize,
      chunkOverlap: kb.chunkOverlap,
      separator: kb.separator,
      parentChunkSize: kb.parentChunkSize,
      parentSeparator: kb.parentSeparator,
      parentMode: kb.parentMode,
      childChunkSize: kb.childChunkSize,
      childSeparator: kb.childSeparator,
    });
  }, []);

  // 重新分段预览（基于文档原文，用当前设置试分段，不写入向量库）
  const fetchRechunkPreview = useCallback(async () => {
    if (!rechunkDocId || !rechunkKb) return;
    setRechunkPreviewLoading(true);
    try {
      const res = await fetch('/api/documents/preview-chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: rechunkDocId,
          chunkMode: rechunkKb.chunkMode,
          chunkSize: rechunkSettings.chunkSize,
          chunkOverlap: rechunkSettings.chunkOverlap,
          separator: rechunkSettings.separator,
          parentChunkSize: rechunkSettings.parentChunkSize,
          parentSeparator: rechunkSettings.parentSeparator,
          parentMode: rechunkSettings.parentMode,
          childChunkSize: rechunkSettings.childChunkSize,
          childSeparator: rechunkSettings.childSeparator,
        }),
      });
      const data = await res.json();
      if (data.chunks) {
        setRechunkPreviewChunks(data.chunks);
      } else if (data.detail) {
        MessagePlugin.error(data.detail);
      }
    } catch (err) {
      console.error('[Rechunk Preview] Error:', err);
    } finally {
      setRechunkPreviewLoading(false);
    }
  }, [rechunkDocId, rechunkKb, rechunkSettings]);

  // 防抖后的重新分段预览函数（500ms）
  const debouncedRechunkPreview = useCallback(
    debounce(fetchRechunkPreview, 500),
    [fetchRechunkPreview]
  );

  // 打开对话框或调整参数时自动触发预览
  useEffect(() => {
    if (rechunkDocId) {
      debouncedRechunkPreview();
    }
  }, [rechunkDocId, rechunkSettings, debouncedRechunkPreview]);

  // 执行重新分段
  const handleRechunk = useCallback(async () => {
    if (!rechunkDocId) return;
    setRechunkLoading(true);
    try {
      const res = await fetch(`/api/documents/${rechunkDocId}/rechunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rechunkSettings),
      });
      const data = await res.json();
      if (data.success) {
        MessagePlugin.success(data.message || '重新分段完成');
        setRechunkDocId(null);
        setRechunkPreviewChunks([]);
        fetchKnowledgeBases();
      } else {
        MessagePlugin.error('重新分段失败');
      }
    } catch {
      MessagePlugin.error('重新分段失败');
    } finally {
      setRechunkLoading(false);
    }
  }, [rechunkDocId, rechunkSettings, fetchKnowledgeBases]);

  // 编辑名称/描述
  const startEditName = useCallback((kb: KnowledgeBase) => {
    setEditingNameKbId(kb.id);
    setEditName(kb.name);
    setEditDesc(kb.description || '');
  }, []);

  const handleSaveName = useCallback(async () => {
    if (!editingNameKbId || !editName.trim()) return;
    try {
      await fetch(`/api/knowledge-bases/${editingNameKbId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDesc }),
      });
      MessagePlugin.success('已更新');
      setEditingNameKbId(null);
      fetchKnowledgeBases();
    } catch {
      MessagePlugin.error('更新失败');
    }
  }, [editingNameKbId, editName, editDesc, fetchKnowledgeBases]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const statusTag = (status: string) => {
    switch (status) {
      case 'ready': return <Tag theme="success" size="small" variant="light">已就绪</Tag>;
      case 'indexing': return <Tag theme="warning" size="small" variant="light">索引中</Tag>;
      case 'empty': return <Tag theme="default" size="small" variant="light">空</Tag>;
      default: return <Tag theme="default" size="small">{status}</Tag>;
    }
  };

  const docStatusTag = (status: string) => {
    switch (status) {
      case 'ready': return <span className="text-xs" style={{ color: '#2ba471' }}>已就绪</span>;
      case 'processing': return <span className="text-xs" style={{ color: '#ed7b2f' }}>处理中</span>;
      case 'error': return <span className="text-xs" style={{ color: '#e34d59' }}>失败</span>;
      default: return <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--td-text-color-placeholder)' }}>
        加载中...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>知识库</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--td-text-color-secondary)' }}>
              创建知识库，上传文档，在对话中选择使用
            </p>
          </div>
          <Button theme="primary" icon={<Plus size={16} />} onClick={() => { setShowCreateForm(true); setCreateStep('info'); }}>
            创建知识库
          </Button>
        </div>

        {/* 创建流程 */}
        {showCreateForm && (
          <div className="p-6 rounded-xl mb-6" style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}>
            {/* 步骤指示器 */}
            <div className="flex items-center gap-2 mb-6">
              {(['info', 'upload', 'chunk'] as CreateStep[]).map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                      style={{
                        backgroundColor: createStep === step ? 'var(--td-brand-color)' : (i < ['info', 'upload', 'chunk'].indexOf(createStep) ? '#2ba471' : 'var(--td-bg-color-component)'),
                        color: createStep === step ? 'white' : (i < ['info', 'upload', 'chunk'].indexOf(createStep) ? '#2ba471' : 'var(--td-text-color-placeholder)'),
                        border: `1px solid ${createStep === step ? 'var(--td-brand-color)' : 'var(--td-component-border)'}`,
                      }}>
                      {i < ['info', 'upload', 'chunk'].indexOf(createStep) ? <Check size={14} /> : i + 1}
                    </div>
                    <span className="text-sm" style={{ color: createStep === step ? 'var(--td-brand-color)' : 'var(--td-text-color-secondary)' }}>
                      {step === 'info' ? '基本信息' : step === 'upload' ? '上传文档' : '分段设置'}
                    </span>
                  </div>
                  {i < 2 && <div className="w-8 h-px" style={{ backgroundColor: 'var(--td-component-border)' }} />}
                </div>
              ))}
            </div>

            {/* 步骤1：基本信息 */}
            {createStep === 'info' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--td-text-color-primary)' }}>知识库名称 *</label>
                  <Input value={formName} onChange={(v: string) => setFormName(v)} placeholder="例如：产品文档、技术手册" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--td-text-color-primary)' }}>描述（可选）</label>
                  <Textarea value={formDesc} onChange={(v: string) => setFormDesc(v)} placeholder="简要描述这个知识库的用途" autosize maxcharacter={500} />
                </div>
                <div className="flex gap-2">
                  <Button theme="primary" onClick={handleCreateKb}>下一步：上传文档</Button>
                  <Button variant="outline" onClick={handleCancelCreate}>取消</Button>
                </div>
              </div>
            )}

            {/* 步骤2：上传文档 */}
            {createStep === 'upload' && (
              <div className="space-y-4">
                <div className="p-6 rounded-lg text-center" style={{ backgroundColor: 'var(--td-bg-color-component)', border: '2px dashed var(--td-component-border)' }}>
                  <Upload size={32} style={{ color: 'var(--td-brand-color)', margin: '0 auto' }} />
                  <p className="mt-3 text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>
                    上传文档到知识库「{formName}」
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                    支持 .txt, .md, .pdf, .docx, .csv, .json 等格式，可上传多个文件
                  </p>
                  <Button theme="primary" className="mt-4" icon={<Upload size={14} />}
                    onClick={() => fileInputRef.current?.click()} loading={uploading}>
                    选择文件
                  </Button>
                </div>

                {uploadedFiles.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--td-text-color-primary)' }}>已上传 {uploadedFiles.length} 个文件：</p>
                    <div className="space-y-1">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                          <FileText size={14} style={{ color: 'var(--td-brand-color)' }} />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCreateStep('info')}>上一步</Button>
                  <Button theme="primary" onClick={() => setCreateStep('chunk')}>
                    {uploadedFiles.length > 0 ? '下一步：分段设置' : '跳过，直接设置分段'}
                  </Button>
                </div>
              </div>
            )}

            {/* 步骤3：分段设置 */}
            {createStep === 'chunk' && (
              <div className="grid grid-cols-2 gap-6">
                {/* 左侧：配置面板 */}
                <div className="space-y-4">
                  <p className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>选择分段模式</p>
                  <div className="space-y-2">
                    <div className="p-3 rounded-lg cursor-pointer"
                      style={{ border: chunkMode === 'general' ? '2px solid var(--td-brand-color)' : '1px solid var(--td-component-border)', backgroundColor: 'var(--td-bg-color-component)' }}
                      onClick={() => setChunkMode('general')}>
                      <div className="flex items-center gap-2">
                        <Settings size={14} style={{ color: 'var(--td-brand-color)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>通用</span>
                        <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>通用文本分块模式，检索和召回的块是相同的</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg cursor-pointer"
                      style={{ border: chunkMode === 'parent_child' ? '2px solid var(--td-brand-color)' : '1px solid var(--td-component-border)', backgroundColor: 'var(--td-bg-color-component)' }}
                      onClick={() => setChunkMode('parent_child')}>
                      <div className="flex items-center gap-2">
                        <Database size={14} style={{ color: 'var(--td-brand-color)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>父子分段</span>
                        <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>子块用于检索，父块用作上下文</span>
                      </div>
                    </div>
                  </div>

                  {chunkMode === 'general' && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>分段标识符</label>
                          <HelpTip text="用于切分文本的分隔符，遇到该符号即断开为新的分段。默认 \\n\\n 表示按空行（段落）切分。" />
                        </div>
                        <Input value={separator} onChange={(v: string) => setSeparator(v)} size="small" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>分段最大长度</label>
                          <HelpTip text="每个分段的最大字符数，超过则强制切分。值越大单段信息越完整，但检索精度可能下降；一般 300~1000。" />
                        </div>
                        <Input type="number" value={String(chunkSize)} onChange={(v: string) => setChunkSize(Number(v))} size="small" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <label className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>分段重叠长度</label>
                          <HelpTip text="相邻分段之间重复的字符数，用于保留上下文连贯性，避免关键信息被切断。一般设为分段长度的 10%~20%。" />
                        </div>
                        <Input type="number" value={String(chunkOverlap)} onChange={(v: string) => setChunkOverlap(Number(v))} size="small" />
                      </div>
                    </div>
                  )}

                  {chunkMode === 'parent_child' && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)', border: '1px solid var(--td-component-border)' }}>
                        <p className="text-xs font-medium mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>父块用作上下文</p>
                        <div className="space-y-2 mb-3">
                          {(['paragraph', 'full'] as const).map(m => (
                            <div key={m} className="p-2 rounded cursor-pointer flex items-center gap-2"
                              style={{ border: parentMode === m ? '1px solid var(--td-brand-color)' : '1px solid var(--td-component-border)' }}
                              onClick={() => setParentMode(m)}>
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ border: `2px solid ${parentMode === m ? 'var(--td-brand-color)' : 'var(--td-component-border)'}` }}>
                                {parentMode === m && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--td-brand-color)' }} />}
                              </div>
                              <span className="text-xs" style={{ color: 'var(--td-text-color-primary)' }}>{m === 'paragraph' ? '段落' : '全文'}</span>
                            </div>
                          ))}
                        </div>
                        {parentMode === 'paragraph' && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段标识符</label>
                              <Input value={parentSeparator} onChange={(v: string) => setParentSeparator(v)} size="small" />
                            </div>
                            <div>
                              <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段最大长度</label>
                              <Input type="number" value={String(parentChunkSize)} onChange={(v: string) => setParentChunkSize(Number(v))} size="small" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)', border: '1px solid var(--td-component-border)' }}>
                        <p className="text-xs font-medium mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>子块用于检索</p>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段标识符</label>
                            <Input value={childSeparator} onChange={(v: string) => setChildSeparator(v)} size="small" />
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段最大长度</label>
                            <Input type="number" value={String(childChunkSize)} onChange={(v: string) => setChildChunkSize(Number(v))} size="small" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 文本预处理规则 */}
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)' }}>
                    <div className="flex items-center gap-1 mb-2">
                      <div className="text-sm font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>文本预处理规则</div>
                      <HelpTip text="在分段前对原始文本做清洗，去除噪声内容，提升检索质量。" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <Checkbox checked={cleanWhitespace} onChange={(v: boolean) => setCleanWhitespace(v)}>
                          <span className="text-sm" style={{ color: 'var(--td-text-color-primary)' }}>替换掉连续的空格、换行符和制表符</span>
                        </Checkbox>
                        <HelpTip text="把多个连续的空格、换行、制表符压缩为单个，去除排版噪声，让分段更干净。" />
                      </div>
                      <div className="flex items-center gap-1">
                        <Checkbox checked={cleanUrlEmail} onChange={(v: boolean) => setCleanUrlEmail(v)}>
                          <span className="text-sm" style={{ color: 'var(--td-text-color-primary)' }}>删除所有 URL 和电子邮件地址</span>
                        </Checkbox>
                        <HelpTip text="移除文本中的网址和邮箱，避免这些无语义内容干扰检索。" />
                      </div>
                    </div>
                  </div>

                  {/* 索引方式 */}
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <div className="text-sm font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>索引方式</div>
                      <HelpTip text="决定文档如何被索引与检索。基础用关键词检索更省、不消耗 token；高级用向量语义检索更准，但需要调用嵌入模型。" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div
                        className="p-3 rounded-lg cursor-pointer transition-all"
                        style={{ border: indexMode === 'economic' ? '2px solid var(--td-brand-color)' : '1px solid var(--td-component-border)', backgroundColor: 'var(--td-bg-color-component)' }}
                        onClick={() => setIndexMode('economic')}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>基础</span>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          使用关键词进行检索，不消耗任何 tokens，开箱即用，适合大多数场景。
                        </div>
                      </div>
                      <div
                        className="p-3 rounded-lg cursor-pointer transition-all"
                        style={{ border: indexMode === 'high_quality' ? '2px solid var(--td-brand-color)' : '1px solid var(--td-component-border)', backgroundColor: 'var(--td-bg-color-component)' }}
                        onClick={() => setIndexMode('high_quality')}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>高级</span>
                          <Tag size="small" theme="primary" variant="light">推荐</Tag>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          调用嵌入模型做向量语义检索，实现更精确的召回，可帮助 LLM 生成更高质量的答案。
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 检索设置 */}
                  <div>
                    <div className="text-sm font-semibold mb-2" style={{ color: 'var(--td-text-color-primary)' }}>检索设置</div>
                    <div className="p-3 rounded-lg space-y-4" style={{ border: '1px solid var(--td-brand-color)', backgroundColor: 'var(--td-bg-color-component)' }}>
                      <div className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>
                        {indexMode === 'economic' ? '关键词检索' : '向量检索'}
                        <span className="text-xs font-normal ml-2" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          {indexMode === 'economic' ? '按关键词匹配文本分段' : '通过生成查询嵌入并查询与其向量表示最相似的文本分段'}
                        </span>
                      </div>

                      {/* Rerank（仅高质量模式） */}
                      {indexMode === 'high_quality' && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>Rerank 模型</span>
                            <HelpTip text="重排序模型将根据候选文档列表与用户问题语义匹配度进行重新排序，从而改进语义排序的结果。系统自动选择重排模型，部分服务商不支持时自动跳过。" />
                          </div>
                          <Switch value={rerankEnabled} onChange={(v: boolean) => setRerankEnabled(v)} size="small" />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <label className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>Top K</label>
                            <HelpTip text="用于筛选与用户问题相似度最高的文本片段数量。系统会根据此值召回最相关的前 K 个分段送给模型参考，一般设 3~8。" />
                          </div>
                          <Input type="number" value={String(retrievalTopK)} onChange={(v: string) => setRetrievalTopK(Number(v))} size="small" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1">
                              <label className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>Score 阈值</label>
                              <HelpTip text="用于设置文本片段筛选的相似度阈值，只有相似度超过该值的分段才会被召回。默认关闭（不过滤）；开启后可设 0~1，值越高要求越严格。" />
                            </div>
                            <Switch value={scoreThresholdEnabled} onChange={(v: boolean) => setScoreThresholdEnabled(v)} size="small" />
                          </div>
                          <Input type="number" value={String(scoreThreshold)} onChange={(v: string) => setScoreThreshold(Number(v))} size="small" disabled={!scoreThresholdEnabled} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 预览文本输入框（如果没有上传文件） */}
                  {uploadedFiles.length === 0 && (
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>
                        预览文本（可选，用于测试分段效果）
                      </label>
                      <Textarea 
                        value={previewText} 
                        onChange={(v: string) => setPreviewText(v)} 
                        placeholder="粘贴一些文本内容，右侧将实时显示分段效果..."
                        autosize
                      />
                    </div>
                  )}

                  <div className="flex gap-2 pt-4 border-t" style={{ borderColor: 'var(--td-component-border)' }}>
                    <Button variant="outline" onClick={() => setCreateStep('upload')}>上一步</Button>
                    <Button theme="primary" onClick={handleFinishCreate}>完成创建</Button>
                    <Button variant="text" onClick={handleCancelCreate} style={{ color: 'var(--td-text-color-placeholder)' }}>取消</Button>
                  </div>
                </div>

                {/* 右侧：实时预览面板 */}
                <div className="border-l pl-6" style={{ borderColor: 'var(--td-component-border)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
                      分段预览
                      {step3PreviewChunks.length > 0 && (
                        <span className="ml-2 text-xs font-normal" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          · 共 {step3PreviewChunks.length} 块
                        </span>
                      )}
                    </h3>
                    {previewText.trim() && (
                      <Button size="small" variant="text" icon={<SlidersHorizontal size={14} />} onClick={debouncedFetchPreview}>
                        刷新预览
                      </Button>
                    )}
                  </div>

                  <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2">
                    {!previewText.trim() ? (
                      <div className="text-center py-12" style={{ color: 'var(--td-text-color-placeholder)' }}>
                        <FileText size={32} className="mx-auto mb-3 opacity-50" />
                        <p className="text-sm">请先上传文件或粘贴文本内容</p>
                        <p className="text-xs mt-1">调整左侧参数后，这里会实时显示分段效果</p>
                      </div>
                    ) : step3PreviewLoading ? (
                      <div className="text-center py-8" style={{ color: 'var(--td-text-color-placeholder)' }}>
                        <div className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mb-2"></div>
                        <p className="text-sm">正在生成分段...</p>
                      </div>
                    ) : step3PreviewChunks.length === 0 ? (
                      <div className="text-center py-8" style={{ color: 'var(--td-text-color-placeholder)' }}>
                        <p className="text-sm">暂无分段结果</p>
                        <p className="text-xs mt-1">请检查分段参数是否合适</p>
                      </div>
                    ) : (
                      step3PreviewChunks.map(chunk => (
                        <div key={chunk.index} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)', border: '1px solid var(--td-component-border)' }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Settings size={12} style={{ color: 'var(--td-brand-color)' }} />
                            <span className="text-xs font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>Chunk-{chunk.index + 1}</span>
                            <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>· {chunk.length} characters</span>
                          </div>
                          <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--td-text-color-primary)', fontFamily: 'inherit', margin: 0, lineHeight: 1.6 }}>
                            {chunk.content}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 知识库列表（创建向导展开时隐藏，避免与表单重叠） */}
        {showCreateForm ? null : knowledgeBases.length === 0 ? (
          <div className="text-center py-16">
            <Database size={48} style={{ color: 'var(--td-text-color-placeholder)' }} />
            <p className="mt-4 text-lg font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>暂无知识库</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--td-text-color-placeholder)' }}>
              点击「创建知识库」开始
            </p>
            <Button theme="primary" className="mt-6" icon={<Plus size={16} />} onClick={() => { setShowCreateForm(true); setCreateStep('info'); }}>
              创建第一个知识库
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {knowledgeBases.map(kb => {
              const isExpanded = expandedKbId === kb.id;
              const isEditingName = editingNameKbId === kb.id;

              return (
                <div key={kb.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}>
                  {/* 知识库头部 */}
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer" style={{ backgroundColor: 'var(--td-brand-color-light)' }}
                      onClick={() => setExpandedKbId(isExpanded ? null : kb.id)}>
                      <Database size={20} style={{ color: 'var(--td-brand-color)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditingName ? (
                        <div className="flex items-center gap-2">
                          <Input value={editName} onChange={(v: string) => setEditName(v)} size="small" style={{ maxWidth: '200px' }} />
                          <Button size="small" theme="primary" onClick={handleSaveName}>保存</Button>
                          <Button size="small" variant="text" onClick={() => setEditingNameKbId(null)}>取消</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium cursor-pointer" style={{ color: 'var(--td-text-color-primary)' }}
                            onDoubleClick={() => startEditName(kb)} title="双击编辑名称">{kb.name}</span>
                          {statusTag(kb.status)}
                          <IconBtn icon={<Edit3 size={16} />} onClick={() => startEditName(kb)} title="编辑名称和描述" variant="primary" />
                        </div>
                      )}
                      {kb.description && !isEditingName && (
                        <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--td-text-color-secondary)' }}>{kb.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          {kb.documentCount} 个文档
                        </span>
                        <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          分段: {kb.chunkMode === 'parent_child' ? `父子(父${kb.parentChunkSize}/子${kb.childChunkSize})` : `${kb.chunkSize}/重叠${kb.chunkOverlap}`}
                          <span className="ml-1 px-1 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--td-bg-color-component)', fontSize: '10px' }}>已锁定</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="small" variant="outline" icon={<Upload size={14} />}
                        onClick={() => { setActiveUploadKbId(kb.id); fileInputRef.current?.click(); }}
                        loading={uploading}
                      >
                        添加文件
                      </Button>
                      <IconBtn icon={<Trash2 size={18} />} onClick={() => setDeleteConfirmId(kb.id)} title="删除知识库" variant="danger" />
                      <IconBtn icon={isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />} onClick={() => setExpandedKbId(isExpanded ? null : kb.id)} title={isExpanded ? '收起' : '展开'} />
                    </div>
                  </div>

                  {/* 展开：文档列表 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--td-component-border)' }}>
                      {kb.documents.length === 0 ? (
                        <div className="py-8 text-center" style={{ color: 'var(--td-text-color-placeholder)' }}>
                          <FileText size={32} className="mx-auto mb-2" />
                          <p className="text-sm">暂无文档，点击上方「添加文件」上传</p>
                        </div>
                      ) : (
                        <div className="mt-3">
                          {/* 表头 */}
                          <div className="flex items-center gap-3 px-3 py-2 text-xs font-medium" style={{ color: 'var(--td-text-color-secondary)', borderBottom: '1px solid var(--td-component-border)' }}>
                            <span className="w-8 text-center">#</span>
                            <span className="flex-1 min-w-0">名称</span>
                            <span className="w-20 text-center">分段模式</span>
                            <span className="w-20 text-center">字符数</span>
                            <span className="w-36 text-center">上传时间</span>
                            <span className="w-16 text-center">状态</span>
                            <span className="w-28 text-center">操作</span>
                          </div>
                          {/* 文档行 */}
                          {kb.documents.map((doc, idx) => (
                            <div key={doc.id} className="flex items-center gap-3 px-3 py-3 border-b last:border-b-0 group" style={{ borderColor: 'var(--td-component-border)', backgroundColor: doc.isEnabled ? 'transparent' : 'var(--td-bg-color-component)' }}>
                              <span className="w-8 text-center text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: doc.isEnabled ? 'var(--td-text-color-primary)' : 'var(--td-text-color-placeholder)' }}>{doc.originalName}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>{doc.fileType} · {formatFileSize(doc.fileSize)} · {doc.chunkCount} 块</span>
                                </div>
                              </div>
                              <span className="w-20 text-center">
                                <Tag size="small" variant="outline" theme="default">{kb.chunkMode === 'parent_child' ? '父子' : '通用'}</Tag>
                              </span>
                              <span className="w-20 text-center text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
                                {formatFileSize(doc.fileSize)}
                              </span>
                              <span className="w-36 text-center text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                                {doc.createdAt ? new Date(doc.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                              </span>
                              <span className="w-16 text-center">{docStatusTag(doc.status)}</span>
                              <div className="w-28 flex items-center justify-center gap-1">
                                <IconBtn icon={<SlidersHorizontal size={14} />} onClick={() => openRechunkDialog(doc.id, kb)} title="分段设置" variant="default" />
                                <IconBtn icon={<Eye size={14} />} onClick={() => handlePreviewChunks(doc.id, kb)} title="预览块" variant="primary" />
                                <button
                                  className="relative w-9 h-5 rounded-full cursor-pointer transition-colors flex-shrink-0"
                                  style={{ backgroundColor: doc.isEnabled ? 'var(--td-brand-color)' : 'var(--td-component-border)' }}
                                  onClick={() => handleToggleDoc(doc.id)}
                                  title={doc.isEnabled ? '禁用此文档' : '启用此文档'}
                                >
                                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                                    style={{ left: doc.isEnabled ? '18px' : '2px' }} />
                                </button>
                                <IconBtn icon={<X size={16} />} onClick={() => handleDeleteDoc(kb.id, doc.id)} title="删除文档" variant="danger" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-3">
                        <Button size="small" variant="outline" icon={<Upload size={14} />}
                          onClick={() => { setActiveUploadKbId(kb.id); fileInputRef.current?.click(); }}
                          loading={uploading}
                        >
                          添加文件
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 隐藏的上传文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.pdf,.docx,.doc,.csv,.json,.log"
          className="hidden"
          onChange={e => {
            if (e.target.files) {
              if (createdKbId && showCreateForm) {
                handleUploadFiles(e.target.files);
              } else if (activeUploadKbId) {
                handleUploadToKb(activeUploadKbId, e.target.files);
              }
            }
          }}
        />

        {/* 删除确认对话框 */}
        <Dialog
          header="确认删除"
          body="删除知识库将同时删除其中所有文档的向量数据，此操作不可恢复。"
          visible={deleteConfirmId !== null}
          onClose={() => setDeleteConfirmId(null)}
          onConfirm={() => deleteConfirmId && handleDeleteKb(deleteConfirmId)}
        />

        {/* 预览块弹窗 */}
        <Dialog
          header={`预览分段结果${previewChunks.length > 0 ? ` · 共 ${previewChunks.length} 块` : ''}`}
          visible={previewOpen}
          onClose={() => setPreviewOpen(false)}
          onConfirm={() => setPreviewOpen(false)}
          confirmBtn="关闭"
          cancelBtn={null}
          width="700px"
        >
          <div className="max-h-[60vh] overflow-y-auto space-y-3">
            {previewLoading ? (
              <div className="text-center py-8" style={{ color: 'var(--td-text-color-placeholder)' }}>加载中...</div>
            ) : previewChunks.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--td-text-color-placeholder)' }}>暂无分段结果</div>
            ) : (
              previewChunks.map(chunk => (
                <div key={chunk.index} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)', border: '1px solid var(--td-component-border)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Settings size={12} style={{ color: 'var(--td-brand-color)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>Chunk-{chunk.index + 1}</span>
                    <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>· {chunk.length} characters</span>
                  </div>
                  <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--td-text-color-primary)', fontFamily: 'inherit', margin: 0 }}>{chunk.content}</pre>
                </div>
              ))
            )}
          </div>
        </Dialog>

        {/* 重新分段对话框 */}
        <Dialog
          header="重新分段设置"
          visible={rechunkDocId !== null}
          onClose={() => { setRechunkDocId(null); setRechunkPreviewChunks([]); }}
          onConfirm={handleRechunk}
          confirmBtn={rechunkLoading ? '处理中...' : '确认重新分段'}
          cancelBtn="取消"
          width="880px"
        >
          {rechunkKb && (
            <div className="grid grid-cols-2 gap-6">
              {/* 左侧：分段参数 */}
              <div className="space-y-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)', border: '1px solid var(--td-component-border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>
                  分段模式：<span className="font-medium" style={{ color: 'var(--td-text-color-primary)' }}>{rechunkKb.chunkMode === 'parent_child' ? '父子分段' : '通用'}</span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>（不可更改）</span>
                </p>
              </div>

              {rechunkKb.chunkMode === 'general' && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段标识符</label>
                    <Input value={rechunkSettings.separator} onChange={(v: string) => setRechunkSettings(s => ({ ...s, separator: v }))} size="small" />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段最大长度</label>
                    <Input type="number" value={String(rechunkSettings.chunkSize)} onChange={(v: string) => setRechunkSettings(s => ({ ...s, chunkSize: Number(v) }))} size="small" />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段重叠长度</label>
                    <Input type="number" value={String(rechunkSettings.chunkOverlap)} onChange={(v: string) => setRechunkSettings(s => ({ ...s, chunkOverlap: Number(v) }))} size="small" />
                  </div>
                </div>
              )}

              {rechunkKb.chunkMode === 'parent_child' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)', border: '1px solid var(--td-component-border)' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>父块设置</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段标识符</label>
                        <Input value={rechunkSettings.parentSeparator} onChange={(v: string) => setRechunkSettings(s => ({ ...s, parentSeparator: v }))} size="small" />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段最大长度</label>
                        <Input type="number" value={String(rechunkSettings.parentChunkSize)} onChange={(v: string) => setRechunkSettings(s => ({ ...s, parentChunkSize: Number(v) }))} size="small" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)', border: '1px solid var(--td-component-border)' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--td-text-color-secondary)' }}>子块设置</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段标识符</label>
                        <Input value={rechunkSettings.childSeparator} onChange={(v: string) => setRechunkSettings(s => ({ ...s, childSeparator: v }))} size="small" />
                      </div>
                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--td-text-color-secondary)' }}>分段最大长度</label>
                        <Input type="number" value={String(rechunkSettings.childChunkSize)} onChange={(v: string) => setRechunkSettings(s => ({ ...s, childChunkSize: Number(v) }))} size="small" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-lg" style={{ backgroundColor: '#fff1e9', border: '1px solid #ffe0b2' }}>
                <p className="text-xs" style={{ color: '#ed7b2f' }}>
                  ⚠️ 重新分段将删除旧的向量数据并用新设置重新生成，此操作不可撤销。
                </p>
              </div>
              </div>

              {/* 右侧：实时预览面板 */}
              <div className="border-l pl-6" style={{ borderColor: 'var(--td-component-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
                    分段预览
                    {rechunkPreviewChunks.length > 0 && (
                      <span className="ml-2 text-xs font-normal" style={{ color: 'var(--td-text-color-placeholder)' }}>
                        · 共 {rechunkPreviewChunks.length} 块
                      </span>
                    )}
                  </h3>
                  <Button size="small" variant="text" icon={<SlidersHorizontal size={14} />} onClick={fetchRechunkPreview}>
                    刷新预览
                  </Button>
                </div>

                <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-2">
                  {rechunkPreviewLoading ? (
                    <div className="text-center py-8" style={{ color: 'var(--td-text-color-placeholder)' }}>
                      <div className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mb-2"></div>
                      <p className="text-sm">正在生成分段...</p>
                    </div>
                  ) : rechunkPreviewChunks.length === 0 ? (
                    <div className="text-center py-8" style={{ color: 'var(--td-text-color-placeholder)' }}>
                      <p className="text-sm">暂无分段结果</p>
                      <p className="text-xs mt-1">请检查分段参数是否合适</p>
                    </div>
                  ) : (
                    rechunkPreviewChunks.map(chunk => (
                      <div key={chunk.index} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)', border: '1px solid var(--td-component-border)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <Settings size={12} style={{ color: 'var(--td-brand-color)' }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--td-text-color-secondary)' }}>Chunk-{chunk.index + 1}</span>
                          <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>· {chunk.length} characters</span>
                        </div>
                        <pre className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--td-text-color-primary)', fontFamily: 'inherit', margin: 0, lineHeight: 1.6 }}>
                          {chunk.content}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </div>
  );
}
