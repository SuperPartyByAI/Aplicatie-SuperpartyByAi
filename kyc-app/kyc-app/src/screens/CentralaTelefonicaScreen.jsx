import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { io } from 'socket.io-client';
import { Device } from '@twilio/voice-sdk';

const BACKEND_URL = 'https://web-production-f0714.up.railway.app';

export default function CentralaTelefonicaScreen() {
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [activeCalls, setActiveCalls] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callStats, setCallStats] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [twilioDevice, setTwilioDevice] = useState(null);
  const [activeConnection, setActiveConnection] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [playingRecording, setPlayingRecording] = useState(null);
  const deviceRef = useRef(null);
  const audioRef = useRef(null);

  // Initialize Twilio Device
  useEffect(() => {
    initializeTwilioDevice();
    return () => {
      if (deviceRef.current) {
        deviceRef.current.destroy();
      }
    };
  }, []);

  const initializeTwilioDevice = async () => {
    try {
      // Get access token from backend
      // Use fixed identity 'operator' to match TwiML dial.client()
      const identity = 'operator';
      const response = await fetch(`${BACKEND_URL}/api/voice/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity })
      });

      const data = await response.json();
      if (!data.success) {
        console.error('Failed to get Twilio token:', data.error);
        return;
      }

      // Create Twilio Device
      const device = new Device(data.token, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu']
      });

      // Setup device event listeners
      device.on('registered', () => {
        console.log('✅ Twilio Device registered');
      });

      device.on('error', (error) => {
        console.error('❌ Twilio Device error:', error);
      });

      device.on('incoming', (connection) => {
        console.log('📞 Incoming Twilio call');
        setActiveConnection(connection);

        // Setup connection event listeners
        connection.on('accept', () => {
          console.log('✅ Call accepted');
          setIsConnecting(false);
        });

        connection.on('disconnect', () => {
          console.log('✕ Call disconnected');
          setActiveConnection(null);
          setIsConnecting(false);
        });

        connection.on('reject', () => {
          console.log('✕ Call rejected');
          setActiveConnection(null);
          setIsConnecting(false);
        });
      });

      // Register device
      await device.register();
      setTwilioDevice(device);
      deviceRef.current = device;

      console.log('✅ Twilio Device initialized');
    } catch (error) {
      console.error('❌ Error initializing Twilio Device:', error);
    }
  };

  // Initialize Socket.io connection
  useEffect(() => {
    const socketInstance = io(BACKEND_URL);
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('✅ Connected to Voice backend');
    });

    socketInstance.on('disconnect', () => {
      console.log('❌ Disconnected from Voice backend');
    });

    // Listen for incoming calls
    socketInstance.on('call:incoming', (callData) => {
      console.log('📞 Incoming call:', callData);
      setIncomingCall(callData);
      setActiveCalls(prev => [...prev, callData]);
    });

    // Listen for call status updates
    socketInstance.on('call:status', (callData) => {
      console.log('📊 Call status update:', callData);
      setActiveCalls(prev => 
        prev.map(call => call.callId === callData.callId ? callData : call)
      );
    });

    // Listen for call ended
    socketInstance.on('call:ended', (callData) => {
      console.log('✕ Call ended:', callData);
      setActiveCalls(prev => prev.filter(call => call.callId !== callData.callId));
      if (incomingCall?.callId === callData.callId) {
        setIncomingCall(null);
      }
      // Refresh recent calls immediately
      fetchRecentCalls();
      // Refresh again after 15 seconds to get recording info
      setTimeout(() => {
        fetchRecentCalls();
        fetchCallStats();
      }, 15000);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Fetch call statistics and setup auto-refresh
  useEffect(() => {
    fetchCallStats();
    fetchRecentCalls();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchRecentCalls();
      fetchCallStats();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchCallStats = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/voice/calls/stats`);
      const data = await response.json();
      if (data.success) {
        setCallStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching call stats:', error);
    }
  };

  const fetchRecentCalls = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/voice/calls/recent?limit=20`);
      const data = await response.json();
      if (data.success) {
        setRecentCalls(data.calls);
      }
    } catch (error) {
      console.error('Error fetching recent calls:', error);
    }
  };

  const answerCall = async (callId) => {
    if (!activeConnection) {
      console.error('No active connection to answer');
      return;
    }

    try {
      setIsConnecting(true);
      
      // Accept the Twilio connection (this enables audio)
      activeConnection.accept();

      // Notify backend via Socket.io
      if (socket) {
        socket.emit('call:answer', {
          callId,
          operatorId: auth.currentUser?.uid || 'unknown'
        });
      }

      setIncomingCall(null);
      console.log('✅ Call answered with audio');
    } catch (error) {
      console.error('❌ Error answering call:', error);
      setIsConnecting(false);
    }
  };

  const rejectCall = (callId) => {
    if (activeConnection) {
      activeConnection.reject();
    }

    if (socket) {
      socket.emit('call:reject', {
        callId,
        reason: 'rejected_by_operator'
      });
    }

    setIncomingCall(null);
    setActiveConnection(null);
  };

  const hangupCall = () => {
    if (activeConnection) {
      activeConnection.disconnect();
      setActiveConnection(null);
    }
  };

  const playRecording = async (callId, uniqueId) => {
    try {
      setPlayingRecording(uniqueId || callId);
      
      const response = await fetch(`${BACKEND_URL}/api/voice/calls/${callId}/recording`);
      const data = await response.json();
      
      if (!data.success) {
        console.error('Recording not available:', data.error);
        alert('Înregistrarea nu este disponibilă încă. Așteaptă câteva secunde după încheierea apelului.');
        setPlayingRecording(null);
        return;
      }
      
      console.log('Playing recording:', data.recordingUrl);

      // Create audio element with Basic Auth
      const audio = new Audio();
      audioRef.current = audio;
      
      // Twilio requires Basic Auth for recording URLs
      const authUrl = data.recordingUrl.replace('https://', `https://${data.auth.username}:${data.auth.password}@`);
      audio.src = authUrl;
      
      audio.onended = () => {
        setPlayingRecording(null);
      };
      
      audio.onerror = () => {
        alert('Eroare la redarea înregistrării');
        setPlayingRecording(null);
      };
      
      await audio.play();
    } catch (error) {
      console.error('Error playing recording:', error);
      alert('Eroare la redarea înregistrării');
      setPlayingRecording(null);
    }
  };

  const stopRecording = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingRecording(null);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '20px' }}>
      {/* Header */}
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px' }}>
          <button
            onClick={() => navigate('/home')}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 16px',
              color: 'white',
              fontSize: '20px',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            ←
          </button>
          <h1 style={{ color: 'white', fontSize: '32px', fontWeight: '800', margin: 0 }}>
            📞 Centrală Telefonică
          </h1>
        </div>

        {/* Active Call with Audio */}
        {activeConnection && !incomingCall && (
          <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: 'white',
            borderRadius: '15px',
            padding: '20px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
            zIndex: 9999,
            minWidth: '300px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                animation: 'pulse 2s ease-in-out infinite'
              }}>
                📞
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', fontSize: '16px', color: '#333' }}>
                  Apel în curs
                </div>
                <div style={{ fontSize: '14px', color: '#666', marginTop: '3px' }}>
                  {isConnecting ? 'Conectare...' : 'Conectat'}
                </div>
              </div>
            </div>
            <button
              onClick={hangupCall}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)',
                color: 'white',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(235, 51, 73, 0.3)'
              }}
            >
              🔴 Închide Apelul
            </button>
          </div>
        )}

        {/* Incoming Call Modal */}
        {incomingCall && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}>
            <div style={{
              background: 'white',
              borderRadius: '20px',
              padding: '40px',
              maxWidth: '400px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
            }}>
              <div style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                margin: '0 auto 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
                animation: 'pulse 2s ease-in-out infinite'
              }}>
                📞
              </div>
              <h2 style={{ fontSize: '24px', marginBottom: '10px', color: '#333' }}>
                Apel Incoming
              </h2>
              <p style={{ fontSize: '18px', color: '#666', marginBottom: '20px' }}>
                {incomingCall.from}
              </p>
              <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '30px' }}>
                <button
                  onClick={() => answerCall(incomingCall.callId)}
                  style={{
                    width: '70px',
                    height: '70px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                    color: 'white',
                    fontSize: '28px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  ✓
                </button>
                <button
                  onClick={() => rejectCall(incomingCall.callId)}
                  style={{
                    width: '70px',
                    height: '70px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)',
                    color: 'white',
                    fontSize: '28px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        {callStats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <div style={{ background: 'white', borderRadius: '15px', padding: '20px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Total Apeluri</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#667eea' }}>{callStats.total}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '15px', padding: '20px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Răspunse</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>{callStats.answered}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '15px', padding: '20px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Pierdute</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#ef4444' }}>{callStats.missed}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '15px', padding: '20px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>Durata Medie</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>{formatDuration(callStats.avgDuration)}</div>
            </div>
          </div>
        )}

        {/* Active Calls */}
        {activeCalls.length > 0 && (
          <div style={{ background: 'white', borderRadius: '15px', padding: '20px', marginBottom: '30px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', color: '#333' }}>
              📞 Apeluri Active ({activeCalls.length})
            </h3>
            {activeCalls.map(call => (
              <div key={call.callId} style={{
                padding: '15px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
              }}>
                <div style={{
                  width: '45px',
                  height: '45px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px'
                }}>
                  📞
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>{call.from}</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '3px' }}>{call.status}</div>
                </div>
                <div style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: '10px',
                  background: call.status === 'in-progress' ? '#e8f5e9' : '#fff3e0',
                  color: call.status === 'in-progress' ? '#388e3c' : '#f57c00',
                  fontWeight: '500'
                }}>
                  {call.status === 'in-progress' ? '📞 În curs' : '🔔 Sună'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Calls */}
        <div style={{ background: 'white', borderRadius: '15px', padding: '20px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '15px', color: '#333' }}>
            📋 Istoric Apeluri
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#666', fontWeight: '600' }}>Data</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#666', fontWeight: '600' }}>Număr</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#666', fontWeight: '600' }}>Durata</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#666', fontWeight: '600' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#666', fontWeight: '600' }}>Înregistrare</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map(call => (
                  <tr key={call.id || call.callId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#333' }}>{formatDate(call.createdAt)}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#333' }}>{call.from}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#333' }}>{formatDuration(call.duration)}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '10px',
                        background: call.status === 'completed' ? '#e8f5e9' : '#fee2e2',
                        color: call.status === 'completed' ? '#388e3c' : '#dc2626',
                        fontWeight: '500'
                      }}>
                        {call.status === 'completed' ? '✓ Finalizat' : '✕ ' + call.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {call.recordingSid ? (
                        playingRecording === (call.id || call.callId) ? (
                          <button
                            onClick={stopRecording}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              background: '#ef4444',
                              color: 'white',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontWeight: '500'
                            }}
                          >
                            ⏸ Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => playRecording(call.callId, call.id || call.callId)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              background: '#667eea',
                              color: 'white',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontWeight: '500'
                            }}
                          >
                            ▶ Ascultă
                          </button>
                        )
                      ) : (
                        <span style={{ fontSize: '12px', color: '#999' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
