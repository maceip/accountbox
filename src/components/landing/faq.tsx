import { Wrap } from "./primitives";

const FAQ_ITEMS = [
  {
    q: "What is AccountBox exactly?",
    a: "A local workbench for equipping skills to the accounts you already use. Start the model on your laptop, connect a source, test the skill safely, and approve the output. Gmail and GitHub are the first cartridges.",
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
    a: "Messages are fetched live when needed and are never stored on our servers. Local traces and skill data are kept on your device unless you explicitly export them.",
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
