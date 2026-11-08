"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient, getRememberMe, setRememberMe } from "@/lib/supabase/client";
import "./login.css";

export default function LoginPage() {
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
      // A prior background session restore must not race a new sign-in.
      // Always finish a verification attempt, including when the network stalls.
      const response = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_resolve, reject) => {
          // The timeout also prevents an infinite "Verifying..." UI if auth stalls.
          window.setTimeout(() => reject(new Error("登录请求超时，请刷新后重试。")), 20000);
        }),
      ]);

      if (response.error) {
        const message = response.error.message.toLowerCase();
        setError(
          message.includes("email not confirmed")
            ? "邮箱尚未确认。请在 Supabase Authentication → Users 检查并确认该用户。"
            : message.includes("invalid login credentials")
              ? "邮箱或密码错误，请检查测试账号的密码。"
              : "登录验证失败：" + response.error.message
        );
        return;
      }

      if (!response.data.session) {
        setError("登录成功但未收到有效会话，请确认 Supabase 用户已完成邮箱验证。");
        return;
      }

      if (remember) {
        const { persistSessionBackup } = await import("@/lib/supabase/session-backup");
        persistSessionBackup(response.data.session);
      }

      // A full navigation guarantees middleware re-evaluates the new auth cookies
      // and applies Astra-only entity restrictions before rendering the dashboard.
      window.location.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "登录暂时失败，请检查网络连接后重试。");
    } finally {
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
