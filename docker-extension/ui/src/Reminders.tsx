import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import LinearProgress from "@mui/material/LinearProgress";
import WarningIcon from "@mui/icons-material/Warning";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { vehicleApi, remindersApi, SmartReminder } from "./api";

const STATUS_CONFIG = {
  overdue: { color: "error" as const, icon: <WarningIcon fontSize="small" />, label: "Overdue" },
  due_soon: { color: "warning" as const, icon: <ScheduleIcon fontSize="small" />, label: "Due Soon" },
  ok: { color: "success" as const, icon: <CheckCircleIcon fontSize="small" />, label: "OK" },
};

const PRIORITY_COLOR = {
  high: "error" as const,
  medium: "warning" as const,
  low: "default" as const,
};

export function Reminders() {
  const [reminders, setReminders] = useState<SmartReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReminders();
  }, []);

  async function loadReminders() {
    setLoading(true);
    try {
      const v = await vehicleApi.get();
      const data = await remindersApi.getSmart(v.current_mileage ?? 0);
      // Sort: overdue first, then due_soon, then ok
      const order = { overdue: 0, due_soon: 1, ok: 2 };
      data.sort((a, b) => order[a.status] - order[b.status]);
      setReminders(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load reminders");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const counts = {
    overdue: reminders.filter((r) => r.status === "overdue").length,
    due_soon: reminders.filter((r) => r.status === "due_soon").length,
    ok: reminders.filter((r) => r.status === "ok").length,
  };

  return (
    <Box>
      <Typography variant="h6" fontWeight={600} gutterBottom>
        Smart Maintenance Schedule
      </Typography>

      {/* Status Summary */}
      <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
        {counts.overdue > 0 && (
          <Chip icon={<WarningIcon />} label={`${counts.overdue} Overdue`} color="error" />
        )}
        {counts.due_soon > 0 && (
          <Chip icon={<ScheduleIcon />} label={`${counts.due_soon} Due Soon`} color="warning" />
        )}
        <Chip icon={<CheckCircleIcon />} label={`${counts.ok} OK`} color="success" variant="outlined" />
      </Box>

      {reminders.length === 0 ? (
        <Alert severity="info">No maintenance schedule items found.</Alert>
      ) : (
        reminders.map((r) => {
          const cfg = STATUS_CONFIG[r.status];
          // Progress bar: how much of the interval has been used
          const progressPct =
            r.interval_miles > 0
              ? Math.min(100, ((r.interval_miles - r.miles_remaining) / r.interval_miles) * 100)
              : 0;

          return (
            <Card key={r.service_key} sx={{ mb: 1.5 }}>
              <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Typography variant="body1" fontWeight={600}>
                        {r.name}
                      </Typography>
                      <Chip
                        icon={cfg.icon}
                        label={cfg.label}
                        size="small"
                        color={cfg.color}
                        variant={r.status === "ok" ? "outlined" : "filled"}
                      />
                      <Chip
                        label={r.priority}
                        size="small"
                        color={PRIORITY_COLOR[r.priority]}
                        variant="outlined"
                        sx={{ textTransform: "capitalize" }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {r.description}
                    </Typography>

                    {/* Progress Bar */}
                    <Box sx={{ mb: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={progressPct}
                        color={cfg.color}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </Box>

                    <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      <Typography variant="caption" color="text.secondary">
                        Next: {r.next_mileage.toLocaleString()} mi
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.miles_remaining > 0
                          ? `${r.miles_remaining.toLocaleString()} mi remaining`
                          : `${Math.abs(r.miles_remaining).toLocaleString()} mi overdue`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {r.days_remaining > 0
                          ? `${r.days_remaining} days remaining`
                          : `${Math.abs(r.days_remaining)} days overdue`}
                      </Typography>
                      {r.estimated_cost > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Est. ${r.estimated_cost}
                        </Typography>
                      )}
                    </Box>
                    {r.last_service && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        Last: {r.last_service.service_type} on{" "}
                        {new Date(r.last_service.date).toLocaleDateString()} at{" "}
                        {r.last_service.mileage.toLocaleString()} mi
                      </Typography>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          );
        })
      )}
    </Box>
  );
}
