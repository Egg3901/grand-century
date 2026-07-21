/**
 * Minimal in-session chat (MP-M5).
 */

import { useState, type FormEvent } from 'react';
import { useStore } from '../store';

export function ChatHud() {
  const multiplayer = useStore((s) => s.multiplayer);
  const lines = useStore((s) => s.mpChat);
  const sendChat = useStore((s) => s.sendChat);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(true);

  if (!multiplayer) return null;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    sendChat(trimmed);
    setText('');
  };

  return (
    <aside className={`chat-hud atlas-panel${open ? '' : ' is-collapsed'}`} data-testid="chat-hud" aria-label="Session chat">
      <header className="chat-hud__head">
        <h2 className="atlas-heading">Chat</h2>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </header>
      {open ? (
        <>
          <ul className="chat-hud__lines" data-testid="chat-lines">
            {lines.length === 0 ? <li className="chat-hud__empty">No messages yet.</li> : null}
            {lines.map((line, i) => (
              <li key={`${line.at}-${i}`}>
                <strong>{line.name}</strong>
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
          <form className="chat-hud__form" onSubmit={onSubmit}>
            <input
              data-testid="chat-input"
              type="text"
              maxLength={240}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message allies…"
              aria-label="Chat message"
            />
            <button type="submit" className="btn btn--primary" data-testid="chat-send">Send</button>
          </form>
        </>
      ) : null}
    </aside>
  );
}
