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
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      paddingBottom: 'calc(70px + env(safe-area-inset-bottom))',
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem',
        background: 'rgba(255, 255, 255, 0.95)',
        borderBottom: '1px solid rgba(0,0,0,0.1)',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1f2937', margin: 0 }}>
          🤖 Chat AI
        </h1>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              padding: '0.75rem 1rem',
              borderRadius: '1rem',
              background: msg.role === 'user' 
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                : 'rgba(255, 255, 255, 0.95)',
              color: msg.role === 'user' ? 'white' : '#1f2937',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '0.75rem 1rem',
            borderRadius: '1rem',
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#6b7280',
          }}>
            ⏳ Scriu...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '1rem',
        background: 'rgba(255, 255, 255, 0.95)',
        borderTop: '1px solid rgba(0,0,0,0.1)',
        display: 'flex',
        gap: '0.5rem',
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
            padding: '0.75rem 1rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: '0.75rem 1.5rem',
            background: loading || !input.trim() 
              ? '#9ca3af' 
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '⏳' : '📤'}
        </button>
      </div>
    </div>
  );
}

export default HomeScreen;
