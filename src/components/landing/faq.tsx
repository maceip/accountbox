import { Wrap } from "./primitives";

const FAQ_ITEMS = [
  {
    q: "What is AccountBox exactly?",
    a: "A client for the Gmail accounts you already have, built on the Gmail API. Nothing migrates, your mail stays in Google. It started as a Gmail client and is expanding into a workspace: email, pull requests, and issues in one tab. GitHub is connected now. Linear is next.",
  },
  {
    q: "Self-host or hosted: what's the difference?",
    a: "Two ways to run the same client. Self-host is free and open source: bring your own OAuth credentials and run it on your own infra. Hosted is $5/mo and coming soon. Join the waitlist to be first in.",
  },
  {
    q: "Is it really open source?",
    a: "Yes. The full client is on GitHub: audit every line, self-host it for free, or fork it. Hosted runs the same code, maintained by us.",
  },
  {
    q: "Why does Google show a security warning when I sign in?",
    a: "AccountBox is a hobby project and Google's verification costs ~$750/yr. I can't justify that right now, so you'll see an 'unverified app' warning when you sign in. Click Advanced, then Proceed to AccountBox to continue. You can read the privacy policy or self-host if you'd prefer.",
  },
  {
    q: "Does AccountBox store my mail?",
    a: "Messages are fetched live from the Gmail API when you open the app and are never stored on our servers. The only data we store is your account tokens, session records, and settings.",
  },
  {
    q: "When does hosted launch?",
    a: "Soon. Join the waitlist and you'll be the first to know. Self-host works today, straight from the repo.",
  },
];

export function Faq() {
  return (
    <Wrap label="faq">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="-m-px grid grid-cols-1 md:grid-cols-2">
          {FAQ_ITEMS.map((it) => (
            <div key={it.q} className="border-t border-l border-border p-6">
              <h4 className="mb-2 text-[15px] font-medium tracking-tight text-foreground">
                {it.q}
              </h4>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {it.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Wrap>
  );
}
