import { useEffect, useRef, useState } from "react";
import { streamChat } from "../api";
import type { ChatTurn } from "../types";

const SUGGESTIONS = [
  "What has Charmy built?",
  "What's the tech stack?",
  "Tell me about the LLM agent",
  "How do I contact Charmy?",
];

const WELCOME: ChatTurn = {
  role: "assistant",
  content:
    "Hi! I'm Charmy's AI assistant, grounded in Charmy's actual resume. Ask me about projects, skills, experience, education, or how to get in touch.",
};

export default function Chat() {
  const [turns, setTurns] = useState<ChatTurn[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  // Cancel any in-flight stream if the component unmounts mid-response.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function ask(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = turns.slice(1); // drop the canned welcome
    setTurns((t) => [...t, { role: "user", content: message }]);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Placeholder assistant turn we'll append tokens into as they arrive.
    let assistantIndex = -1;
    setTurns((t) => {
      assistantIndex = t.length;
      return [...t, { role: "assistant", content: "" }];
    });

    await streamChat(
      message,
      history,
      {
        onDelta: (delta) => {
          setStreaming(true);
          setTurns((t) => {
            const next = [...t];
            next[assistantIndex] = {
              ...next[assistantIndex],
              content: next[assistantIndex].content + delta,
            };
            return next;
          });
        },
        onDone: () => setStreaming(false),
      },
      controller.signal,
    );

    setStreaming(false);
    setBusy(false);
  }

  return (
    <div className="chat" aria-label="AI assistant chat">
      <div className="chat-titlebar">
        <span className="chat-dot" />
        <span className="chat-dot" />
        <span className="chat-dot" />
        <span className="chat-title">charmy-assistant — grounded on resume.json</span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {turns.map((t, i) => (
          <div key={i} className={`msg msg-${t.role}`}>
            <span className="msg-tag">{t.role === "user" ? "you" : "ai"}</span>
            <p>
              {t.content}
              {busy && streaming && i === turns.length - 1 && t.role === "assistant" && (
                <span className="cursor-blink">▍</span>
              )}
            </p>
          </div>
        ))}
        {busy && !streaming && (
          <div className="msg msg-assistant">
            <span className="msg-tag">ai</span>
            <p className="typing">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}
      </div>

      <div className="chat-suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <div className="chat-inputrow">
        <span className="prompt-chevron">›</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="Ask about Charmy's projects, skills, experience…"
          aria-label="Ask the assistant a question"
          disabled={busy}
        />
        <button className="send" onClick={() => ask(input)} disabled={busy || !input.trim()}>
          Ask
        </button>
      </div>
    </div>
  );
}
