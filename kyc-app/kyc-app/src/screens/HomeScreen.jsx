import { useState, useRef, useEffect } from 'react';
import { callChatWithAI } from '../firebase';

function HomeScreen() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Bună! Sunt asistentul tău AI. Cu ce te pot ajuta?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await callChatWithAI([...messages, userMessage]);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('AI Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Scuze, am întâmpinat o eroare. Te rog încearcă din nou.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-theme" style={{
      height: '100dvh',
      minHeight: '-webkit-fill-available',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-secondary)',
      paddingBottom: 'calc(88px + env(safe-area-inset-bottom))',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-xl)',
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)',
        textAlign: 'center',
        paddingTop: 'calc(var(--space-xl) + env(safe-area-inset-top))',
      }}>
        <h1 style={{ 
          fontSize: 'var(--font-size-xl)', 
          fontWeight: 'var(--font-weight-bold)', 
          color: 'var(--text-primary)', 
          margin: 0,
          fontFamily: 'var(--font-family)',
        }}>
          🤖 Chat AI
        </h1>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--space-xl)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-md)',
      }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '75%',
              padding: 'var(--space-lg)',
              borderRadius: 'var(--radius-xl)',
              background: msg.role === 'user' 
                ? 'var(--gradient-primary)'
                : 'var(--bg-primary)',
              color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
              boxShadow: 'var(--shadow-md)',
              fontSize: 'var(--font-size-base)',
              lineHeight: '1.5',
              fontFamily: 'var(--font-family)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            padding: 'var(--space-lg)',
            borderRadius: 'var(--radius-xl)',
            background: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-family)',
          }}>
            ⏳ Scriu...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input - Large input, small send button */}
      <div style={{
        padding: 'var(--space-lg)',
        background: 'var(--bg-primary)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        gap: 'var(--space-md)',
        alignItems: 'flex-end',
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Scrie un mesaj..."
          disabled={loading}
          style={{
            flex: 1,
            padding: 'var(--space-lg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            fontSize: 'var(--font-size-base)',
            outline: 'none',
            fontFamily: 'var(--font-family)',
            minHeight: '52px',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            width: '52px',
            height: '52px',
            padding: 0,
            background: loading || !input.trim() 
              ? 'var(--text-tertiary)' 
              : 'var(--gradient-primary)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            fontSize: '1.5rem',
            fontWeight: '600',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-md)',
            flexShrink: 0,
          }}
        >
          {loading ? '⏳' : '📤'}
        </button>
      </div>
    </div>
  );
}

export default HomeScreen;
