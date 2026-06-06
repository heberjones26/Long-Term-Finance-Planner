import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { CostOfLivingPage } from "./pages/CostOfLivingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { GoalsPage } from "./pages/GoalsPage";
import { PeriodsPage } from "./pages/PeriodsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { usePlannerStore } from "./store/plannerStore";

export default function App() {
  const { error, isLoading, loadPlan, plan, resetWithSeed } = usePlannerStore();

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <Card className="max-w-sm">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">
              Loading planner...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <Card className="max-w-md">
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">
              {error ?? "No plan is available."}
            </p>
            <Button onClick={() => void resetWithSeed()}>Create Demo Plan</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <div className="fixed inset-x-0 top-0 z-50 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
          {error}
        </div>
      ) : null}
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="cost-of-living" element={<CostOfLivingPage />} />
          <Route path="periods" element={<PeriodsPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
