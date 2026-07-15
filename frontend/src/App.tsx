import { useState, useRef, useCallback, useEffect, Fragment } from "react";
import FluidCursor from "./components/FluidCursor";
import { sendChat } from "./api";
import type { ChatTurn } from "./types";
import { PROFILE, PROJECTS, EXPERIENCE, SKILLS, EDUCATION } from "./data/profile";

type Section = "hero" | "me" | "projects" | "experience" | "skills" | "contact";
type Msg = { q: string; reply: string };

const NAV: { id: Exclude<Section, "hero">; label: string; q: string }[] = [
  { id: "me",         label: "Me",         q: "Tell me about yourself."       },
  { id: "projects",   label: "Projects",   q: "Show me your projects."        },
  { id: "experience", label: "Experience", q: "What's your work experience?"  },
  { id: "skills",     label: "Skills",     q: "What are your skills?"         },
  { id: "contact",    label: "Contact",    q: "How can I contact you?"        },
];

const STATIC_REPLIES: Record<Exclude<Section, "hero">, string> = {
  me:         "You can see a quick summary of Charmy's background above. Ask about projects, skills, experience, or how to get in touch!",
  projects:   "Here are Charmy's highlighted projects — each links to GitHub. Ask about any specific one for more details.",
  experience: "Here's Charmy's work experience. Ask for details on any role!",
  skills:     "Here's Charmy's full skills breakdown. Feel free to ask about any technology!",
  contact:    "You can reach Charmy through the contact info above. Feel free to message anytime!",
};

const CARD_GRADIENTS = [
  "linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95)",
  "linear-gradient(135deg,#052e16,#14532d,#065f46)",
  "linear-gradient(135deg,#431407,#7c2d12,#9a3412)",
  "linear-gradient(135deg,#0c1445,#1e3a8a,#1d4ed8)",
  "linear-gradient(135deg,#3b0764,#6b21a8,#9333ea)",
];

const PLACEHOLDERS = [
  "Ask me about my projects…",
  "What's Charmy's tech stack?",
  "Tell me about the LLM agent…",
  "How can I contact Charmy?",
  "What are Charmy's skills?",
];

function detectSection(msg: string, grounded: string[]): Exclude<Section, "hero"> {
  if (grounded.some(s => s.startsWith("project"))) return "projects";
  if (grounded.includes("experience")) return "experience";
  if (grounded.includes("skills")) return "skills";
  if (grounded.includes("contact")) return "contact";
  if (grounded.includes("about") || grounded.includes("education")) return "me";
  const m = msg.toLowerCase();
  if (/project|built|made|creat|build/.test(m)) return "projects";
  if (/experience|work|job|intern|company|larsen/.test(m)) return "experience";
  if (/skill|stack|tech|language|python/.test(m)) return "skills";
  if (/contact|email|reach|hire|linkedin/.test(m)) return "contact";
  return "me";
}

function NavIcon({ id }: { id: string }) {
  switch (id) {
    case "me":
      return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>;
    case "projects":
      return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/></svg>;
    case "experience":
      return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>;
    case "skills":
      return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>;
    case "contact":
      return <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>;
    default: return null;
  }
}

export default function App() {
  const [section, setSection]   = useState<Section>("hero");
  const [sectionLog, setSectionLog] = useState<Record<string, Msg[]>>({});
  const [pendingQ, setPendingQ] = useState("");
  const [history, setHistory]   = useState<ChatTurn[]>([]);
  const [input, setInput]       = useState("");
  const [busy, setBusy]         = useState(false);
  const [projectPage, setProjectPage] = useState(0);
  const [phIdx, setPhIdx]       = useState(0);
  const bottomRef               = useRef<HTMLDivElement>(null);

  // Cycle hero input placeholder
  useEffect(() => {
    const id = setInterval(() => setPhIdx(i => (i + 1) % PLACEHOLDERS.length), 2800);
    return () => clearInterval(id);
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sectionLog, pendingQ, busy]);

  const navigate = useCallback(async (q: string, target?: Exclude<Section, "hero">) => {
    if (busy) return;
    setInput("");
    setPendingQ(q);
    setBusy(true);
    if (target) setSection(target);

    try {
      const res = await sendChat(q, history);
      const dest = target ?? detectSection(q, res.grounded_on);
      setSection(dest);
      setSectionLog(prev => ({
        ...prev,
        [dest]: [...(prev[dest] ?? []), { q, reply: res.reply }],
      }));
      setHistory(h => [...h, { role: "user", content: q }, { role: "assistant", content: res.reply }]);
    } catch {
      const dest = target ?? "me";
      setSection(dest);
      setSectionLog(prev => ({
        ...prev,
        [dest]: [...(prev[dest] ?? []), { q, reply: STATIC_REPLIES[dest] }],
      }));
    } finally {
      setPendingQ("");
      setBusy(false);
    }
  }, [busy, history]);

  const submit = useCallback(() => {
    const msg = input.trim();
    if (msg && !busy) navigate(msg);
  }, [input, busy, navigate]);

  const goHero = useCallback(() => {
    setSection("hero");
    setPendingQ("");
  }, []);

  const navBar = (
    <nav className="nav-pills" aria-label="Portfolio sections">
      {NAV.map(({ id, label }) => (
        <button
          key={id}
          className={`nav-pill${section === id ? " active" : ""}`}
          onClick={() => navigate(NAV.find(n => n.id === id)!.q, id)}
          aria-current={section === id ? "page" : undefined}
        >
          <NavIcon id={id} />
          {label}
        </button>
      ))}
    </nav>
  );

  const chatInput = (inHero: boolean) => (
    <div className={inHero ? "hero-chat" : "chat-bar"}>
      <input
        className="chat-input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder={inHero ? PLACEHOLDERS[phIdx] : "Ask me…"}
        disabled={busy}
        aria-label="Ask the AI assistant"
      />
      <button
        className="chat-send"
        onClick={submit}
        disabled={busy || !input.trim()}
        aria-label="Send"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
        </svg>
      </button>
    </div>
  );

  /* ── Hero ── */
  const msgs = sectionLog[section] ?? [];
  const isHero = section === "hero";

  return (
    <>
      <FluidCursor />
      {isHero ? (
      <div className="hero-screen">

        {/* top-left resume link */}
        <a
          href={PROFILE.github}
          target="_blank"
          rel="noreferrer"
          className="hero-top-btn resume-btn"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
          </svg>
          Resume →
        </a>

        {/* top-right sun icon */}
        <button className="hero-top-btn sun-btn" aria-label="Theme toggle (coming soon)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7zm0-5a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm0 16a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1zm9-9a1 1 0 0 1 0 2h-2a1 1 0 0 1 0-2h2zM5 12a1 1 0 0 1-1 1H2a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1zm12.07-6.07a1 1 0 0 1 0 1.41l-1.41 1.42a1 1 0 0 1-1.42-1.42l1.42-1.41a1 1 0 0 1 1.41 0zM7.76 16.24a1 1 0 0 1 0 1.41l-1.41 1.42a1 1 0 0 1-1.42-1.42l1.42-1.41a1 1 0 0 1 1.41 0zm9.9 1.41a1 1 0 0 1-1.41 0l-1.42-1.41a1 1 0 0 1 1.42-1.42l1.41 1.42a1 1 0 0 1 0 1.41zM7.76 7.76a1 1 0 0 1-1.41 0L4.93 6.34a1 1 0 0 1 1.41-1.41l1.42 1.41a1 1 0 0 1 0 1.42z"/>
          </svg>
        </button>

        <div className="hero-content">
          <p className="hero-greeting">Hey, I'm Charmy Dhawan</p>
          <h1 className="hero-title">AI &amp; Automation<br />Engineer</h1>
          <div className="hero-avatar" aria-hidden="true">🤖</div>
          {chatInput(true)}
          {navBar}
        </div>

        <p className="hero-watermark" aria-hidden="true">Learn deeply. Build simply.</p>
      </div>
      ) : (
      <div className="content-screen">
      {/* Clickable avatar → back to hero */}
      <div className="content-top">
        <button
          className="content-avatar"
          onClick={goHero}
          title="Back to home"
          aria-label="Back to home"
        >
          🤖
        </button>
      </div>

      <div className="content-area">
        {/* Persistent per-section conversation log */}
        {msgs.map((msg, i) => (
          <Fragment key={i}>
            <div className="bubble-user">{msg.q}</div>
            <div className="bubble-ai">{msg.reply}</div>
          </Fragment>
        ))}

        {/* Current pending question */}
        {pendingQ && <div className="bubble-user">{pendingQ}</div>}
        {busy     && <div className="typing-dots"><span/><span/><span/></div>}

        {/* Section content renders below the chat */}
        <div className="section-anim" key={section}>
          {section === "me"         && <MeSection />}
          {section === "projects"   && <ProjectsSection page={projectPage} setPage={setProjectPage} />}
          {section === "experience" && <ExperienceSection />}
          {section === "skills"     && <SkillsSection />}
          {section === "contact"    && <ContactSection />}
        </div>

        <div ref={bottomRef} />
      </div>

      <div className="bottom-bar">
        {navBar}
        {chatInput(false)}
      </div>
    </div>
      )}
    </>
  );
}

/* ── Section components ── */

function MeSection() {
  return (
    <div className="section-me">
      <div className="me-initials" aria-hidden="true">🤖</div>
      <div className="me-body">
        <h2>{PROFILE.name}</h2>
        <p className="me-subtitle">{PROFILE.title}&nbsp;·&nbsp;{PROFILE.location}</p>
        <p className="me-bio">{PROFILE.tagline}</p>
        <div className="me-tags">
          <span className="me-tag">AI Agents</span>
          <span className="me-tag">Python</span>
          <span className="me-tag">FastAPI</span>
        </div>
        <div className="edu-card">
          <p className="edu-degree">{EDUCATION.degree}</p>
          <p className="edu-school">{EDUCATION.school}</p>
          <p className="edu-note">{EDUCATION.note}</p>
        </div>
      </div>
    </div>
  );
}

function ProjectsSection({ page, setPage }: { page: number; setPage: (p: number) => void }) {
  const perPage = 3;
  const maxPage = Math.ceil(PROJECTS.length / perPage) - 1;
  const visible = PROJECTS.slice(page * perPage, page * perPage + perPage);

  return (
    <div>
      <h2 className="section-heading">My Projects</h2>
      <div className="projects-grid">
        {visible.map((p, i) => (
          <a
            key={p.repo}
            className="project-card"
            href={`${PROFILE.github}/${p.repo}`}
            target="_blank"
            rel="noreferrer"
            style={{ background: CARD_GRADIENTS[(page * perPage + i) % CARD_GRADIENTS.length] }}
            aria-label={`${p.name} — ${p.tags[0]}`}
          >
            <p className="project-category">{p.tags[0]}</p>
            <h3 className="project-name">{p.name}</h3>
            {/* hover overlay */}
            <div className="project-hover" aria-hidden="true">{p.description}</div>
          </a>
        ))}
      </div>

      {PROJECTS.length > perPage && (
        <div className="carousel-controls">
          <div className="carousel-dots">
            {Array.from({ length: maxPage + 1 }).map((_, i) => (
              <button
                key={i}
                className={`dot${i === page ? " active" : ""}`}
                onClick={() => setPage(i)}
                aria-label={`Page ${i + 1}`}
              />
            ))}
          </div>
          <div className="carousel-arrows">
            <button className="carousel-btn" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} aria-label="Previous">←</button>
            <button className="carousel-btn" onClick={() => setPage(Math.min(maxPage, page + 1))} disabled={page === maxPage} aria-label="Next">→</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExperienceSection() {
  return (
    <div>
      <h2 className="section-heading">Work Experience</h2>
      {EXPERIENCE.map(e => (
        <div key={e.company} className="exp-card">
          <div className="exp-header">
            <h3>{e.role}</h3>
            <span className="exp-period">{e.period}</span>
          </div>
          <p className="exp-company">{e.company}</p>
          <p className="exp-desc">{e.description}</p>
        </div>
      ))}
    </div>
  );
}

function SkillsSection() {
  return (
    <div>
      <h2 className="section-heading">Skills &amp; Expertise</h2>
      {Object.entries(SKILLS).map(([group, items]) => (
        <div key={group} className="skill-group">
          <h3 className="skill-group-label">
            <span className="skill-bracket" aria-hidden="true">&lt;/&gt;</span>
            {group}
          </h3>
          <div className="skill-tags">
            {items.map(s => <span key={s} className="skill-tag">{s.replace("*", "")}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactSection() {
  return (
    <div>
      <div className="contact-card">
        <div className="contact-card-top">
          <h2>Contacts</h2>
          <span className="contact-handle">@Charmbytes</span>
        </div>
        <a href={`mailto:${PROFILE.email}`} className="contact-email">{PROFILE.email}</a>
        <div className="contact-btns">
          <a href={PROFILE.linkedin} target="_blank" rel="noreferrer" className="contact-btn">LinkedIn</a>
          <a href={PROFILE.github}   target="_blank" rel="noreferrer" className="contact-btn">GitHub</a>
        </div>
      </div>
    </div>
  );
}
