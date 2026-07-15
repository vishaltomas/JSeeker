import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useChat } from "../hooks/useChat";

interface ChatPanelProps {
  open: boolean;
}

export function ChatPanel({ open }: ChatPanelProps) {
  const { bubbles, send } = useChat();
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles]);

  function submit(e: FormEvent): void {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    send(text);
    setInput("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <aside className={open ? "chat-panel" : "chat-panel hidden"}>
      <div className="chat-header">Assistant</div>
      <div className="chat-messages" ref={messagesRef}>
        {bubbles.map((b) => (
          <div key={b.id} className={`chat-msg ${b.kind}`}>
            {b.text}
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <textarea
          className="chat-input"
          rows={2}
          placeholder="Ask for help with this application…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="btn btn-primary">
          Send
        </button>
      </form>
    </aside>
  );
}
