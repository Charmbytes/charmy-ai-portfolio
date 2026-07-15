export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
  grounded_on: string[];
  source: "groq" | "fallback" | "local";
}

export interface Project {
  name: string;
  repo: string;
  tags: string[];
  description: string;
}

export interface Experience {
  role: string;
  company: string;
  period: string;
  description: string;
}
