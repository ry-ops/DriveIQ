import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import BuildIcon from "@mui/icons-material/Build";
import { maintenanceApi, MaintenanceRecord } from "./api";

export function Maintenance() {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    loadRecords();
  }, []);

  async function loadRecords() {
    setLoading(true);
    try {
      const data = await maintenanceApi.getAll(100);
      setRecords(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load maintenance records");
    } finally {
      setLoading(false);
    }
  }

  const filtered = records.filter(
    (r) =>
      !filter ||
      r.maintenance_type.toLowerCase().includes(filter.toLowerCase()) ||
      r.service_provider?.toLowerCase().includes(filter.toLowerCase()) ||
      r.description?.toLowerCase().includes(filter.toLowerCase())
  );

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
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>
          Maintenance History
        </Typography>
        <Chip label={`${filtered.length} records`} size="small" />
      </Box>

      <TextField
        size="small"
        fullWidth
        placeholder="Filter by type, provider, or description..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {filtered.length === 0 ? (
        <Alert severity="info">No maintenance records found.</Alert>
      ) : (
        filtered.map((r) => (
          <Card key={r.id} sx={{ mb: 1.5 }}>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                <BuildIcon color="action" sx={{ mt: 0.3 }} />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                    <Typography variant="body1" fontWeight={600}>
                      {r.maintenance_type}
                    </Typography>
                    {r.cost != null && r.cost > 0 && (
                      <Chip
                        label={`$${r.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                    )}
                  </Box>
                  {r.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {r.description}
                    </Typography>
                  )}
                  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(r.date_performed).toLocaleDateString()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.mileage.toLocaleString()} mi
                    </Typography>
                    {r.service_provider && (
                      <Typography variant="caption" color="text.secondary">
                        {r.service_provider}
                      </Typography>
                    )}
                  </Box>
                  {r.parts_used && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                      Parts: {r.parts_used}
                    </Typography>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );
}
