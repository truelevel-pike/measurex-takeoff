'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
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
}

const SUGGESTED_QUESTIONS = [
  'What is the total area?',
  'Which room is largest?',
  'What would this cost at $5/SF?',
  'Summarize my takeoff',
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MXChat({ onClose }: MXChatProps) {
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const currentPage = useStore((s) => s.currentPage);
  const totalPages = useStore((s) => s.totalPages);
  const ppu = scale?.pixelsPerUnit ?? 1;
  const unit = scale?.unit ?? 'ft';

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hi! I'm MeasureX AI. Ask me anything about your takeoff — areas, costs, or classifications.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
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

    // Create a placeholder for the assistant response
    const assistantId = generateId();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', text: '', timestamp: new Date() }]);

    try {
      const context = buildContext();
      const historyForApi = newMessages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.text }));

      abortRef.current = new AbortController();

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyForApi, context }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data?.error === 'string' ? data.error : 'Chat request failed');
      }

      // Stream response
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
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 380,
        height: '100dvh',
        display: 'flex',
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
              {msg.text}
              {msg.role === 'assistant' && isLoading && msg.text && msg.id !== 'welcome' && (
                <span style={{ color: '#00d4ff', opacity: 0.7, marginLeft: 2 }}>&#x258C;</span>
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
      {showSuggestions && messages.length <= 1 && (
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
