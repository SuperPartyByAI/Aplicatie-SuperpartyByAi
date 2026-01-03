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
  const messagesContainerRef = useRef(null);
  const lastViewportHeight = useRef(null);

  // NO AUTO-SCROLL - Let user control scroll manually
  // This prevents ALL viewport jumps

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;

    // Prevent body scroll
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

  // Auto-focus input when modal opens - iOS/Android compatible
  useEffect(() => {
    if (!isOpen) return;

    // Use requestAnimationFrame for better timing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (inputRef.current) {
          // iOS requires user interaction, but we can try
          inputRef.current.focus();
          
          // Trigger click for iOS Safari
          const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          inputRef.current.dispatchEvent(clickEvent);
          
          console.log('AI Chat: Input focused', {
            activeElement: document.activeElement === inputRef.current,
            timestamp: new Date().toISOString()
          });
        }
      });
    });
  }, [isOpen]);

  // VisualViewport API for keyboard handling - with threshold to prevent jitter
  useEffect(() => {
    if (!isOpen) return;

    const handleViewportResize = () => {
      const wasInputFocused = document.activeElement === inputRef.current;
      
      if (window.visualViewport) {
        const viewport = window.visualViewport;
        const height = viewport.height;
        
        // CRITICAL: Don't update height when input is focused
        // This prevents viewport jump during typing
        if (wasInputFocused) {
          console.log('⏭️ Skip viewport update - input focused (prevents jump)');
          return;
        }
        
        // Threshold: ignore small changes (<100px) to prevent jitter
        const THRESHOLD = 100;
        if (lastViewportHeight.current !== null) {
          const diff = Math.abs(height - lastViewportHeight.current);
          if (diff < THRESHOLD) {
            console.log('⏭️ Skip viewport update - jitter <100px');
            return;
          }
        }
        
        lastViewportHeight.current = height;
        
        // Modal height = viewport height (keyboard pushes viewport up)
        setModalHeight(`${height}px`);
        
        console.log('📐 Viewport resize:', {
          height,
          timestamp: new Date().toISOString()
        });
      } else {
        // Fallback for browsers without VisualViewport
        const fallbackHeight = window.innerHeight;
        setModalHeight(`${fallbackHeight}px`);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
      // Initial call
      handleViewportResize();
    } else {
      handleViewportResize();
      // Fallback: listen to window resize
      window.addEventListener('resize', handleViewportResize);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportResize);
      } else {
        window.removeEventListener('resize', handleViewportResize);
      }
      setModalHeight('100vh');
    };
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    console.log('📤 Send - before:', {
      inputFocused: document.activeElement === inputRef.current
    });

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
      
      // Keep focus - single strategy, no triple focus
      // Use nearBottom + keyboard state for decision
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus({ preventScroll: true });
          console.log('📤 Send - after focus:', {
            inputFocused: document.activeElement === inputRef.current
          });
        }
      });
    }
  };

  const handleInputClick = (e) => {
    e.stopPropagation();
    if (inputRef.current && !loading) {
      inputRef.current.focus();
      // iOS Safari sometimes needs this
      if (document.activeElement !== inputRef.current) {
        inputRef.current.click();
      }
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
        <div ref={messagesContainerRef} className="ai-chat-messages">
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
        <div 
          className="ai-chat-input"
          onClick={handleInputClick}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            onClick={handleInputClick}
            onTouchStart={handleInputClick}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleInputClick(e);
            }}
            placeholder="Scrie un mesaj..."
            disabled={loading}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
          />
          <button
            onMouseDown={(e) => {
              // Prevent input blur on button click
              e.preventDefault();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSend();
            }}
            onTouchStart={(e) => {
              // Prevent input blur on touch
              e.preventDefault();
            }}
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
