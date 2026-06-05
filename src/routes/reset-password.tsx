import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Скидання пароля — CalorAI" }] }),
  component: ResetPage,
});

function ResetPage() {
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.includes("type=recovery")) setRecovery(true);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Перевір пошту — посилання надіслано");
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success("Пароль оновлено");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">
          {recovery ? "Новий пароль" : "Скинути пароль"}
        </h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {recovery ? "Введи новий пароль для свого акаунта." : "Введи email — надішлемо посилання."}
        </p>
        <form onSubmit={recovery ? updatePassword : sendLink} className="space-y-4">
          {recovery ? (
            <div className="space-y-1.5">
              <Label htmlFor="np">Новий пароль</Label>
              <Input
                id="np"
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "…" : recovery ? "Зберегти" : "Надіслати посилання"}
          </Button>
        </form>
        <Link
          to="/auth"
          className="mt-3 block text-center text-xs text-muted-foreground hover:text-primary"
        >
          ← Повернутись до входу
        </Link>
      </div>
    </div>
  );
}