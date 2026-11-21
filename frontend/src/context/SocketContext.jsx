import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { API_BASE_URL } from '../api/client.js';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const wsUrl = API_BASE_URL.replace(/\/api\/?$/, '');
    const socket = io(wsUrl, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    function pushNotification(kind, payload) {
      setNotifications((prev) => [{ id: Date.now() + Math.random(), kind, payload, at: new Date() }, ...prev].slice(0, 20));
    }

    socket.on('listing:new_match', (payload) => pushNotification('new_match', payload));
    socket.on('feed:new_listing', (payload) => pushNotification('new_listing', payload));
    socket.on('listing:claimed', (payload) => pushNotification('claimed', payload));
    // Fired to every connected NGO the instant *anyone* claims a listing —
    // this is what lets a browsing NGO's list update itself immediately,
    // instead of only finding out a listing is gone when they tap "Claim"
    // and get a 409 back.
    socket.on('listing:removed', (payload) => pushNotification('removed', payload));
    socket.on('listing:status_update', (payload) => pushNotification('status_update', payload));
    socket.on('courier:assigned', (payload) => pushNotification('courier_assigned', payload));
    socket.on('courier:cancelled', (payload) => pushNotification('courier_cancelled', payload));
    socket.on('need:posted', (payload) => pushNotification('need_posted', payload));
    socket.on('need:fulfilled', (payload) => pushNotification('need_fulfilled', payload));

    return () => socket.disconnect();
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, notifications, setNotifications }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
