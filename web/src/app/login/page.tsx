import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const raw = params.next;
  const next = typeof raw === "string" ? raw : "/";

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Visitor Parking Management
          </h1>
          <p className="mt-1 text-sm text-ink-soft">ETTP Unit</p>
        </div>

        <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm">
          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint">
          Forgot your password or need an account? Contact the system administrator.
        </p>
      </div>
    </main>
  );
}
