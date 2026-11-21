import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import client from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('fb_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await client.get('/auth/me');
        setUser(data.user);
      } catch (err) {
        localStorage.removeItem('fb_token');
        setToken(null);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = useCallback(async (email, password) => {
    const { data } = await client.post('/auth/login', { email, password });
    localStorage.setItem('fb_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    // NGO signups carry a verification document, so they go through as
    // multipart/form-data; donor signups stay plain JSON. `location` gets
    // JSON-stringified for the multipart case since form fields are flat
    // strings (the backend parses it back out on that path).
    let body = payload;
    if (payload.verificationDocFile) {
      const form = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (key === 'verificationDocFile') return;
        if (value === undefined || value === null) return;
        form.append(key, key === 'location' ? JSON.stringify(value) : value);
      });
      form.append('verificationDoc', payload.verificationDocFile);
      body = form;
    }
    // Leave the Content-Type header unset for FormData bodies — the browser
    // fills in "multipart/form-data; boundary=..." automatically, and
    // setting it manually here would drop that boundary and break parsing.
    const { data } = await client.post('/auth/register', body);
    localStorage.setItem('fb_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data; // includes emailVerificationSent/devVerifyUrl for donor signups
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('fb_token');
    setToken(null);
    setUser(null);
  }, []);

  const forgotPassword = useCallback(async (email) => {
    const { data } = await client.post('/auth/forgot-password', { email });
    return data;
  }, []);

  const resetPassword = useCallback(async (token_, password) => {
    const { data } = await client.post(`/auth/reset-password/${token_}`, { password });
    localStorage.setItem('fb_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const verifyEmail = useCallback(async (token_) => {
    const { data } = await client.post(`/auth/verify-email/${token_}`);
    setUser(data.user);
    return data.user;
  }, []);

  const resendVerification = useCallback(async () => {
    const { data } = await client.post('/auth/resend-verification');
    return data;
  }, []);

  // Lets a screen (e.g. the NGO "pending verification" upload widget) push a
  // freshly-fetched user object into context after an action that changes
  // the user's own record but doesn't issue a new token (e.g. re-uploading
  // a verification document).
  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, logout, forgotPassword, resetPassword, verifyEmail, resendVerification, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
