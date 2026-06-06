import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Home, Camera, BookOpen, Utensils, Sparkles, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { to: "/today", label: "Сьогодні", icon: Home },
  { to: "/diary", label: "Щоденник", icon: BookOpen },
  { to: "/scan", label: "Скан", icon: Camera, primary: true },
  { to: "/foods", label: "Продукти", icon: Utensils },
  { to: "/coach", label: "Коуч", icon: Sparkles },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/auth", search: { redirect: location.pathname } as never });
      return;
    }
    // check onboarding
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", session.user.id)
        .maybeSingle();
      if (data && !data.onboarded && location.pathname !== "/onboarding") {
        navigate({ to: "/onboarding" });
      }
      setProfileChecked(true);
    })();
  }, [session, loading, navigate, location.pathname]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profileChecked) {
    return <div className="min-h-screen bg-background" />;
  }

  const allTabs = [
    { to: "/today", label: "Сьогодні", icon: Home },
    { to: "/diary", label: "Щоденник", icon: BookOpen },
    { to: "/scan", label: "", icon: Camera, primary: true },
    { to: "/foods", label: "Продукти", icon: Utensils },
    { to: "/coach", label: "Коуч", icon: Sparkles },
    { to: "/profile", label: "Я", icon: User },
  ] as const;

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-xl px-4 pt-6">{children}</div>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-xl grid-cols-6 px-1 pt-2 pb-1">
          {allTabs.map((t) => {
            const Icon = t.icon;
            const active = location.pathname === t.to || location.pathname.startsWith(t.to + "/");
            if ("primary" in t && t.primary) {
              return (
                <div key={t.to} className="relative flex items-start justify-center">
                  <Link
                    to={t.to}
                    aria-label="Сканувати"
                    className="absolute -top-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-card transition active:scale-95"
                  >
                    <Icon className="h-6 w-6" />
                  </Link>
                  <span className="invisible text-[10px]">.</span>
                </div>
              );
            }
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex flex-col items-center justify-end gap-0.5 py-1 text-[10px] font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-none">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}