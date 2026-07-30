import { useState, useCallback, useEffect, ReactNode } from 'react';
import { Input, Button, MessagePlugin, Popup, Dialog, Switch } from 'tdesign-react';
import { CheckCircleIcon, InfoCircleIcon } from 'tdesign-icons-react';
import { Plus, Trash2, Edit3, Eye, EyeOff, Power, HelpCircle } from 'lucide-react';
import { IconBtn } from '../components/IconBtn';
import { ApiConfig, PRESET_CONFIGS } from '../types';

// 带问号提示的表单标签：鼠标悬停问号图标显示参数说明
function LabelWithHelp({ label, help }: { label: string; help: string }) {
  return (
    <label className="flex items-center gap-1 text-sm font-medium mb-1" style={{ color: 'var(--td-text-color-primary)' }}>
      <span>{label}</span>
      <Popup content={<div style={{ maxWidth: 260, lineHeight: 1.6 }}>{help}</div>} placement="top" showArrow>
        <HelpCircle size={14} style={{ color: 'var(--td-text-color-placeholder)', cursor: 'help' }} />
      </Popup>
    </label>
  );
}

// 开关式参数行：关闭时使用服务商默认值，打开后可自定义。右侧渲染自定义控件（children）
function ParamToggleRow({ label, help, enabled, onToggle, children }: {
  label: string;
  help: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Switch value={enabled} onChange={(v: boolean) => onToggle(v)} size="small" />
      <div className="flex items-center gap-1 w-28 flex-shrink-0">
        <span className="text-sm font-medium" style={{ color: 'var(--td-text-color-primary)' }}>{label}</span>
        <Popup content={<div style={{ maxWidth: 260, lineHeight: 1.6 }}>{help}</div>} placement="top" showArrow>
          <HelpCircle size={14} style={{ color: 'var(--td-text-color-placeholder)', cursor: 'help' }} />
        </Popup>
      </div>
      <div className="flex-1" style={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
        {children}
      </div>
    </div>
  );
}

interface SettingsPageProps {
  configs: ApiConfig[];
  activeConfigId: string | null;
  onFetchConfigs: () => Promise<void>;
  onCreateConfig: (config: any) => Promise<any>;
  onUpdateConfig: (id: string, config: any) => Promise<any>;
  onDeleteConfig: (id: string) => Promise<any>;
  onActivateConfig: (id: string) => Promise<any>;
}

export function SettingsPage({ configs, activeConfigId, onFetchConfigs, onCreateConfig, onUpdateConfig, onDeleteConfig, onActivateConfig }: SettingsPageProps) {
  const [editingConfig, setEditingConfig] = useState<ApiConfig | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // 表单状态
  const [formName, setFormName] = useState('');
  const [formApiBase, setFormApiBase] = useState('https://api.deepseek.com/v1');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModel, setFormModel] = useState('deepseek-chat');
  const [formMaxTokens, setFormMaxTokens] = useState(2048);
  const [formTemperature, setFormTemperature] = useState(0.7);
  const [formTopP, setFormTopP] = useState(1.0);
  const [formTemperatureEnabled, setFormTemperatureEnabled] = useState(false);
  const [formTopPEnabled, setFormTopPEnabled] = useState(false);
  const [formMaxTokensEnabled, setFormMaxTokensEnabled] = useState(false);
  const [formThinkingEnabled, setFormThinkingEnabled] = useState(false);
  const [formThinking, setFormThinking] = useState(false);

  // Embedding / Rerank 独立配置（全部选填，留空则自动推断）
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formEmbeddingModel, setFormEmbeddingModel] = useState('');
  const [formEmbeddingApiBase, setFormEmbeddingApiBase] = useState('');
  const [formEmbeddingApiKey, setFormEmbeddingApiKey] = useState('');
  const [formRerankModel, setFormRerankModel] = useState('');
  const [formRerankApiBase, setFormRerankApiBase] = useState('');
  const [formRerankApiKey, setFormRerankApiKey] = useState('');

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 预设快捷填入
  const handlePreset = useCallback((preset: typeof PRESET_CONFIGS[0]) => {
    setFormName(preset.name);
    setFormApiBase(preset.apiBase);
    setFormModel(preset.model);
  }, []);

  // 开始创建新配置
  const startCreate = useCallback(() => {
    setIsCreating(true);
    setEditingConfig(null);
    setFormName('');
    setFormApiBase('https://api.deepseek.com/v1');
    setFormApiKey('');
    setFormModel('deepseek-chat');
    setFormMaxTokens(2048);
    setFormTemperature(0.7);
    setFormTopP(1.0);
    setFormTemperatureEnabled(false);
    setFormTopPEnabled(false);
    setFormMaxTokensEnabled(false);
    setFormThinkingEnabled(false);
    setFormThinking(false);
    setFormEmbeddingModel('');
    setFormEmbeddingApiBase('');
    setFormEmbeddingApiKey('');
    setFormRerankModel('');
    setFormRerankApiBase('');
    setFormRerankApiKey('');
    setShowAdvanced(false);
  }, []);

  // 开始编辑已有配置
  const startEdit = useCallback(async (config: ApiConfig) => {
    setIsCreating(false);
    setEditingConfig(config);
    setFormName(config.name);
    setFormApiBase(config.apiBase);
    setFormModel(config.model);
    setFormMaxTokens(config.maxTokens);
    setFormTemperature(config.temperature);
    setFormTopP(config.topP ?? 1.0);
    setFormTemperatureEnabled(config.temperatureEnabled ?? false);
    setFormTopPEnabled(config.topPEnabled ?? false);
    setFormMaxTokensEnabled(config.maxTokensEnabled ?? false);
    setFormThinkingEnabled(config.thinkingEnabled ?? false);
    setFormThinking(config.thinking ?? false);
    setFormEmbeddingModel(config.embeddingModel ?? '');
    setFormEmbeddingApiBase(config.embeddingApiBase ?? '');
    setFormRerankModel(config.rerankModel ?? '');
    setFormRerankApiBase(config.rerankApiBase ?? '');
    setFormEmbeddingApiKey('');
    setFormRerankApiKey('');
    // 有独立配置时默认展开高级设置
    setShowAdvanced(!!(config.embeddingModel || config.embeddingApiBase || config.rerankModel || config.rerankApiBase));
    // 获取完整 API Key（不脱敏）
    try {
      const res = await fetch(`/api/configs/${config.id}/full`);
      const data = await res.json();
      if (data.config) {
        setFormApiKey(data.config.api_key);
        setFormEmbeddingApiKey(data.config.embedding_api_key || '');
        setFormRerankApiKey(data.config.rerank_api_key || '');
      }
    } catch {
      setFormApiKey('');
    }
  }, []);

  // 保存配置
  const handleSave = useCallback(async () => {
    if (!formApiBase || !formModel) {
      MessagePlugin.warning('请填写 API Base URL 和模型名称');
      return;
    }
    // 创建时必须填 key；编辑时如果没填 key，保留原有
    if (isCreating && !formApiKey) {
      MessagePlugin.warning('请填写 API Key');
      return;
    }

    try {
      if (isCreating) {
        const result = await onCreateConfig({
          name: formName || '我的配置',
          apiBase: formApiBase,
          apiKey: formApiKey,
          model: formModel,
          maxTokens: formMaxTokens,
          temperature: formTemperature,
          topP: formTopP,
          temperatureEnabled: formTemperatureEnabled,
          topPEnabled: formTopPEnabled,
          maxTokensEnabled: formMaxTokensEnabled,
          thinkingEnabled: formThinkingEnabled,
          thinking: formThinking,
          embeddingModel: formEmbeddingModel || undefined,
          embeddingApiBase: formEmbeddingApiBase || undefined,
          embeddingApiKey: formEmbeddingApiKey || undefined,
          rerankModel: formRerankModel || undefined,
          rerankApiBase: formRerankApiBase || undefined,
          rerankApiKey: formRerankApiKey || undefined,
        });
        if (result?.config) {
          // 创建后自动激活
          await onActivateConfig(result.config.id);
          MessagePlugin.success('配置已创建并激活');
          setIsCreating(false);
        }
      } else if (editingConfig) {
        const updates: any = {
          name: formName,
          apiBase: formApiBase,
          model: formModel,
          maxTokens: formMaxTokens,
          temperature: formTemperature,
          topP: formTopP,
          temperatureEnabled: formTemperatureEnabled,
          topPEnabled: formTopPEnabled,
          maxTokensEnabled: formMaxTokensEnabled,
          thinkingEnabled: formThinkingEnabled,
          thinking: formThinking,
          embeddingModel: formEmbeddingModel,
          embeddingApiBase: formEmbeddingApiBase,
          rerankModel: formRerankModel,
          rerankApiBase: formRerankApiBase,
        };
        // 只有填了新 key 才更新
        if (formApiKey) updates.apiKey = formApiKey;
        if (formEmbeddingApiKey) updates.embeddingApiKey = formEmbeddingApiKey;
        if (formRerankApiKey) updates.rerankApiKey = formRerankApiKey;
        await onUpdateConfig(editingConfig.id, updates);
        MessagePlugin.success('配置已更新');
        setEditingConfig(null);
      }
      await onFetchConfigs();
      setFormApiKey('');
      setShowKey(false);
    } catch (e) {
      MessagePlugin.error('保存配置失败');
    }
  }, [isCreating, editingConfig, formName, formApiBase, formApiKey, formModel, formMaxTokens, formTemperature, formTopP, formTemperatureEnabled, formTopPEnabled, formMaxTokensEnabled, formThinkingEnabled, formThinking, onCreateConfig, onUpdateConfig, onActivateConfig, onFetchConfigs]);

  // 取消编辑
  const handleCancel = useCallback(() => {
    setIsCreating(false);
    setEditingConfig(null);
    setFormApiKey('');
    setShowKey(false);
  }, []);

  // 删除配置
  const handleDelete = useCallback(async (id: string) => {
    try {
      await onDeleteConfig(id);
      MessagePlugin.success('配置已删除');
      if (editingConfig?.id === id) handleCancel();
      await onFetchConfigs();
    } catch {
      MessagePlugin.error('删除失败');
    }
    setDeleteConfirmId(null);
  }, [editingConfig, onDeleteConfig, onFetchConfigs, handleCancel]);

  // 激活配置
  const handleActivate = useCallback(async (id: string) => {
    try {
      await onActivateConfig(id);
      MessagePlugin.success('已激活该配置');
      await onFetchConfigs();
    } catch {
      MessagePlugin.error('激活失败');
    }
  }, [onActivateConfig, onFetchConfigs]);

  // 当前编辑/创建中的配置 ID（用于判断高亮）
  const editingId = editingConfig?.id;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>模型管理</h2>
          <Button theme="primary" size="small" onClick={startCreate} icon={<Plus size={16} />}>
            新增配置
          </Button>
        </div>

        {/* 当前活跃状态 */}
        {activeConfigId ? (
          <div className="mb-6 p-4 rounded-lg flex items-center gap-3" style={{ backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9' }}>
            <CheckCircleIcon size={20} style={{ color: '#2ba471' }} />
            <div>
              <p className="font-medium" style={{ color: '#2ba471' }}>模型已配置</p>
              <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                当前模型: {configs.find(c => c.id === activeConfigId)?.name || '未知'} 
                · {configs.find(c => c.id === activeConfigId)?.model || ''}
                · {configs.find(c => c.id === activeConfigId)?.apiBase || ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-lg flex items-center gap-3" style={{ backgroundColor: '#fff1e9', border: '1px solid #ffe0b2' }}>
            <InfoCircleIcon size={20} style={{ color: '#ed7b2f' }} />
            <div>
              <p className="font-medium" style={{ color: '#ed7b2f' }}>未配置模型</p>
              <p className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                请添加并激活一个模型配置后才能使用对话功能
              </p>
            </div>
          </div>
        )}

        {/* 配置列表 */}
        <div className="space-y-3 mb-6">
          {configs.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--td-text-color-placeholder)' }}>
              <p>暂无配置，点击「新增配置」添加你的第一个模型</p>
            </div>
          ) : configs.map(config => (
            <div key={config.id}
              className="p-4 rounded-lg flex items-center justify-between transition-colors"
              style={{
                backgroundColor: config.id === editingId ? 'var(--td-brand-color-light)' : 'var(--td-bg-color-component)',
                border: `1px solid ${config.id === activeConfigId ? 'var(--td-brand-color)' : 'var(--td-component-border)'}`,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                {config.id === activeConfigId && (
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#2ba471' }} />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate" style={{ color: 'var(--td-text-color-primary)' }}>{config.name}</span>
                    {config.id === activeConfigId && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: '#e8f5e9', color: '#2ba471' }}>活跃</span>
                    )}
                  </div>
                  <p className="text-sm truncate" style={{ color: 'var(--td-text-color-secondary)' }}>
                    {config.model} · {config.apiBase}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>
                    Key: {config.apiKey} · MaxTokens: {config.maxTokens} · Temp: {config.temperature}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                {config.id !== activeConfigId && (
                  <IconBtn icon={<Power size={18} />} onClick={() => handleActivate(config.id)} title="激活此配置" variant="success" />
                )}
                <IconBtn icon={<Edit3 size={18} />} onClick={() => startEdit(config)} title="编辑" variant="primary" />
                <IconBtn icon={<Trash2 size={18} />} onClick={() => setDeleteConfirmId(config.id)} title="删除" variant="danger" />
              </div>
            </div>
          ))}
        </div>

        {/* 删除确认对话框 */}
        <Dialog
          header="确认删除"
          body="删除后无法恢复，确定要删除这个模型配置吗？"
          visible={deleteConfirmId !== null}
          onClose={() => setDeleteConfirmId(null)}
          onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        />

        {/* 编辑/创建表单 */}
        {(isCreating || editingConfig) && (
          <div className="p-6 rounded-lg mb-6" style={{ backgroundColor: 'var(--td-bg-color-container)', border: '1px solid var(--td-component-border)' }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--td-text-color-primary)' }}>
              {isCreating ? '新增模型配置' : `编辑: ${editingConfig?.name}`}
            </h3>

            {/* 预设快捷选择 */}
            <div className="mb-4">
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--td-text-color-primary)' }}>快速预设</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_CONFIGS.map(preset => (
                  <Button key={preset.name} variant="outline" size="small"
                    onClick={() => handlePreset(preset)}
                    theme={formApiBase === preset.apiBase && formModel === preset.model ? 'primary' : 'default'}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--td-text-color-primary)' }}>配置名称</label>
                <Input value={formName} onChange={(v: string) => setFormName(v)} placeholder="例如: 我的DeepSeek配置 / 火山豆包" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--td-text-color-primary)' }}>API Base URL</label>
                <Input value={formApiBase} onChange={(v: string) => setFormApiBase(v)} placeholder="https://api.deepseek.com/v1" />
                <p className="text-xs mt-1" style={{ color: 'var(--td-text-color-placeholder)' }}>
                  OpenAI 兼容接口地址。支持硅基流动、火山引擎、DeepSeek、通义千问、Moonshot、智谱等任何兼容接口
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--td-text-color-primary)' }}>API Key</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input type={showKey ? 'text' : 'password'} value={formApiKey} onChange={(v: string) => setFormApiKey(v)}
                      placeholder={isCreating ? 'sk-xxx...' : '留空则保留原 Key'} />
                  </div>
                  <button className="p-2 rounded-lg cursor-pointer" style={{ color: 'var(--td-text-color-placeholder)' }}
                    onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {!isCreating && (
                  <p className="text-xs mt-1" style={{ color: 'var(--td-text-color-placeholder)' }}>
                    留空则保留原有 Key，输入新值则覆盖
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--td-text-color-primary)' }}>模型名称</label>
                <Input value={formModel} onChange={(v: string) => setFormModel(v)} placeholder="deepseek-chat / gpt-4o / doubao-1.5-pro-32k" />
              </div>

              {/* 模型参数：开关式，关闭用服务商默认值，打开后可自定义 */}
              <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--td-bg-color-component)' }}>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--td-text-color-primary)' }}>模型参数</div>
                <p className="text-xs mb-2" style={{ color: 'var(--td-text-color-placeholder)' }}>
                  默认关闭、使用模型服务商默认值；打开开关后可自定义该参数。
                </p>
                <ParamToggleRow
                  label="温度"
                  help="控制回答的随机性/创造力。数值越小越严谨稳定，越大越发散有创意。文档问答建议 0.1~0.4。一般温度和 Top P 二选一调整即可。"
                  enabled={formTemperatureEnabled}
                  onToggle={setFormTemperatureEnabled}
                >
                  <Input type="number" value={String(formTemperature)} onChange={(v: string) => setFormTemperature(Number(v))} />
                </ParamToggleRow>
                <ParamToggleRow
                  label="Top P"
                  help="控制生成结果的随机性。数值越小越稳定，越大越发散。一般 Top P 和温度二选一调整即可，默认 1。"
                  enabled={formTopPEnabled}
                  onToggle={setFormTopPEnabled}
                >
                  <Input type="number" value={String(formTopP)} onChange={(v: string) => setFormTopP(Number(v))} />
                </ParamToggleRow>
                <ParamToggleRow
                  label="最大标记"
                  help="单次回复能生成的最大 token 数（约等于字数上限）。设太小回答会被截断，设太大更费额度。不确定就关闭，用模型默认。"
                  enabled={formMaxTokensEnabled}
                  onToggle={setFormMaxTokensEnabled}
                >
                  <Input type="number" value={String(formMaxTokens)} onChange={(v: string) => setFormMaxTokens(Number(v))} />
                </ParamToggleRow>
                <ParamToggleRow
                  label="思考模式"
                  help="开启后要求模型先推理再作答（仅部分推理模型支持，如 DeepSeek-R、Qwen3 等）；不支持的模型会自动忽略此设置。"
                  enabled={formThinkingEnabled}
                  onToggle={setFormThinkingEnabled}
                >
                  <div className="flex gap-2">
                    <Button
                      size="small"
                      theme={formThinking ? 'primary' : 'default'}
                      variant={formThinking ? 'base' : 'outline'}
                      onClick={() => setFormThinking(true)}
                    >开启</Button>
                    <Button
                      size="small"
                      theme={!formThinking ? 'primary' : 'default'}
                      variant={!formThinking ? 'base' : 'outline'}
                      onClick={() => setFormThinking(false)}
                    >关闭</Button>
                  </div>
                </ParamToggleRow>
              </div>

              {/* Embedding / Rerank 高级设置（可折叠） */}
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)' }}>
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>高级模型设置</span>
                    <Popup content={<div style={{ maxWidth: 260, lineHeight: 1.6 }}>Embedding 和 Rerank 单独配置服务商。留空则根据当前对话服务商自动推断模型与 API。需要不同服务商时才填写。</div>} placement="top" showArrow>
                      <HelpCircle size={14} style={{ color: 'var(--td-text-color-placeholder)', cursor: 'help' }} />
                    </Popup>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--td-text-color-placeholder)' }}>{showAdvanced ? '收起' : '展开'}</span>
                </div>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 pt-2">
                    {/* Embedding 配置 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold" style={{ color: 'var(--td-text-color-secondary)' }}>向量化 (Embedding)</span>
                        <Popup content={<div style={{ maxWidth: 260, lineHeight: 1.6 }}>用于把文档和查询转为向量供检索。留空自动识别对话服务商选择默认嵌入模型。</div>} placement="top" showArrow>
                          <HelpCircle size={12} style={{ color: 'var(--td-text-color-placeholder)', cursor: 'help' }} />
                        </Popup>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="text" placeholder="API Base（留空复用对话）" size="small" value={formEmbeddingApiBase} onChange={setFormEmbeddingApiBase} />
                        <Input type={showKey ? 'text' : 'password'} placeholder="API Key（留空复用对话）" size="small" value={formEmbeddingApiKey} onChange={setFormEmbeddingApiKey} />
                      </div>
                      <Input type="text" placeholder="模型名（留空自动推断）" size="small" value={formEmbeddingModel} onChange={setFormEmbeddingModel} />
                    </div>

                    {/* Rerank 配置 */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold" style={{ color: 'var(--td-text-color-secondary)' }}>重排 (Rerank)</span>
                        <Popup content={<div style={{ maxWidth: 260, lineHeight: 1.6 }}>检索后对候选结果重新排序提升相关性。留空自动识别对话服务商。部分服务商不提供 rerank 接口时会自动跳过。</div>} placement="top" showArrow>
                          <HelpCircle size={12} style={{ color: 'var(--td-text-color-placeholder)', cursor: 'help' }} />
                        </Popup>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="text" placeholder="API Base（留空复用对话）" size="small" value={formRerankApiBase} onChange={setFormRerankApiBase} />
                        <Input type={showKey ? 'text' : 'password'} placeholder="API Key（留空复用对话）" size="small" value={formRerankApiKey} onChange={setFormRerankApiKey} />
                      </div>
                      <Input type="text" placeholder="模型名（留空自动推断）" size="small" value={formRerankModel} onChange={setFormRerankModel} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button theme="primary" onClick={handleSave}>保存</Button>
                <Button variant="outline" onClick={handleCancel}>取消</Button>
              </div>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--td-bg-color-component)' }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--td-text-color-primary)' }}>使用说明</h3>
          <div className="text-sm space-y-1" style={{ color: 'var(--td-text-color-secondary)' }}>
            <p>1. 可以添加多个模型配置，如 DeepSeek、硅基流动、火山引擎等</p>
            <p>2. 所有 OpenAI 兼容格式的 API 均可使用</p>
            <p>3. 对话时可自由选择使用哪个模型</p>
            <p>4. 不上传文档时也能进行纯对话</p>
            <p>5. 硅基流动: API Base 填 https://api.siliconflow.cn/v1</p>
            <p>6. 火山引擎: API Base 填 https://ark.cn-beijing.volces.com/api/v3，模型填 doubao 端点 ID</p>
          </div>
        </div>
      </div>
    </div>
  );
}
