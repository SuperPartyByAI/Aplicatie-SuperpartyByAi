import { useState, useRef, useEffect } from 'react';
import { callChatWithAI, auth } from '../firebase';
import { useWheel } from '../contexts/WheelContext';
import './AIChatModal.css';

export default function AIChatModal({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const { setAdminMode, setGmMode, toggleView } = useWheel();

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.width = '';
    };
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userInput = input.trim().toLowerCase();
    const currentUser = auth.currentUser;
    const isAuthorized = currentUser?.email === 'ursache.andrei1995@gmail.com';

    // Check for secret commands (only for authorized user)
    if (isAuthorized) {
      if (userInput === 'admin') {
        setInput('');
        setMessages(prev => [
          ...prev,
          { role: 'user', content: input },
          { role: 'assistant', content: '🔓 Admin mode activat. Deschid meniul admin...' },
        ]);

        // Close keyboard
        if (inputRef.current) {
          inputRef.current.blur();
        }

        // Activate admin mode and open grid
        setTimeout(() => {
          setAdminMode(true);
          setGmMode(false);
          onClose(); // Close AI Chat
          toggleView('grid'); // Open grid with admin buttons
        }, 500);
        return;
      }

      if (userInput === 'gm') {
        setInput('');
        setMessages(prev => [
          ...prev,
          { role: 'user', content: input },
          { role: 'assistant', content: '🔓 GM mode activat. Deschid meniul GM...' },
        ]);

        // Close keyboard
        if (inputRef.current) {
          inputRef.current.blur();
        }

        // Activate GM mode and open grid
        setTimeout(() => {
          setGmMode(true);
          setAdminMode(false);
          onClose(); // Close AI Chat
          toggleView('grid'); // Open grid with GM buttons
        }, 500);
        return;
      }
    }

    // Normal AI chat flow
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Close keyboard after send
    if (inputRef.current) {
      inputRef.current.blur();
    }

    try {
      const result = await callChatWithAI({ messages: [...messages, userMessage] });
      const aiMessage = result.data?.message || 'No response';
      setMessages(prev => [...prev, { role: 'assistant', content: aiMessage }]);
    } catch (error) {
      console.error('AI Error:', error);
      const errorMsg = error.message || error.code || 'Eroare necunoscută';
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Scuze, am întâmpinat o eroare: ${errorMsg}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="new-theme ai-chat-modal" onClick={onClose}>
      <div className="ai-chat-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ai-chat-header">
          <h1>🤖 Chat AI</h1>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="ai-chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              {msg.content}
            </div>
          ))}
          {loading && <div className="message assistant loading">⏳ Scriu...</div>}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="ai-chat-input">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Scrie un mesaj..."
            disabled={loading}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="send-button">
            {loading ? '⏳' : '📤'}
          </button>
        </div>
      </div>
    </div>
  );
}
