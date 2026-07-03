import {
  BarChart3,
  CalendarRange,
  Database,
  FlaskConical,
  Home,
  LayoutDashboard,
  Target,
  Variable
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cost-of-living", label: "Cost of Living", icon: Home },
  { to: "/periods", label: "Periods", icon: CalendarRange },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/what-if", label: "What-If", icon: FlaskConical },
  { to: "/variables", label: "Variables", icon: Variable },
  { to: "/settings", label: "Settings", icon: Database }
];

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-border bg-card px-4 py-6 lg:block">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">
            <BarChart3 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Finance Planner
            </p>
            <h1 className="text-lg font-semibold tracking-normal">
              Long-Term Plan
            </h1>
          </div>
        </div>
        <nav aria-label="Primary navigation" className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                )
              }
              end={item.to === "/"}
              key={item.to}
              to={item.to}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <main className="mx-auto min-h-screen max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="fixed left-0 top-[calc(100dvh-5rem)] z-[100] grid h-20 w-dvw grid-cols-7 border-t border-border bg-card/95 px-2 py-2 shadow-soft backdrop-blur lg:hidden"
      >
        {navItems.map((item) => (
          <NavLink
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] font-medium text-muted-foreground",
                isActive && "bg-primary/10 text-primary"
              )
            }
            end={item.to === "/"}
            key={item.to}
            to={item.to}
          >
            <item.icon className="h-5 w-5" aria-hidden="true" />
            <span className="max-w-full truncate">{item.label.split(" ")[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
