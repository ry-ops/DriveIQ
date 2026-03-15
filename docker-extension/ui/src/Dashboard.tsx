import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import SpeedIcon from "@mui/icons-material/Speed";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import {
  vehicleApi,
  maintenanceApi,
  remindersApi,
  Vehicle,
  MaintenanceSummary,
  Reminder,
} from "./api";

export function Dashboard() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [summary, setSummary] = useState<MaintenanceSummary[]>([]);
  const [upcoming, setUpcoming] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mileageInput, setMileageInput] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const v = await vehicleApi.get();
      setVehicle(v);
      const [s, u] = await Promise.all([
        maintenanceApi.getSummary(),
        remindersApi.getUpcoming(v.current_mileage ?? 0),
      ]);
      setSummary(s);
      setUpcoming(u);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleMileageUpdate() {
    const m = parseInt(mileageInput);
    if (isNaN(m) || m <= 0) return;
    try {
      const v = await vehicleApi.updateMileage(m);
      setVehicle(v);
      setMileageInput("");
    } catch {
      setError("Failed to update mileage");
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

  return (
    <Box>
      {/* Vehicle Header */}
      {vehicle && (
        <Card
          sx={{
            mb: 3,
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            color: "#fff",
          }}
        >
          <CardContent sx={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <Chip label={vehicle.year} size="small" color="error" />
                <Typography variant="h5" fontWeight={700}>
                  {vehicle.make} {vehicle.model}
                </Typography>
              </Box>
              {vehicle.trim && (
                <Typography variant="body2" color="grey.400">
                  {vehicle.trim}
                  {vehicle.engine ? ` · ${vehicle.engine}` : ""}
                  {vehicle.color_exterior ? ` · ${vehicle.color_exterior}` : ""}
                </Typography>
              )}
            </Box>
            <Box sx={{ textAlign: "right" }}>
              <Typography variant="caption" color="grey.400">
                VIN
              </Typography>
              <Typography variant="body2" fontFamily="monospace">
                {vehicle.vin}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <SpeedIcon color="error" fontSize="large" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Odometer
                </Typography>
                <Typography variant="h5" fontWeight={700}>
                  {vehicle?.current_mileage?.toLocaleString() ?? "—"} mi
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <CalendarMonthIcon color="primary" fontSize="large" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Last Updated
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  {vehicle?.last_mileage_update
                    ? new Date(vehicle.last_mileage_update).toLocaleDateString()
                    : "—"}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <AttachMoneyIcon color="success" fontSize="large" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Total Maintenance Cost
                </Typography>
                <Typography variant="h6" fontWeight={600}>
                  $
                  {summary
                    .reduce((acc, s) => acc + s.total_cost, 0)
                    .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Mileage Update */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Update Mileage
          </Typography>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <TextField
              size="small"
              type="number"
              placeholder="Enter current mileage"
              value={mileageInput}
              onChange={(e) => setMileageInput(e.target.value)}
              sx={{ width: 220 }}
            />
            <Button
              variant="contained"
              color="error"
              size="small"
              onClick={handleMileageUpdate}
              disabled={!mileageInput}
            >
              Update
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Upcoming Reminders */}
      {upcoming.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Upcoming Reminders
            </Typography>
            {upcoming.map((r) => (
              <Box
                key={r.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  py: 1,
                  borderBottom: 1,
                  borderColor: "divider",
                  "&:last-child": { borderBottom: 0 },
                }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    {r.title}
                  </Typography>
                  {r.description && (
                    <Typography variant="caption" color="text.secondary">
                      {r.description}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  {r.due_date && (
                    <Chip
                      label={new Date(r.due_date).toLocaleDateString()}
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={{ mr: 0.5 }}
                    />
                  )}
                  {r.due_mileage && (
                    <Chip
                      label={`${r.due_mileage.toLocaleString()} mi`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Service Summary Table */}
      {summary.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Service Type</TableCell>
                <TableCell align="center">Count</TableCell>
                <TableCell align="right">Total Cost</TableCell>
                <TableCell align="right">Last Performed</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.map((s) => (
                <TableRow key={s.type}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {s.type}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">{s.count}</TableCell>
                  <TableCell align="right">
                    ${s.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell align="right">
                    {s.last_performed
                      ? new Date(s.last_performed).toLocaleDateString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
