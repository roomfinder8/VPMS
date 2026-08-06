import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { logout } from "../login/actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  user: "User",
};

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const profile = await getCurrentProfile();
  // proxy.ts already guards this; the repeat check covers a session expiring mid-use.
  if (!profile) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-raised/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              Visitor Parking Management
            </p>
            <p className="truncate text-xs text-ink-faint leading-tight">
              ETTP Unit
            </p>
          </div>

          <div className="hidden text-right sm:block">
            <p className="text-sm leading-tight">{profile.full_name}</p>
            <p className="text-xs text-ink-faint leading-tight">
              {ROLE_LABEL[profile.role] ?? profile.role}
            </p>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="h-10 rounded-lg border border-line px-3 text-sm text-ink-soft
                         transition hover:bg-surface active:scale-[0.98] sm:h-9"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:pb-12">
        {children}
      </main>
    </div>
  );
}
