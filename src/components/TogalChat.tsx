'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { useStore } from '@/lib/store';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface TogalChatProps {
  onClose: () => void;
}

interface ChatContext {
  classificationCount: number;
  totalArea: number;
  unit: string;
  classifications: string[];
}


function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TogalChat({ onClose }: TogalChatProps) {
  const classifications = useStore((s) => s.classifications);
  const polygons = useStore((s) => s.polygons);
  const scale = useStore((s) => s.scale);
  const ppu = scale?.pixelsPerUnit ?? 1;
  const unit = scale?.unit ?? 'ft';

  const classificationCount = classifications.length;
  const totalAreaSqFt = polygons.reduce((sum, p) => sum + p.area, 0) / (ppu * ppu);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hi! I'm MeasureX AI. Ask me anything about your takeoff — classifications, areas, or measurements.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function sendMessage() {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const context: ChatContext = {
        classificationCount,
        totalArea: totalAreaSqFt,
        unit,
        classifications: classifications.map((c) => c.name).slice(0, 10),
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Chat request failed');
      }

      const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
      if (!reply) {
        throw new Error('No assistant reply returned');
      }

      const aiMsg: Message = {
        id: generateId(),
        role: 'assistant',
        text: reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setError('Sorry, I could not connect to the AI right now.');
    } finally {
      setIsLoading(false);
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
      aria-label="MeasureX Chat panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 360,
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
          MeasureX Chat
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

      {classificationCount > 0 && (
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
          <span style={{ color: '#00d4ff', fontWeight: 600 }}>{classificationCount}</span> classifications
          &nbsp;·&nbsp;
          <span style={{ color: '#00d4ff', fontWeight: 600 }}>{totalAreaSqFt.toFixed(1)}</span> sq {unit} total
        </div>
      )}

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
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: 13,
                lineHeight: 1.5,
                wordBreak: 'break-word',
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
            </div>
            <span
              style={{
                fontSize: 10,
                color: '#4a5568',
                marginTop: 3,
                paddingLeft: 4,
                paddingRight: 4,
              }}
            >
              {msg.role === 'assistant' ? 'MX · ' : ''}{formatTime(msg.timestamp)}
            </span>
          </div>
        ))}

        {isLoading && (
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
          placeholder="Ask about your takeoff…"
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
          onClick={() => {
            void sendMessage();
          }}
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

export default TogalChat;
