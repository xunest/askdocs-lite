export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: SourceRef[];
  timestamp: Date;
  isStreaming?: boolean;
}

export interface SourceRef {
  documentId: string;
  chunkIndex: number;
  contentPreview: string;
  content?: string; // 完整内容
  documentName?: string; // 文档名称
}

export interface Session {
  id: string;
  title: string;
  createdAt: Date;
  messages: Message[];
  isPinned?: boolean;
}

export interface Document {
  id: string;
  knowledgeBaseId?: string;
  filename: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  chunkCount: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  createdAt: string;
  contentPreview?: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  chunkMode: 'general' | 'parent_child';
  chunkSize: number;
  chunkOverlap: number;
  separator: string;
  parentChunkSize: number;
  parentSeparator: string;
  parentMode: 'paragraph' | 'full';
  childChunkSize: number;
  childSeparator: string;
  rerankEnabled?: boolean;
  indexMode?: 'high_quality' | 'economic';
  retrievalTopK?: number;
  scoreThresholdEnabled?: boolean;
  scoreThreshold?: number;
  cleanWhitespace?: boolean;
  cleanUrlEmail?: boolean;
  documentCount: number;
  status: 'empty' | 'indexing' | 'ready';
  createdAt: string;
  documents: KbDocument[];
}

export interface KbDocument {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  chunkCount: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  isEnabled: boolean;
  createdAt: string;
}

export interface ApiConfig {
  id: string;
  name: string;
  apiBase: string;
  apiKey: string;  // 脱敏后的
  apiKeyFull?: string;  // 编辑时用
  model: string;
  embeddingModel?: string;
  embeddingApiBase?: string;
  embeddingApiKey?: string;
  embeddingApiKeyFull?: string;
  rerankModel?: string;
  rerankApiBase?: string;
  rerankApiKey?: string;
  rerankApiKeyFull?: string;
  maxTokens: number;
  temperature: number;
  topP?: number;
  topK?: number;
  temperatureEnabled?: boolean;
  topPEnabled?: boolean;
  maxTokensEnabled?: boolean;
  thinkingEnabled?: boolean;
  thinking?: boolean;
  isActive: boolean;
  createdAt: string;
}

export type Theme = 'light' | 'dark';

// 预设配置
export interface PresetConfig {
  name: string;
  provider: string;  // 服务商标识
  apiBase: string;
  model: string;
  apiKeyPlaceholder: string;
  description: string;
}

export const PRESET_CONFIGS: PresetConfig[] = [
  { name: 'DeepSeek', provider: 'deepseek', apiBase: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKeyPlaceholder: 'sk-xxx...', description: 'DeepSeek 深度求索' },
  { name: 'OpenAI', provider: 'openai', apiBase: 'https://api.openai.com/v1', model: 'gpt-4o', apiKeyPlaceholder: 'sk-xxx...', description: 'OpenAI GPT 系列' },
  { name: '通义千问', provider: 'qwen', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', apiKeyPlaceholder: 'sk-xxx...', description: '阿里云通义千问' },
  { name: 'Moonshot', provider: 'moonshot', apiBase: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', apiKeyPlaceholder: 'sk-xxx...', description: '月之暗面 Kimi' },
  { name: '智谱 AI', provider: 'zhipu', apiBase: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4', apiKeyPlaceholder: 'xxx.xxx', description: '智谱清言 GLM 系列' },
  { name: '硅基流动', provider: 'siliconflow', apiBase: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', apiKeyPlaceholder: 'sk-xxx...', description: '硅基流动 SiliconFlow' },
  { name: '火山引擎', provider: 'volcengine', apiBase: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-1.5-pro-32k', apiKeyPlaceholder: 'xxx', description: '火山引擎豆包 Doubao' },
  { name: '本地 Ollama', provider: 'ollama', apiBase: 'http://localhost:11434/v1', model: 'llama3', apiKeyPlaceholder: 'ollama', description: '本地部署 Ollama' },
];
