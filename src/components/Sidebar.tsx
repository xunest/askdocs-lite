import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Tooltip, Dialog, Input } from 'tdesign-react';
import { AddIcon } from 'tdesign-icons-react';
import { Bot, Database, Settings, Trash2, Pin, Pencil, MoreHorizontal } from 'lucide-react';
import { IconBtn } from './IconBtn';
import { APP_CONFIG } from '../config';
import { Session } from '../types';

interface SidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  sidebarOpen: boolean;
  apiConfigured: boolean;
  knowledgeBaseCount: number;
  configCount: number;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onTogglePinSession: (id: string) => void;
  onOpenKnowledgeBase: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ sessions, currentSessionId, sidebarOpen, apiConfigured, knowledgeBaseCount, configCount, onNewChat, onSelectSession, onDeleteSession, onRenameSession, onTogglePinSession, onOpenKnowledgeBase, onOpenSettings }: SidebarProps) {
  const [contextMenu, setContextMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ sessionId: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  }, []);

  const handleRename = useCallback(() => {
    if (renameDialog && renameValue.trim()) {
      onRenameSession(renameDialog.sessionId, renameValue.trim());
      setRenameDialog(null);
      setRenameValue('');
    }
  }, [renameDialog, renameValue, onRenameSession]);

  return (
    <aside className="flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden" style={{ width: sidebarOpen ? 260 : 0, backgroundColor: 'var(--td-bg-color-container)' }}>
      {/* Logo */}
      <div className="h-14 px-4 flex items-center flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #5b67e0 0%, #4f5bd5 100%)', boxShadow: '0 4px 12px rgba(79, 91, 213, 0.28)' }}>
            <span className="text-white text-sm font-bold">{APP_CONFIG.nameInitial}</span>
          </div>
          <span className="text-lg font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>{APP_CONFIG.name}</span>
        </div>
      </div>

      {/* 新对话 */}
      <div className="p-3">
        <Button icon={<AddIcon />} onClick={onNewChat} block variant="outline">新对话</Button>
      </div>

      {!apiConfigured && (
        <div className="px-3 pb-2">
          <div className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: '#fff1e9', color: '#ed7b2f' }}>
            请先配置 API
          </div>
        </div>
      )}

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map(session => {
          const isActive = session.id === currentSessionId;
          return (
            <div key={session.id}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors duration-200 group"
              style={{
                backgroundColor: isActive ? 'var(--td-brand-color-light)' : 'transparent',
                color: isActive ? 'var(--td-brand-color)' : 'var(--td-text-color-secondary)'
              }}
              onClick={() => onSelectSession(session.id)}
              onContextMenu={(e) => handleContextMenu(e, session.id)}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--td-bg-color-component-hover)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {session.isPinned && (
                <Pin size={12} className="flex-shrink-0" style={{ color: 'var(--td-brand-color)' }} />
              )}
              <div className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: 'var(--td-brand-color)' }}>
                <Bot size={12} color="white" />
              </div>
              <span className="flex-1 truncate text-sm">{session.title}</span>
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-black/10"
                onClick={e => { e.stopPropagation(); handleContextMenu(e, session.id); }}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* 上下文菜单 */}
      {contextMenu && (() => {
        const targetSession = sessions.find(s => s.id === contextMenu.sessionId);
        if (!targetSession) return null;
        return (
          <div
            ref={menuRef}
            className="fixed z-[9999] py-1.5 rounded-lg shadow-lg border"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              backgroundColor: 'var(--td-bg-color-popup)',
              borderColor: 'var(--td-component-border)',
              minWidth: 140,
            }}
          >
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-black/5"
              style={{ color: 'var(--td-text-color-primary)' }}
              onClick={() => { onTogglePinSession(contextMenu.sessionId); setContextMenu(null); }}
            >
              <Pin size={14} style={{ color: targetSession.isPinned ? 'var(--td-brand-color)' : 'var(--td-text-color-secondary)' }} />
              {targetSession.isPinned ? '取消置顶' : '置顶'}
            </button>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-black/5"
              style={{ color: 'var(--td-text-color-primary)' }}
              onClick={() => {
                setRenameDialog({ sessionId: contextMenu.sessionId, title: targetSession.title });
                setRenameValue(targetSession.title);
                setContextMenu(null);
              }}
            >
              <Pencil size={14} style={{ color: 'var(--td-text-color-secondary)' }} />
              重命名
            </button>
            <div className="my-1 border-t" style={{ borderColor: 'var(--td-component-border)' }} />
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-red-50"
              style={{ color: '#e34d59' }}
              onClick={() => { onDeleteSession(contextMenu.sessionId); setContextMenu(null); }}
            >
              <Trash2 size={14} />
              删除
            </button>
          </div>
        );
      })()}

      {/* 重命名对话框 */}
      <Dialog
        header="重命名会话"
        visible={!!renameDialog}
        onClose={() => { setRenameDialog(null); setRenameValue(''); }}
        onConfirm={handleRename}
        onCancel={() => { setRenameDialog(null); setRenameValue(''); }}
        confirmBtn="确定"
        cancelBtn="取消"
      >
        <Input
          value={renameValue}
          onChange={setRenameValue}
          placeholder="输入新的会话名称"
          autofocus
          onKeydown={(e: any) => { if (e.key === 'Enter') handleRename(); }}
        />
      </Dialog>

      {/* 底部按钮 */}
      <div className="p-3 border-t flex-shrink-0 space-y-1" style={{ borderColor: 'var(--td-component-border)' }}>
        <div className="flex items-center justify-between px-1">
          <Button icon={<Database size={18} strokeWidth={1.75} />} onClick={onOpenKnowledgeBase} variant="text">
            知识库
          </Button>
          {knowledgeBaseCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--td-brand-color-light)', color: 'var(--td-brand-color)' }}>
              {knowledgeBaseCount}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between px-1">
          <Button icon={<Settings size={18} strokeWidth={1.75} />} onClick={onOpenSettings} variant="text">
            模型设置
          </Button>
          {configCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#e8f5e9', color: '#2ba471' }}>
              {configCount}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
