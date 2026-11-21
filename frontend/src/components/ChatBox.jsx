import { useEffect, useRef, useState } from 'react';
import client from '../api/client.js';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Real-time pickup-coordination chat, scoped to one listing.
 * Only the donor and the claiming NGO can join (enforced server-side too —
 * the socket handler re-checks before letting anyone into the room).
 */
export default function ChatBox({ listingId }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await client.get(`/chat/${listingId}`);
        if (!cancelled) setMessages(data.messages);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [listingId]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('chat:join', listingId);

    function onMessage(msg) {
      if (String(msg.listing) === String(listingId)) setMessages((prev) => [...prev, msg]);
    }
    socket.on('chat:message', onMessage);
    return () => socket.off('chat:message', onMessage);
  }, [socket, listingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send(e) {
    e.preventDefault();
    if (!text.trim() || !socket) return;
    socket.emit('chat:message', { listingId, text: text.trim() });
    setText('');
  }

  return (
    <div className="bg-white border border-line rounded-2xl overflow-hidden flex flex-col h-80">
      <div className="px-4 py-3 border-b border-line">
        <p className="text-sm font-semibold">Pickup coordination</p>
        <p className="text-xs text-ink/40">Only visible to the donor and claiming NGO.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && <p className="text-xs text-ink/40">Loading conversation…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-xs text-ink/40">No messages yet — coordinate pickup time and details here.</p>
        )}
        {messages.map((m) => {
          const mine = String(m.sender?._id || m.sender) === String(user._id);
          return (
            <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                mine ? 'bg-rescue text-white rounded-br-sm' : 'bg-ink/[0.05] text-ink rounded-bl-sm'
              }`}>
                {!mine && <p className="text-[10px] opacity-60 mb-0.5">{m.sender?.orgName}</p>}
                <p>{m.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex gap-2 p-3 border-t border-line">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="focus-ring flex-1 px-3 py-2 rounded-xl border border-line bg-white text-sm"
        />
        <button type="submit" className="focus-ring px-4 py-2 rounded-xl bg-rescue text-white text-sm font-semibold hover:bg-rescue-dark">
          Send
        </button>
      </form>
    </div>
  );
}
