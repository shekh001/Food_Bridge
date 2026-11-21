import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const client = axios.create({ baseURL: API_BASE_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('fb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Two common "it's glitching" reports this heads off:
//  1. Expired/invalid session -> silent failures on every action -> auto-logout
//     and send them to login instead of a confusing wall of 401 errors.
//  2. Backend unreachable (asleep free-tier instance, network drop) -> axios's
//     raw error message is unreadable -> normalize to one clear message so
//     every screen's catch block can just show err.response?.data?.message.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    // A suspended account's existing token is still cryptographically valid,
    // so this can surface on ANY authenticated call, not just login — force
    // a full logout with the reason visible, instead of leaving them stuck
    // watching random actions silently fail with no explanation.
    if (err.response?.status === 403 && err.response?.data?.suspended && window.location.pathname !== '/login') {
      localStorage.removeItem('fb_token');
      const msg = encodeURIComponent(err.response.data.message || 'Your account has been suspended.');
      window.location.href = `/login?suspended=1&msg=${msg}`;
      return new Promise(() => {});
    }
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('fb_token');
      window.location.href = '/login?expired=1';
      return new Promise(() => {}); // stop the redirect chain from also throwing
    }
    if (!err.response) {
      err.response = { data: { message: 'Cannot reach the server — check your connection and try again.' } };
    }
    return Promise.reject(err);
  }
);

export default client;
export { API_BASE_URL };
