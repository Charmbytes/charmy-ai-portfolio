import type { Experience, Project } from "../types";

export const PROFILE = {
  name: "Charmy Dhawan",
  title: "AI & Automation Engineer · IT Engineering Student",
  location: "Andheri (W), Mumbai, India",
  email: "charmydhawan@gmail.com",
  github: "https://github.com/Charmbytes",
  linkedin: "https://www.linkedin.com/in/charmy-dhawan-a3969626b",
  tagline:
    "I build agentic AI systems, backend services, and automation tools — the kind of projects that force me to learn something new along the way.",
};

export const PROJECTS: Project[] = [
  {
    name: "LLM Task Automation Agent",
    repo: "llm-agent",
    tags: ["LangChain", "LangGraph", "Python"],
    description:
      "Agentic task automation built from scratch on LangChain 1.x + LangGraph: a graph-based agent loop orchestrating nine tools, including sandboxed file I/O, to plan and execute multi-step tasks safely.",
  },
  {
    name: "AI Job Hunter",
    repo: "ai-jobhunter",
    tags: ["Python", "Flask", "rapidfuzz"],
    description:
      "Local AI-powered job & internship hunter: aggregates listings from pluggable sources, ranks them by fit with fuzzy skills-alignment matching, and tracks applications through a rich CLI and web dashboard.",
  },
  {
    name: "Robotic Arm Motion Simulator",
    repo: "robotic-arm-simulator",
    tags: ["Python", "Three.js", "Kinematics"],
    description:
      "Python kinematics engine — 2D CCD and 3D DH-parameter/Jacobian inverse kinematics — paired with an interactive Three.js frontend for visualizing arm motion in real time.",
  },
  {
    name: "Biker NFC Tag",
    repo: "biker-nfc-tag",
    tags: ["NFC", "QR", "HTML"],
    description:
      "Emergency medical ID for riders: scanning a QR or NFC tag on a helmet instantly surfaces blood group, allergies, and medical history to first responders.",
  },
  {
    name: "FactSure",
    repo: "mumbai_hacks",
    tags: ["AI Agents", "Chrome Extension", "Hackathon"],
    description:
      "AI-powered misinformation detection platform from Mumbai Hacks — contributed claim, URL, and image verification agents plus the Chrome extension.",
  },
  {
    name: "AI Portfolio (this site)",
    repo: "charmy-ai-portfolio",
    tags: ["React", "TypeScript", "FastAPI", "Groq"],
    description:
      "You're looking at me right now. An AI-powered portfolio with a Groq-backed conversational assistant, keyword-scored knowledge base retrieval, WebGL fluid simulation, and a section-switching SPA.",
  },
];

export const EXPERIENCE: Experience[] = [
  {
    role: "AI and Automation Engineer",
    company: "Larsen & Toubro",
    period: "Jun 2026 — Aug 2026",
    description:
      "Building AI and automation solutions, including an internal HR feedback platform on PostgreSQL, Redis, Azure Blob Storage, Keycloak, SuccessFactors, and Docker Compose. Designed a bulk employee report download feature end to end.",
  },
  {
    role: "Robotics Engineer",
    company: "3diotec",
    period: "Jan 2026 — May 2026",
    description:
      "Robotics engineering projects involving 3D printing and SolidWorks-based design and prototyping.",
  },
  {
    role: "Marketing Team Lead & Customer Relations Intern",
    company: "Viral Fission",
    period: "Jul 2020 — Jul 2022",
    description:
      "Executed digital marketing strategies for customer acquisition and retention while managing client communication and internal coordination.",
  },
];

export const SKILLS: Record<string, string[]> = {
  Languages: ["Python", "Java", "TypeScript", "SQL"],
  "AI / ML & Agents": [
    "LangChain",
    "LangGraph",
    "scikit-learn",
    "NumPy",
    "Pandas",
    "TensorFlow*",
    "PyTorch*",
    "Hugging Face*",
    "OpenCV*",
  ],
  Backend: ["FastAPI", "Flask", "REST APIs"],
  "Data & Infra": [
    "PostgreSQL",
    "MySQL",
    "Redis",
    "Azure Blob Storage",
    "Keycloak",
    "Docker",
    "Git / GitHub",
  ],
};

export const EDUCATION = {
  degree: "B.E. Information Technology",
  school: "Thadomal Shahani Engineering College, Mumbai",
  period: "2023 — 2027",
  note: "Preparing M.Tech applications focused on AI/ML and databases/backend systems.",
};

/**
 * Client-side fallback: keyword-matched canned answers so the chat still
 * responds when the backend is unreachable (e.g. static-only deploy).
 */
const LOCAL_ANSWERS: { keywords: string[]; answer: string }[] = [
  {
    keywords: ["project", "built", "build", "portfolio", "work on", "repos", "github"],
    answer:
      "Charmy's headline projects: the LLM Task Automation Agent (LangChain + LangGraph, nine tools), AI Job Hunter (skill-fit job aggregation), a Robotic Arm Motion Simulator (Python kinematics + Three.js), Biker NFC Tag (emergency medical ID), FactSure (AI misinformation detection, Mumbai Hacks), and this AI Portfolio — you're talking to it right now! Scroll down for details on each.",
  },
  {
    keywords: ["skill", "stack", "tech", "language", "python", "framework"],
    answer:
      "Charmy works primarily in Python, with Java, TypeScript, and SQL alongside. Core AI/ML tools: LangChain, LangGraph, scikit-learn, NumPy, Pandas. Backend: FastAPI and Flask. Data & infra: PostgreSQL, MySQL, Redis, Azure Blob Storage, Keycloak, and Docker.",
  },
  {
    keywords: ["experience", "job", "intern", "work", "company", "larsen", "toubro", "3diotec"],
    answer:
      "Charmy is currently an AI and Automation Engineer intern at Larsen & Toubro (Jun 2026–present), previously a Robotics Engineer at 3diotec (Jan–May 2026), and earlier a Marketing Team Lead & Customer Relations Intern at Viral Fission.",
  },
  {
    keywords: ["education", "college", "degree", "study", "mtech", "m.tech", "student"],
    answer:
      "Charmy is pursuing a B.E. in Information Technology at Thadomal Shahani Engineering College, Mumbai (2023–2027), and is preparing M.Tech applications focused on AI/ML and databases/backend systems.",
  },
  {
    keywords: ["contact", "email", "reach", "hire", "linkedin", "connect", "collaborate"],
    answer:
      "You can reach Charmy at charmydhawan@gmail.com, on LinkedIn (linkedin.com/in/charmy-dhawan-a3969626b), or on GitHub (github.com/Charmbytes).",
  },
  {
    keywords: ["who", "about", "background", "yourself", "charmy", "hi", "hello", "hey"],
    answer:
      "Charmy Dhawan is an IT engineering student in Mumbai and an AI & Automation Engineer intern at Larsen & Toubro, building agentic AI systems and backend services. Ask me about projects, skills, experience, education, or contact details!",
  },
];

export function localAnswer(message: string): string {
  const q = message.toLowerCase();
  let best: { score: number; answer: string } = { score: 0, answer: "" };
  for (const entry of LOCAL_ANSWERS) {
    const score = entry.keywords.filter((kw) => q.includes(kw)).length;
    if (score > best.score) best = { score, answer: entry.answer };
  }
  return (
    best.answer ||
    "I don't have that detail locally — try asking about Charmy's projects, skills, experience, education, or contact info."
  );
}
