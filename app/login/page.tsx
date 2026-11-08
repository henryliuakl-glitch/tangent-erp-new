"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient, getRememberMe, setRememberMe } from "@/lib/supabase/client";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(() => getRememberMe());
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    setError("");
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    try {
      // Keep the existing 60-day sign-in and session-backup behaviour unchanged.
      setRememberMe(remember);
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("账号或密码错误，请重试。");
        setPending(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (remember && session) {
        const { persistSessionBackup } = await import("@/lib/supabase/session-backup");
        persistSessionBackup(session);
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("登录暂时失败，请检查网络连接后重试。");
      setPending(false);
    }
  };

  return (
    <main className="tangent-login-page">
      <section className="tangent-login-stage" aria-label="Tangent ERP login">
        <div className="tangent-login-content">
          <header className="tangent-login-brand">
            <div className="tangent-login-brandmark">
              <Image
                src="/favicon.svg"
                width={55}
                height={69}
                alt="Tangent"
                priority
                unoptimized
              />
            </div>
            <h1>Tangent ERP</h1>
          </header>

          <div className="tangent-login-card">
            <div className="tangent-login-intro">
              <h2>Welcome back!</h2>
            </div>

            <form onSubmit={handleSubmit} className="tangent-login-form">
              <div className="tangent-login-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  disabled={pending}
                />
              </div>

              <div className="tangent-login-field">
                <label htmlFor="password">Password</label>
                <div className="tangent-login-password">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    disabled={pending}
                  />
                  <button
                    type="button"
                    className="tangent-login-eye"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    disabled={pending}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <label className="tangent-login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  disabled={pending}
                />
                <span>Remember me</span>
              </label>

              {error && (
                <div className="tangent-login-error" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="tangent-login-submit"
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="animate-spin" size={17} aria-hidden="true" />
                    Verifying...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          </div>

          <p className="tangent-login-footnote">Authorized Personnel Only</p>
        </div>
      </section>
    </main>
  );
}
