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

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-xl px-4 pt-6">{children}</div>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-xl items-end justify-around px-2 py-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = location.pathname.startsWith(t.to);
            if ("primary" in t && t.primary) {
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95"
                >
                  <Icon className="h-6 w-6" />
                </Link>
              );
            }
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {t.label}
              </Link>
            );
          })}
          <Link
            to="/profile"
            className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition ${
              location.pathname.startsWith("/profile") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <User className="h-5 w-5" />
            Я
          </Link>
        </div>
      </nav>
    </div>
  );
}