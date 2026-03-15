import { useState } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import BuildIcon from "@mui/icons-material/Build";
import NotificationsIcon from "@mui/icons-material/Notifications";
import ChatIcon from "@mui/icons-material/Chat";
import { Dashboard } from "./Dashboard";
import { Maintenance } from "./Maintenance";
import { Reminders } from "./Reminders";
import { Chat } from "./Chat";

export function App() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        }}
      >
        <DirectionsCarIcon sx={{ color: "#e63946", fontSize: 28 }} />
        <Typography variant="h6" sx={{ color: "#fff", fontWeight: 700 }}>
          DriveIQ
        </Typography>
        <Typography variant="caption" sx={{ color: "grey.400", ml: 0.5 }}>
          Intelligent Vehicle Management
        </Typography>
      </Box>

      {/* Navigation */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}
      >
        <Tab icon={<DirectionsCarIcon />} iconPosition="start" label="Dashboard" />
        <Tab icon={<BuildIcon />} iconPosition="start" label="Maintenance" />
        <Tab icon={<NotificationsIcon />} iconPosition="start" label="Reminders" />
        <Tab icon={<ChatIcon />} iconPosition="start" label="Ask AI" />
      </Tabs>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: "auto", p: 3 }}>
        {tab === 0 && <Dashboard />}
        {tab === 1 && <Maintenance />}
        {tab === 2 && <Reminders />}
        {tab === 3 && <Chat />}
      </Box>
    </Box>
  );
}
