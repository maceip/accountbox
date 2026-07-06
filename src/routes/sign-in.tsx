import { createFileRoute } from "@tanstack/react-router";

/**
 * Compatibility page for old links. The vault gate at "/" now owns app login;
 * Google is connected later as a source inside the unlocked workspace.
 */
export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Open workspace — AccountBox" }] }),
  component: SignIn,
});

function SignIn() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-canvas px-6 py-8 text-ink">
      <div className="w-full max-w-[440px] rounded-[12px] border border-hairline bg-surface-1 px-7 pt-7 pb-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.35)]">
        <span className="inline-flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-[30px] flex-none items-center justify-center rounded-[8px] bg-primary text-[18px] font-bold tracking-[-1px] text-on-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
          >
            B
          </span>
          <span className="text-[20px] font-semibold tracking-[-0.6px] text-ink">
            AccountBox
          </span>
        </span>

        <h1 className="mt-4 text-[24px] leading-[1.1] font-semibold tracking-[-0.8px] text-ink">
          Open your workspace
        </h1>
        <p className="mt-2 text-[14.5px] leading-normal text-ink-subtle">
          Your vault password unlocks AccountBox. Connect Gmail after the
          workspace opens.
        </p>

        <a
          href="/"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-[8px] bg-primary text-[15px] font-medium tracking-[-0.1px] text-on-primary transition-colors hover:bg-primary-hover focus-visible:shadow-[0_0_0_2px_var(--color-surface-1),0_0_0_4px_color-mix(in_srgb,var(--color-ring)_55%,transparent)] focus-visible:outline-none active:bg-primary-focus"
        >
          Continue
        </a>

        <p className="mt-3.5 text-center text-[12px] leading-normal text-ink-tertiary">
          Gmail stays a connected source, not the AccountBox login.
        </p>
      </div>
    </main>
  );
}
