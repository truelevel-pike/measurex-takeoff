'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, MessageSquare, Send, X } from 'lucide-react';
import { useStore } from '@/lib/store';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface QuantityEntry {
  name: string;
  type: 'area' | 'linear' | 'count';
  value: number;
  unit: string;
  count: number;
}

interface MXChatProps {
  onClose: () => void;
  /** When false, the panel is hidden via CSS but remains mounted so conversation history persists */
  visible?: boolean;
}

const SUGGESTED_QUESTIONS = [
  'What is the total area?',
  'Which room is largest?',
  'What would this cost at $5/SF?',
  'Summarize my takeoff',
  'What is my total project cost?',
];

const QUICK_REPLY_CHIPS = [
  'What pages have the most elements?',
  'Show me the cost estimate',
  'Which pages still need takeoff?',
  'How does this compare to industry averages?',
];

/** Parse markdown table lines into structured rows */
function parseMarkdownTable(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.split('\n');
  const tableLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      tableLines.push(trimmed);
    }
  }
  if (tableLines.length < 2) return null;

  const parseLine = (line: string) =>
    line.split('|').slice(1, -1).map((cell) => cell.trim());

  const headers = parseLine(tableLines[0]);
  // Skip separator row (row with dashes)
  const startIdx = tableLines[1].replace(/[|\s-:]/g, '') === '' ? 2 : 1;
  const rows = tableLines.slice(startIdx).map(parseLine);

  if (rows.length === 0) return null;
  return { headers, rows };
}

/** Render message text, converting markdown tables to React tables */
function renderMessageContent(text: string): React.ReactNode {
  const table = parseMarkdownTable(text);
  if (!table) return text;

  // Split into parts before/after the table
  const lines = text.split('\n');
  const beforeLines: string[] = [];
  const afterLines: string[] = [];
  let inTable = false;
  let pastTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isTableLine = trimmed.startsWith('|') && trimmed.endsWith('|');
    if (isTableLine && !pastTable) {
      inTable = true;
    } else if (inTable && !isTableLine) {
      inTable = false;
      pastTable = true;
      afterLines.push(line);
    } else if (!inTable && !pastTable) {
      beforeLines.push(line);
    } else {
      afterLines.push(line);
    }
  }

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
    margin: '8px 0',
  };
  const thStyle: React.CSSProperties = {
    padding: '6px 8px',
    borderBottom: '1px solid rgba(0,212,255,0.3)',
    textAlign: 'left',
    color: '#00d4ff',
    fontWeight: 600,
    fontSize: 11,
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '5px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    color: '#d0d8e4',
  };

  return (
    <>
      {beforeLines.join('\n').trim() && <>{beforeLines.join('\n').trim()}{'\n'}</>}
      <table style={tableStyle}>
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={tdStyle}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {afterLines.join('\n').trim() && <>{afterLines.join('\n').trim()}</>}
    </>
  );
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MXChat({ onClose, visible = true }: MXChatProps) {
  const projectId = useStore((s) => s.projectId);
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const currentPage = useStore((s) => s.currentPage);
  const totalPages = useStore((s) => s.totalPages);
  const ppu = scale?.pixelsPerUnit ?? 1;
  const unit = scale?.unit ?? 'ft';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showChips, setShowChips] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build per-classification quantities (all pages + current page breakdown)
  const buildContext = useCallback(() => {
    const quantities: QuantityEntry[] = classifications.map((c) => {
      const classPolygons = polygons.filter((p) => p.classificationId === c.id);
      if (c.type === 'count') {
        return { name: c.name, type: c.type, value: classPolygons.length, unit: 'count', count: classPolygons.length };
      }
      const totalRaw = classPolygons.reduce((sum, p) => {
        return sum + (c.type === 'linear' ? p.linearFeet : p.area);
      }, 0);
      const scaled = c.type === 'linear' ? totalRaw / ppu : totalRaw / (ppu * ppu);
      return { name: c.name, type: c.type, value: scaled, unit: c.type === 'linear' ? unit : `sq ${unit}`, count: classPolygons.length };
    });

    const totalArea = polygons.reduce((sum, p) => sum + p.area, 0) / (ppu * ppu);

    // Per-page breakdown so the AI can answer page-specific questions
    const pageBreakdown: Record<number, { classificationId: string; name: string; count: number }[]> = {};
    for (let pg = 1; pg <= totalPages; pg++) {
      const pagePolygons = polygons.filter((p) => p.pageNumber === pg);
      const perClass: Record<string, { classificationId: string; name: string; count: number }> = {};
      for (const poly of pagePolygons) {
        const cls = classifications.find((c) => c.id === poly.classificationId);
        if (!cls) continue;
        if (!perClass[cls.id]) perClass[cls.id] = { classificationId: cls.id, name: cls.name, count: 0 };
        perClass[cls.id].count += 1;
      }
      pageBreakdown[pg] = Object.values(perClass);
    }

    return {
      classificationCount: classifications.length,
      polygonCount: polygons.length,
      totalArea,
      unit,
      currentPage,
      totalPages,
      classifications: classifications.map((c) => c.name).slice(0, 20),
      quantities,
      pageBreakdown,
    };
  }, [classifications, polygons, ppu, unit, currentPage, totalPages]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || isLoading) return;

    const userMsg: Message = { id: generateId(), role: 'user', text: content, timestamp: new Date() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setError(null);
    setIsLoading(true);
    setShowSuggestions(false);
    setShowChips(false);

    // Create a placeholder for the assistant response
    const assistantId = generateId();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', text: '', timestamp: new Date() }]);

    try {
      const context = buildContext();
      const historyForApi = newMessages
        .map((m) => ({ role: m.role, content: m.text }));

      abortRef.current = new AbortController();

      const useProjectRoute = !!projectId;
      const url = useProjectRoute ? `/api/projects/${projectId}/chat` : '/api/chat';

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyForApi, ...(useProjectRoute ? {} : { context }) }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data?.error === 'string' ? data.error : 'Chat request failed');
      }

      if (useProjectRoute) {
        // Project route returns JSON { reply: string } — no streaming
        const data = await response.json();
        const replyText = data?.reply ?? '';
        if (!replyText.trim()) throw new Error('No response from AI');
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: replyText } : m)),
        );
      } else {
        // Stream response from /api/chat
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullText += parsed.content;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, text: fullText } : m)),
                );
              }
            } catch {
              // skip
            }
          }
        }

        // Flush any remaining buffer content
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              if (parsed.content) {
                fullText += parsed.content;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, text: fullText } : m)),
                );
              }
            } catch { /* skip */ }
          }
        }

        if (!fullText.trim()) {
          throw new Error('No response from AI');
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Sorry, I could not connect to the AI right now.');
      // Remove empty assistant placeholder on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.text.trim()));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div
      aria-label="MX Chat panel"
      aria-hidden={!visible}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 380,
        height: '100dvh',
        display: visible ? 'flex' : 'none',
        flexDirection: 'column',
        background: 'rgba(10,10,15,0.97)',
        borderLeft: '1px solid rgba(0,212,255,0.25)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.6)',
        zIndex: 200,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#e0e0e0',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '14px 16px',
          borderBottom: '1px solid rgba(0,212,255,0.2)',
          background: 'rgba(0,212,255,0.05)',
          flexShrink: 0,
        }}
      >
        <MessageSquare size={16} style={{ color: '#00d4ff' }} />
        <span
          style={{
            flex: 1,
            fontFamily: 'monospace',
            letterSpacing: '0.08em',
            fontWeight: 600,
            fontSize: 13,
            color: '#e0faff',
            textTransform: 'uppercase',
          }}
        >
          MX Chat
        </span>
        <button
          aria-label="Close chat"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 6,
            color: '#8892a0',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
            e.currentTarget.style.color = '#e0faff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)';
            e.currentTarget.style.color = '#8892a0';
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Context summary bar */}
      {classifications.length > 0 && (
        <div
          style={{
            padding: '6px 16px',
            fontSize: 11,
            color: '#8892a0',
            borderBottom: '1px solid rgba(0,212,255,0.1)',
            background: 'rgba(0,212,255,0.03)',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#00d4ff', fontWeight: 600 }}>{classifications.length}</span> classifications
          &nbsp;&middot;&nbsp;
          <span style={{ color: '#00d4ff', fontWeight: 600 }}>{polygons.length}</span> polygons
          &nbsp;&middot;&nbsp;
          <span style={{ color: '#00d4ff', fontWeight: 600 }}>
            {(polygons.reduce((s, p) => s + p.area, 0) / (ppu * ppu)).toFixed(0)}
          </span> sq {unit}
        </div>
      )}

      {/* Messages */}
      <div
        role="log"
        aria-live="polite"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.length === 0 && !isLoading && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '24px 16px',
            }}
          >
            <MessageSquare size={32} style={{ color: '#00d4ff', opacity: 0.8 }} />
            <span style={{ fontWeight: 600, fontSize: 15, color: '#e0faff' }}>
              Ask me about your takeoff.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>&ldquo;How many windows on page 3?&rdquo;</span>
              <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>&ldquo;Total linear footage of walls?&rdquo;</span>
              <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>&ldquo;Compare floors 1 and 2?&rdquo;</span>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                position: 'relative',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: 13,
                lineHeight: 1.55,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                ...(msg.role === 'user'
                  ? {
                      background: 'rgba(0,212,255,0.18)',
                      border: '1px solid rgba(0,212,255,0.35)',
                      color: '#e0faff',
                      boxShadow: '0 0 12px rgba(0,212,255,0.1) inset',
                    }
                  : {
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#d0d8e4',
                    }),
              }}
            >
              {msg.role === 'assistant' && msg.text ? renderMessageContent(msg.text) : msg.text}
              {msg.role === 'assistant' && isLoading && msg.text && msg.id !== 'welcome' && (
                <span style={{ color: '#00d4ff', opacity: 0.7, marginLeft: 2 }}>&#x258C;</span>
              )}
              {/* Copy button for assistant messages */}
              {msg.role === 'assistant' && msg.text && !isLoading && (
                <button
                  aria-label="Copy message"
                  onClick={() => {
                    void navigator.clipboard.writeText(msg.text);
                    setCopiedId(msg.id);
                    setTimeout(() => setCopiedId((prev) => (prev === msg.id ? null : prev)), 2000);
                  }}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    background: copiedId === msg.id ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: 4,
                    cursor: 'pointer',
                    color: copiedId === msg.id ? '#00d4ff' : '#6b7280',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (copiedId !== msg.id) {
                      e.currentTarget.style.color = '#e0faff';
                      e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (copiedId !== msg.id) {
                      e.currentTarget.style.color = '#6b7280';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    }
                  }}
                >
                  {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                </button>
              )}
            </div>
            <span style={{ fontSize: 10, color: '#4a5568', marginTop: 3, paddingLeft: 4, paddingRight: 4 }}>
              {msg.role === 'assistant' ? 'MX \u00b7 ' : ''}{formatTime(msg.timestamp)}
            </span>
          </div>
        ))}

        {/* Typing indicator — only when loading and last assistant message is empty */}
        {isLoading && messages[messages.length - 1]?.text === '' && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '16px 16px 16px 4px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                gap: 4,
                alignItems: 'center',
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#00d4ff',
                    opacity: 0.6,
                    display: 'inline-block',
                    animation: `mxChatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              fontSize: 12,
              color: '#ff9b9b',
              background: 'rgba(255, 59, 59, 0.08)',
              border: '1px solid rgba(255, 59, 59, 0.25)',
              borderRadius: 8,
              padding: '8px 10px',
            }}
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {showSuggestions && messages.length === 0 && (
        <div
          style={{
            padding: '0 12px 8px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            flexShrink: 0,
          }}
        >
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => void sendMessage(q)}
              style={{
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 20,
                padding: '5px 12px',
                fontSize: 11,
                color: '#a0d8e8',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
                e.currentTarget.style.color = '#e0faff';
                e.currentTarget.style.background = 'rgba(0,212,255,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)';
                e.currentTarget.style.color = '#a0d8e8';
                e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Quick-reply chips */}
      {showChips && messages.length > 0 && (
        <div
          style={{
            padding: '0 12px 6px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            flexShrink: 0,
          }}
        >
          {QUICK_REPLY_CHIPS.map((q) => (
            <button
              key={q}
              onClick={() => void sendMessage(q)}
              style={{
                background: 'rgba(0,212,255,0.08)',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 20,
                padding: '5px 12px',
                fontSize: 11,
                color: '#a0d8e8',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)';
                e.currentTarget.style.color = '#e0faff';
                e.currentTarget.style.background = 'rgba(0,212,255,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)';
                e.currentTarget.style.color = '#a0d8e8';
                e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div
        style={{
          padding: '12px 12px 16px',
          borderTop: '1px solid rgba(0,212,255,0.2)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          background: 'rgba(10,10,15,0.9)',
          flexShrink: 0,
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your takeoff\u2026"
          aria-label="Chat message input"
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 10,
            padding: '9px 14px',
            fontSize: 13,
            color: '#e0e0e0',
            outline: 'none',
            transition: 'border-color 150ms ease',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.5)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.2)')}
        />
        <button
          onClick={() => void sendMessage()}
          disabled={!input.trim() || isLoading}
          aria-label="Send message"
          style={{
            background: input.trim() && !isLoading ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${input.trim() && !isLoading ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 10,
            padding: '9px 12px',
            cursor: input.trim() && !isLoading ? 'pointer' : 'default',
            color: input.trim() && !isLoading ? '#00d4ff' : '#4a5568',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms ease',
            flexShrink: 0,
          }}
        >
          <Send size={15} />
        </button>
      </div>

      <style>{`
        @keyframes mxChatBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
