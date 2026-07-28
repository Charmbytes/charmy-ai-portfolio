import type { ChatResponse, ChatTurn } from "./types";
import { localAnswer } from "./data/profile";

/**
 * Ask the backend assistant. If the API is unreachable (static deploy,
 * backend down), fall back to client-side keyword answers so the chat
 * always responds — mirroring the backend's own Groq→rule-based fallback.
 */
export async function sendChat(
  message: string,
  history: ChatTurn[],
): Promise<ChatResponse> {
  try {
    const base = import.meta.env.VITE_API_URL ?? "";
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as ChatResponse;
  } catch {
    return { reply: localAnswer(message), grounded_on: [], source: "local" };
  }
}

export interface StreamHandlers {
  onMeta?: (groundedOn: string[]) => void;
  onDelta: (text: string) => void;
  onDone?: (source: "groq" | "fallback") => void;
}

/**
 * Ask the backend assistant and stream the reply as it's generated, via
 * Server-Sent Events. Parses `event: <name>\ndata: <json>\n\n` frames by
 * hand (no EventSource here since that only supports GET, and we need to
 * POST the message + history).
 *
 * On any failure — network error, non-OK response, stream interrupted
 * before completion — falls back to the client-side keyword answer,
 * delivered as a single onDelta call, so the chat always finishes.
 */
export async function streamChat(
  message: string,
  history: ChatTurn[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let sawDone = false;
  try {
    const base = import.meta.env.VITE_API_URL ?? "";
    const res = await fetch(`${base}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!eventLine || !dataLine) continue;

        const eventName = eventLine.slice("event: ".length).trim();
        const data = JSON.parse(dataLine.slice("data: ".length));

        if (eventName === "meta") handlers.onMeta?.(data.grounded_on ?? []);
        else if (eventName === "delta") handlers.onDelta(data.text ?? "");
        else if (eventName === "done") {
          sawDone = true;
          handlers.onDone?.(data.source ?? "fallback");
        }
      }
    }

    if (!sawDone) throw new Error("stream ended without a done event");
  } catch (err) {
    if ((err as Error).name === "AbortError") return; // caller cancelled, not a failure
    handlers.onDelta(localAnswer(message));
    handlers.onDone?.("fallback");
  }
}
