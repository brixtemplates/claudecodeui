import { useState, useEffect, useRef } from 'react';

export function useWebSocket() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const preferCookieAuthRef = useRef(false);
  const attemptedCookieFallbackRef = useRef(false);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, []); // Keep dependency array but add proper cleanup

  const connect = async () => {
    try {
      const isPlatform = import.meta.env.VITE_IS_PLATFORM === 'true';

      // Construct WebSocket URL
      let wsUrl;
      let usedCookieAuth = false;

      if (isPlatform) {
        // Platform mode: Use same domain as the page (goes through proxy)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws`;
        usedCookieAuth = true;
      } else {
        // OSS mode: Connect to same host:port that served the page
        const token = localStorage.getItem('auth-token');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        if (token) {
          wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
          usedCookieAuth = false;
        } else {
          console.warn('No authentication token found for WebSocket connection; attempting cookie-based auth.');
          wsUrl = `${protocol}//${window.location.host}/ws`;
          usedCookieAuth = true;
        }
      }

      const websocket = new WebSocket(wsUrl);
      let opened = false;
      const connectTimeout = setTimeout(() => {
        if (!opened) {
          try {
            websocket.close();
          } catch (error) {
            console.warn('WebSocket close after timeout failed:', error);
          }
        }
      }, 4000);

      websocket.onopen = () => {
        opened = true;
        clearTimeout(connectTimeout);
        attemptedCookieFallbackRef.current = false;
        preferCookieAuthRef.current = usedCookieAuth;
        setIsConnected(true);
        setWs(websocket);
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages(prev => [...prev, data]);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        clearTimeout(connectTimeout);
        setIsConnected(false);
        setWs(null);

        // If token-based auth failed before opening, retry once with cookie auth.
        if (!opened && !usedCookieAuth && !attemptedCookieFallbackRef.current) {
          attemptedCookieFallbackRef.current = true;
          preferCookieAuthRef.current = true;
          connect();
          return;
        }

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  };

  const sendMessage = (message) => {
    if (ws && isConnected) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  };

  return {
    ws,
    sendMessage,
    messages,
    isConnected
  };
}
