import { Button } from 'tdesign-react';
import { MenuFoldIcon, MenuUnfoldIcon } from 'tdesign-icons-react';
import { Bot, Database } from 'lucide-react';
import { Session, ApiConfig, KnowledgeBase } from '../types';

interface HeaderProps {
  sidebarOpen: boolean;
  currentSession?: Session;
  apiConfigured: boolean;
  activeConfig?: ApiConfig | null;
  selectedKnowledgeBaseIds: string[];
  knowledgeBases: KnowledgeBase[];
  onToggleSidebar: () => void;
}

export function Header({ sidebarOpen, currentSession, apiConfigured, activeConfig, selectedKnowledgeBaseIds, knowledgeBases, onToggleSidebar }: HeaderProps) {
  const selectedKbNames = knowledgeBases
    .filter(kb => selectedKnowledgeBaseIds.includes(kb.id))
    .map(kb => kb.name);

  return (
    <header className="h-14 flex items-center px-4 flex-shrink-0 gap-3" style={{ backgroundColor: 'var(--td-bg-color-container)', borderBottom: '1px solid var(--td-component-border)' }}>
      <Button variant="text" shape="square" icon={sidebarOpen ? <MenuFoldIcon /> : <MenuUnfoldIcon />} onClick={onToggleSidebar} />

      {currentSession && (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: 'var(--td-brand-color)' }}>
            <Bot size={14} color="white" />
          </div>
          <span className="text-sm font-medium truncate" style={{ color: 'var(--td-text-color-primary)' }}>{currentSession.title}</span>
        </div>
      )}

      {!currentSession && (
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>AskDocs-Lite</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {apiConfigured && activeConfig && (
          <span className="text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5" style={{ backgroundColor: '#e8f5e9', color: '#2ba471' }}>
            <Bot size={12} />
            {activeConfig.name}
          </span>
        )}

        {selectedKbNames.length > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5" style={{ backgroundColor: 'var(--td-brand-color-light)', color: 'var(--td-brand-color)' }}>
            <Database size={12} />
            {selectedKbNames.join('、')}
          </span>
        )}
      </div>
    </header>
  );
}
