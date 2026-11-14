import { useState } from "react";
import { Car, Wrench, Bell, Search, FileText } from "lucide-react";
import { ChatProvider } from "./ChatContext";
import ChatWidget from "./ChatWidget";
import Dashboard from "./Dashboard";
import Maintenance from "./Maintenance";
import Reminders from "./Reminders";
import Documents from "./Documents";
import SearchPage from "./Search";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Car },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "search", label: "Ask", icon: Search },
];

export function App() {
  const [activePage, setActivePage] = useState("dashboard");

  return (
    <ChatProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Navigation */}
        <nav className="bg-toyota-black text-white">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <button
                onClick={() => setActivePage("dashboard")}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <Car className="h-8 w-8 text-toyota-red" />
                <span className="text-xl font-bold">DriveIQ</span>
              </button>
              <div className="flex gap-1">
                {navItems.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActivePage(id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                      activePage === id
                        ? "bg-toyota-red text-white"
                        : "text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8">
          {activePage === "dashboard" && <Dashboard />}
          {activePage === "maintenance" && <Maintenance />}
          {activePage === "reminders" && <Reminders />}
          {activePage === "documents" && <Documents />}
          {activePage === "search" && <SearchPage />}
        </main>

        {/* Floating Chat Widget */}
        <ChatWidget />
      </div>
    </ChatProvider>
  );
}
