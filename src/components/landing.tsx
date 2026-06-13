import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "@tanstack/react-router";

import { InboxTiles, type Reading } from "@/components/inbox-tiles";
import { makeDemoAccounts } from "@/lib/test-account";

/**
 * Signed-out landing page — a faithful port of the "Betterbox Landing v6"
 * design handoff (Claude Design / Linear marketing vocabulary). The prototype
 * referenced bare DS tokens (--canvas, --ink, …); we alias them to the app's
 * own --color-* tokens on the root so the page renders pixel-for-pixel without
 * duplicating the palette. Always dark, regardless of the in-app theme.
 */

const COL = 1240;

// Map the design-system token names the prototype used onto the tokens that
// already exist in styles.css. (--primary/--primary-hover/--on-primary/
// --font-mono already resolve globally, so they're omitted here.)
const DS_VARS = {
  "--canvas": "var(--color-canvas)",
  "--surface-1": "var(--color-surface-1)",
  "--surface-2": "var(--color-surface-2)",
  "--surface-3": "var(--color-surface-3)",
  "--hairline": "var(--color-hairline)",
  "--hairline-strong": "var(--color-hairline-strong)",
  "--hairline-tertiary": "var(--color-hairline-tertiary)",
  "--ink": "var(--color-ink)",
  "--ink-muted": "var(--color-ink-muted)",
  "--ink-subtle": "var(--color-ink-subtle)",
  "--ink-tertiary": "var(--color-ink-tertiary)",
  "--success": "var(--color-success)",
  "--ring": "var(--primary-focus)",
  "--term-bg": "var(--color-term)",
  "--term-text": "var(--color-term-text)",
  "--term-prompt": "var(--color-accent-2-hover)",
  "--font-display": "var(--font-sans)",
  "--font-text": "var(--font-sans)",
} as CSSProperties;

const btnPrimary: CSSProperties = {
  fontFamily: "var(--font-text)",
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1.2,
  background: "var(--primary)",
  color: "var(--on-primary)",
  border: "none",
  padding: "0 18px",
  height: 40,
  borderRadius: 8,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

function Mark({ size = 22, fontSize = 13, radius = 6 }: { size?: number; fontSize?: number; radius?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--primary)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize,
        color: "var(--on-primary)",
        letterSpacing: "-1px",
      }}
    >
      B
    </span>
  );
}

function Wordmark({ size = 22, fontSize = 14, textSize }: { size?: number; fontSize?: number; textSize?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <Mark size={size} fontSize={fontSize} />
      <span
        style={{
          fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", var(--font-mono)',
          fontWeight: 600,
          fontSize: textSize || 14,
          color: "var(--ink)",
          letterSpacing: "-0.3px",
          whiteSpace: "nowrap",
        }}
      >
        Betterbox
      </span>
    </span>
  );
}

const WL_KEY = "betterbox-waitlist-email";

/** Waitlist capture: idle → open (email field) → done. Persists in
 *  localStorage so every instance agrees on reload. */
function Waitlist({ big = false }: { big?: boolean }) {
  const stored = (() => {
    try {
      return localStorage.getItem(WL_KEY);
    } catch {
      return null;
    }
  })();
  const [phase, setPhase] = useState<"idle" | "open" | "done">(stored ? "done" : "idle");
  const [email, setEmail] = useState(stored || "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (phase === "open") inputRef.current?.focus();
  }, [phase]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/.+@.+\..+/.test(email)) {
      inputRef.current?.focus();
      return;
    }
    try {
      localStorage.setItem(WL_KEY, email);
    } catch {
      /* ignore */
    }
    setPhase("done");
  };

  const h = big ? 44 : 40;

  if (phase === "done") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "center",
          minHeight: h,
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          color: "var(--ink-subtle)",
        }}
      >
        <span style={{ color: "var(--success)" }}>✓</span>
        <span>you're on the list — one email at launch, that's it</span>
      </div>
    );
  }

  if (phase === "open") {
    return (
      <form onSubmit={submit} style={{ display: "flex", gap: 8, justifyContent: "center", minHeight: h }}>
        <input
          ref={inputRef}
          type="email"
          value={email}
          placeholder="you@yourdomain.dev"
          onChange={(e) => setEmail(e.target.value)}
          style={{
            height: h,
            width: big ? 280 : 240,
            padding: "0 14px",
            borderRadius: 8,
            background: "var(--surface-1)",
            border: "1px solid var(--hairline-strong)",
            color: "var(--ink)",
            fontFamily: "var(--font-text)",
            fontSize: 14,
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ring)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--hairline-strong)")}
        />
        <button
          type="submit"
          style={{ ...btnPrimary, height: h, fontSize: big ? 15 : 14 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--primary)")}
        >
          Notify me
        </button>
      </form>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "center", minHeight: h }}>
      <button
        type="button"
        style={{ ...btnPrimary, height: h, fontSize: big ? 15 : 14, padding: big ? "0 20px" : "0 18px" }}
        onClick={() => setPhase("open")}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--primary)")}
      >
        Join the waitlist
      </button>
    </div>
  );
}

function SectionLabel({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", marginBottom: 24 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: "var(--ink-tertiary)",
        }}
      >
        {children}
      </span>
      {caption && (
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-tertiary)" }}>
          {caption}
        </span>
      )}
    </div>
  );
}

function Wrap({
  children,
  label,
  caption,
  id,
}: {
  children: React.ReactNode;
  label?: string;
  caption?: string;
  id?: string;
}) {
  return (
    <section id={id} style={{ maxWidth: COL, margin: "0 auto", padding: "0 40px" }}>
      <div style={{ borderTop: "1px solid var(--hairline)", padding: "40px 0 56px" }}>
        {label && <SectionLabel caption={caption}>{label}</SectionLabel>}
        {children}
      </div>
    </section>
  );
}

function Header() {
  const toPlan = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("v6-plan");
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24, behavior: "smooth" });
  };
  return (
    <div style={{ maxWidth: COL, margin: "0 auto", padding: "0 40px" }}>
      <header style={{ height: 64, display: "flex", alignItems: "center", gap: 18 }}>
        <Wordmark />
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-tertiary)" }}>
          in development
        </span>
        <button
          type="button"
          onClick={toPlan}
          style={{ ...btnPrimary }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--primary)")}
        >
          Join the waitlist
        </button>
      </header>
    </div>
  );
}

function Hero() {
  return (
    <section style={{ padding: "64px 40px 0", maxWidth: COL, margin: "0 auto", textAlign: "center" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 14px",
          border: "1px solid var(--hairline)",
          borderRadius: 9999,
          marginBottom: 26,
          background: "var(--surface-1)",
          whiteSpace: "nowrap",
        }}
      >
        <span className="bb-pulse" style={{ width: 7, height: 7, borderRadius: 9999, background: "var(--success)" }} />
        <span style={{ fontFamily: "var(--font-text)", fontSize: 13, color: "var(--ink-muted)" }}>
          In development — waitlist open
        </span>
      </div>

      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          color: "var(--ink)",
          fontSize: 64,
          lineHeight: 1.06,
          letterSpacing: "-0.04em",
          margin: "0 auto",
          maxWidth: 820,
          textWrap: "balance",
        }}
      >
        Gmail, at developer speed.
      </h1>

      <p
        style={{
          fontFamily: "var(--font-text)",
          fontSize: 19,
          lineHeight: 1.5,
          color: "var(--ink-subtle)",
          letterSpacing: "-0.01em",
          maxWidth: 560,
          margin: "20px auto 0",
          textWrap: "pretty",
        }}
      >
        A fast, dense client for every Google inbox you have. Keyboard-first, built on the Gmail API — not another email
        service.
      </p>

      <div style={{ marginTop: 32 }}>
        <Waitlist big />
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section style={{ maxWidth: COL, margin: "0 auto", padding: "64px 40px 64px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 14,
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          color: "var(--ink-subtle)",
        }}
      >
        <span className="bb-pulse" style={{ width: 7, height: 7, borderRadius: 9999, background: "var(--success)" }} />
        live demo · sample data
      </div>
      <div
        style={{
          padding: 10,
          background: "var(--surface-1)",
          border: "1px solid var(--hairline)",
          borderRadius: 16,
          boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset",
        }}
      >
        <div style={{ position: "relative", height: 680, borderRadius: 8, overflow: "hidden", background: "var(--canvas)" }}>
          <LandingDemo />
        </div>
      </div>
    </section>
  );
}

/** The demo slot: the real inbox running on two seeded test accounts — fully
 *  browsable, nothing actually sends. Client-only (the inbox is heavy and uses
 *  localStorage) and forced dark to sit inside the dark demo frame. */
function LandingDemo() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const accounts = useMemo(() => makeDemoAccounts(), []);
  const scopeIds = useMemo(() => accounts.map((a) => a.accountId), [accounts]);
  const [reading, setReading] = useState<Reading | null>(null);

  if (!mounted) return <DemoLoading />;

  return (
    <div className="dark absolute inset-0 bg-background text-left text-foreground">
      <InboxTiles
        accounts={accounts}
        scopeIds={scopeIds}
        folder="inbox"
        reading={reading}
        onOpenEmail={(accountId, emailId) => setReading({ accountId, emailId })}
        onCloseReader={() => setReading(null)}
        onRemovePane={() => {}}
      />
    </div>
  );
}

function DemoLoading() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-tertiary)" }}>
        <span className="bb-pulse" style={{ width: 7, height: 7, borderRadius: 9999, background: "var(--success)" }} />
        loading live demo…
      </div>
    </div>
  );
}

const SPEC_CELLS: [string, string][] = [
  ["multi-account", "Every Google inbox in one list. Colored dots keep accounts apart; views merge them."],
  ["⌘k", "Compose, switch accounts, export, search — every action is a keystroke."],
  ["raw mime", "The original source of any message, one ⌥R away."],
  ["webhooks", "New-mail events delivered to your endpoint, signed and retried."],
  ["api log", "Every Gmail API call on the record — status, latency, units."],
  ["exports", "Any thread as Markdown, JSON, or plain text."],
];

function Spec() {
  return (
    <Wrap label="what it is" caption="the short version">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, overflow: "hidden" }}>
        {SPEC_CELLS.map(([label, body]) => (
          <div key={label} style={{ padding: "18px 20px 22px", boxShadow: "-1px 0 0 var(--hairline), 0 -1px 0 var(--hairline)" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                fontWeight: 500,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                color: "var(--ink-tertiary)",
                marginBottom: 8,
              }}
            >
              {label}
            </div>
            <p style={{ fontFamily: "var(--font-text)", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-muted)", margin: 0, textWrap: "pretty" }}>
              {body}
            </p>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function Plan() {
  return (
    <Wrap id="v6-plan" label="plan" caption="one plan">
      <div style={{ textAlign: "center", padding: "8px 0 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, justifyContent: "center" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 600, letterSpacing: "-1.4px", color: "var(--ink)" }}>$4</span>
          <span style={{ fontFamily: "var(--font-text)", fontSize: 15, color: "var(--ink-subtle)" }}>/month</span>
        </div>
        <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-tertiary)" }}>cancel any time</div>
        <p
          style={{
            fontFamily: "var(--font-text)",
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "var(--ink-subtle)",
            margin: "18px auto 0",
            maxWidth: 480,
            textWrap: "pretty",
          }}
        >
          Free while it's in beta. Every account, every feature — no per-seat anything. Leave an email and we'll send exactly
          one message when it's out.
        </p>
        <div style={{ marginTop: 24 }}>
          <Waitlist big />
        </div>
        <div style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-tertiary)" }}>
          price isn't final — it will stay in single digits
        </div>
      </div>
    </Wrap>
  );
}

const FAQ_ITEMS = [
  {
    q: "Is Betterbox a new email service?",
    a: "No. Betterbox is a client for the Gmail accounts you already have, built on the Gmail API. Nothing migrates; your mail stays in Google.",
  },
  {
    q: "Why a waitlist?",
    a: "Betterbox is going through Google's API verification. Until it clears, sign-ins are limited to allow-listed test accounts. The waitlist is the queue — for those slots, and for launch.",
  },
  {
    q: "Does Betterbox store my mail?",
    a: "Messages are fetched live from the Gmail API when you open the app. Webhook and analytics data is metadata — counts, timings, statuses — not message content.",
  },
  {
    q: "When does it launch?",
    a: "When verification clears and the client is ready. Waitlist members get access first, in order.",
  },
];

function Faq() {
  return (
    <Wrap label="faq">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px 48px" }}>
        {FAQ_ITEMS.map((it) => (
          <div key={it.q}>
            <h4 style={{ fontFamily: "var(--font-display)", fontSize: 15.5, fontWeight: 500, letterSpacing: "-0.2px", color: "var(--ink)", margin: "0 0 7px" }}>
              {it.q}
            </h4>
            <p style={{ fontFamily: "var(--font-text)", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-subtle)", margin: 0, textWrap: "pretty" }}>
              {it.a}
            </p>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function Footer() {
  return (
    <footer style={{ maxWidth: COL, margin: "0 auto", padding: "0 40px 40px" }}>
      <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 24, display: "flex", alignItems: "center", gap: 20 }}>
        <Wordmark size={18} fontSize={11} textSize={12.5} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ink-tertiary)" }}>
          in development · restricted to test accounts while Google verification is pending
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 18, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
          <a href="mailto:hello@betterbox.dev" style={{ color: "var(--ink-subtle)" }}>
            hello@betterbox.dev
          </a>
          <Link to="/privacy" style={{ color: "var(--ink-subtle)" }}>
            Privacy
          </Link>
          <span style={{ color: "var(--ink-tertiary)" }}>© 2026</span>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div style={{ ...DS_VARS, background: "var(--canvas)" }} className="h-svh w-full overflow-y-auto">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .bb-pulse { animation: bb-pulse 2.2s ease-out infinite; }
        }
        @keyframes bb-pulse {
          0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 45%, transparent); }
          70% { box-shadow: 0 0 0 7px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }
      `}</style>
      <Header />
      <Hero />
      <Demo />
      <Spec />
      <Plan />
      <Faq />
      <Footer />
    </div>
  );
}
