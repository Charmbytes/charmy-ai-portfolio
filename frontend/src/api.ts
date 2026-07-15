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
