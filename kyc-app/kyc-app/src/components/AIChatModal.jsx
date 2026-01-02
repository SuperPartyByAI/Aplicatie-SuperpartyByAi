import { useState, useRef, useEffect } from 'react';
import { callChatWithAI } from '../firebase';
import './AIChatModal.css';

export default function AIChatModal({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalHeight, setModalHeight] = useState('100vh');
  const messagesEndRef = useRef(null);
  const modalRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // VisualViewport API for keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleViewportResize = () => {
      if (window.visualViewport) {
        const viewport = window.visualViewport;
        // Modal height = viewport height (keyboard aware)
        // This makes the modal bottom align with keyboard top
        setModalHeight(`${viewport.height}px`);
      } else {
        // Fallback: use dvh if available, otherwise vh
        setModalHeight('100dvh');
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
      handleViewportResize();
    } else {
      handleViewportResize();
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportResize);
      }
      setModalHeight('100vh');
    };
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const result = await callChatWithAI({ messages: [...messages, userMessage] });
      const aiMessage = result.data?.message || 'No response';
      setMessages(prev => [...prev, { role: 'assistant', content: aiMessage }]);
    } catch (error) {
      console.error('AI Error:', error);
      const errorMsg = error.message || error.code || 'Eroare necunoscută';
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Scuze, am întâmpinat o eroare: ${errorMsg}` 
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={modalRef}
      className="new-theme ai-chat-modal" 
      onClick={onClose}
      style={{
        height: modalHeight
      }}
    >
      <div 
        className="ai-chat-container" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ai-chat-header">
          <h1>🤖 Chat AI</h1>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {/* Messages */}
        <div className="ai-chat-messages">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`message ${msg.role}`}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div className="message assistant loading">
              ⏳ Scriu...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="ai-chat-input">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Scrie un mesaj..."
            disabled={loading}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="send-button"
          >
            {loading ? '⏳' : '📤'}
          </button>
        </div>
      </div>
    </div>
  );
}
