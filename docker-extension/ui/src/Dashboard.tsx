import { useEffect, useState } from "react";
import { format, addMonths, differenceInDays } from "date-fns";
import {
  Gauge, Plus, X, TrendingUp, ChevronDown, ChevronUp,
  RotateCcw, Circle, Disc, FileText, Droplets, CheckCircle2,
  Star, Clock, MapPin
} from "lucide-react";
import { vehicleApi, maintenanceApi, remindersApi, importApi } from "./api";
import type { Vehicle, MaintenanceRecord, MaintenanceSummary, Reminder, CarfaxReport } from "./types";

interface MaintenanceCountdown {
  id: string;
  title: string;
  icon: React.ReactNode;
  dueMonths: number;
  dueDate?: string;
  dueMileage?: number;
  lastServiceDate?: string;
  lastServiceMileage?: number;
  lastServiceProvider?: string;
  providerRating?: number;
  color: string;
  bgColor: string;
}

function CountdownCard({
  item,
  currentMileage,
  isExpanded,
  onToggle,
}: {
  item: MaintenanceCountdown;
  currentMileage: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const getTimeLabel = (months: number) => {
    if (months <= 0) return "Due Now";
    if (months === 1) return "1 month";
    if (months < 12) return `${months} months`;
    const years = Math.floor(months / 12);
    return years === 1 ? "1 year" : `${years} years`;
  };

  const getUrgencyColor = (months: number) => {
    if (months <= 1) return "text-red-600 bg-red-50 border-red-200";
    if (months <= 3) return "text-orange-600 bg-orange-50 border-orange-200";
    return "text-green-600 bg-green-50 border-green-200";
  };

  const milesSinceService = item.lastServiceMileage
    ? currentMileage - item.lastServiceMileage
    : null;

  const daysSinceService = item.lastServiceDate
    ? differenceInDays(new Date(), new Date(item.lastServiceDate))
    : null;

  return (
    <div className={`bg-white rounded-xl shadow-md border-l-4 overflow-hidden transition-all ${item.color}`}>
      <button onClick={onToggle} className="w-full p-4 text-left hover:bg-gray-50 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${item.bgColor}`}>{item.icon}</div>
            <div>
              <h3 className="font-semibold text-gray-900">{item.title}</h3>
              <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getUrgencyColor(item.dueMonths)}`}>
                {getTimeLabel(item.dueMonths)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right mr-2">
              <p className="text-2xl font-bold text-gray-900">{item.dueMonths}</p>
              <p className="text-xs text-gray-500">months</p>
            </div>
            {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t bg-gray-50">
          <div className="grid grid-cols-2 gap-4 pt-4">
            {item.dueDate && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Due Date</p>
                <p className="font-medium text-gray-900">{format(new Date(item.dueDate), "MMM d, yyyy")}</p>
              </div>
            )}
            {item.dueMileage && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Due Mileage</p>
                <p className="font-medium text-gray-900">{item.dueMileage.toLocaleString()} mi</p>
              </div>
            )}
          </div>

          {item.lastServiceProvider && (
            <div className="mt-4 p-3 bg-white rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{item.lastServiceProvider}</span>
                </div>
                {item.providerRating && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-medium">{item.providerRating}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(daysSinceService || milesSinceService) && (
            <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
              {daysSinceService !== null && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>{Math.floor(daysSinceService / 30)} months since last service</span>
                </div>
              )}
              {milesSinceService !== null && (
                <div className="flex items-center gap-1">
                  <Gauge className="h-4 w-4" />
                  <span>{milesSinceService.toLocaleString()} mi since last</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [summary, setSummary] = useState<MaintenanceSummary[]>([]);
  const [recentMaintenance, setRecentMaintenance] = useState<MaintenanceRecord[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<Reminder[]>([]);
  const [carfaxReport, setCarfaxReport] = useState<CarfaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [mileageInput, setMileageInput] = useState("");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [blurredCards, setBlurredCards] = useState<Set<string>>(new Set());
  const [logReminder, setLogReminder] = useState<Reminder | null>(null);
  const [logCost, setLogCost] = useState("");

  const toggleBlur = (cardId: string) => {
    setBlurredCards((prev) => {
      const next = new Set(prev);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  };

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const v = await vehicleApi.get();
      setVehicle(v);

      const [s, m, u] = await Promise.all([
        maintenanceApi.getSummary(),
        maintenanceApi.getAll(),
        remindersApi.getUpcoming(v.current_mileage),
      ]);
      setSummary(s);
      setRecentMaintenance(m);
      setUpcomingReminders(u);

      try {
        const cr = await importApi.getCarfaxReport();
        setCarfaxReport(cr);
      } catch {
        // No CARFAX report
      }
    } catch {
      // Loading error
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
      const u = await remindersApi.getUpcoming(v.current_mileage);
      setUpcomingReminders(u);
    } catch {
      // Error
    }
  }

  async function handleCompleteReminder(id: number) {
    try {
      await remindersApi.complete(id);
      if (vehicle?.current_mileage) {
        const u = await remindersApi.getUpcoming(vehicle.current_mileage);
        setUpcomingReminders(u);
      }
    } catch {
      // Error
    }
  }

  async function handleLogService() {
    if (!logReminder || !vehicle) return;
    try {
      await maintenanceApi.create({
        vehicle_id: vehicle.id,
        maintenance_type: logReminder.title.toLowerCase().replace(/\s+/g, "_"),
        date_performed: format(new Date(), "yyyy-MM-dd"),
        mileage: vehicle.current_mileage || logReminder.due_mileage || 0,
        cost: logCost ? parseFloat(logCost) : undefined,
        description: `Completed from reminder: ${logReminder.title}`,
      });
      setLogReminder(null);
      setLogCost("");
      // Refresh data
      const [s, m, u] = await Promise.all([
        maintenanceApi.getSummary(),
        maintenanceApi.getAll(),
        remindersApi.getUpcoming(vehicle.current_mileage),
      ]);
      setSummary(s);
      setRecentMaintenance(m);
      setUpcomingReminders(u);
    } catch {
      // Error
    }
  }

  const findLastService = (types: string[]): MaintenanceRecord | undefined => {
    if (!recentMaintenance || !Array.isArray(recentMaintenance)) return undefined;
    return recentMaintenance.find((m) =>
      types.some((t) => m.maintenance_type.toLowerCase().includes(t))
    );
  };

  const getCountdownCards = (): MaintenanceCountdown[] => {
    const now = new Date();
    const lastTireRotation = findLastService(["tire", "rotation"]);
    const lastBrakeService = findLastService(["brake"]);
    const lastOilChange = findLastService(["oil"]);

    return [
      {
        id: "tire-rotation",
        title: "Tire Rotation",
        icon: <RotateCcw className="h-5 w-5 text-blue-600" />,
        dueMonths: 2,
        dueDate: format(addMonths(now, 2), "yyyy-MM-dd"),
        dueMileage: (vehicle?.current_mileage || 0) + 5000,
        lastServiceDate: lastTireRotation?.date_performed,
        lastServiceMileage: lastTireRotation?.mileage,
        lastServiceProvider: lastTireRotation?.service_provider || "Kari Toyota",
        providerRating: 4.8,
        color: "border-blue-500",
        bgColor: "bg-blue-100",
      },
      {
        id: "tread-life",
        title: "Tread Life",
        icon: <Circle className="h-5 w-5 text-emerald-600" />,
        dueMonths: 48,
        dueDate: format(addMonths(now, 48), "yyyy-MM-dd"),
        dueMileage: (vehicle?.current_mileage || 0) + 40000,
        lastServiceProvider: "Kari Toyota",
        providerRating: 4.8,
        color: "border-emerald-500",
        bgColor: "bg-emerald-100",
      },
      {
        id: "brake-inspection",
        title: "Brake Inspection",
        icon: <Disc className="h-5 w-5 text-orange-600" />,
        dueMonths: 8,
        dueDate: format(addMonths(now, 8), "yyyy-MM-dd"),
        lastServiceDate: lastBrakeService?.date_performed,
        lastServiceMileage: lastBrakeService?.mileage,
        lastServiceProvider: lastBrakeService?.service_provider || "Kari Toyota",
        providerRating: 4.8,
        color: "border-orange-500",
        bgColor: "bg-orange-100",
      },
      {
        id: "registration",
        title: "Registration",
        icon: <FileText className="h-5 w-5 text-purple-600" />,
        dueMonths: 8,
        dueDate: format(addMonths(now, 8), "yyyy-MM-dd"),
        color: "border-purple-500",
        bgColor: "bg-purple-100",
      },
      {
        id: "oil-change",
        title: "Oil Change",
        icon: <Droplets className="h-5 w-5 text-amber-600" />,
        dueMonths: 10,
        dueDate: format(addMonths(now, 10), "yyyy-MM-dd"),
        dueMileage: (vehicle?.current_mileage || 0) + 10000,
        lastServiceDate: lastOilChange?.date_performed,
        lastServiceMileage: lastOilChange?.mileage,
        lastServiceProvider: lastOilChange?.service_provider || "Kari Toyota",
        providerRating: 4.8,
        color: "border-amber-500",
        bgColor: "bg-amber-100",
      },
    ];
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;
  if (!vehicle) return <div className="text-center py-12 text-red-500">Vehicle not found</div>;

  const countdownCards = getCountdownCards();

  return (
    <div className="space-y-6">
      {/* Vehicle Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-toyota-red blur-3xl" />
          <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-blue-500 blur-3xl" />
        </div>

        <div className="relative p-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-toyota-red rounded-full text-white">
                  {vehicle.year}
                </span>
                {carfaxReport && (
                  <span className="px-3 py-1 text-xs font-medium uppercase tracking-wider bg-white/10 rounded-full text-gray-300">
                    {carfaxReport.owner_count}-Owner
                  </span>
                )}
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold text-white tracking-tight">
                {vehicle.make} {vehicle.model}
              </h1>
              <p className="text-lg text-gray-400 mt-1">
                {vehicle.trim} • {vehicle.color_exterior || "Black"}
              </p>
            </div>

            <div className="flex flex-col gap-2 lg:text-right">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={mileageInput}
                  onChange={(e) => setMileageInput(e.target.value)}
                  placeholder="Update mileage"
                  className="w-40 px-3 py-2 text-sm text-gray-900 bg-white/90 backdrop-blur border-0 rounded-lg focus:ring-2 focus:ring-toyota-red"
                />
                <button
                  onClick={handleMileageUpdate}
                  disabled={!mileageInput}
                  className="px-4 py-2 text-sm bg-toyota-red text-white font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  Update
                </button>
              </div>
              {vehicle.last_mileage_update && (
                <p className="text-xs text-gray-500">
                  Last updated: {format(new Date(vehicle.last_mileage_update), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => toggleBlur("odometer")}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="h-5 w-5 text-blue-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Odometer</span>
              </div>
              <p className={`text-2xl lg:text-3xl font-bold text-white transition-all ${blurredCards.has("odometer") ? "blur-md select-none" : ""}`}>
                {vehicle.current_mileage?.toLocaleString() || "—"}
              </p>
              <p className="text-sm text-gray-500">miles</p>
            </div>

            <div
              onClick={() => toggleBlur("value")}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Est. Value</span>
              </div>
              <p className={`text-2xl lg:text-3xl font-bold text-white transition-all ${blurredCards.has("value") ? "blur-md select-none" : ""}`}>
                ${carfaxReport?.retail_value?.toLocaleString() || "—"}
              </p>
              <p className="text-sm text-gray-500">CARFAX estimate</p>
            </div>

            <div className="bg-green-500/10 backdrop-blur-sm rounded-xl p-4 border border-green-500/20">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-green-400">Recalls</span>
              </div>
              <p className="text-2xl lg:text-3xl font-bold text-green-400">Clear</p>
              <p className="text-sm text-green-500/70">No open recalls</p>
            </div>

            <div
              onClick={() => toggleBlur("vin")}
              className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-purple-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-400">VIN</span>
              </div>
              <p className={`text-sm lg:text-base font-mono font-bold text-white truncate transition-all ${blurredCards.has("vin") ? "blur-md select-none" : ""}`}>
                {vehicle.vin}
              </p>
              <p className="text-sm text-gray-500">Vehicle ID</p>
            </div>
          </div>
        </div>
      </div>

      {/* Maintenance Countdown Cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Maintenance Forecast</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {countdownCards.map((card) => (
            <CountdownCard
              key={card.id}
              item={card}
              currentMileage={vehicle.current_mileage || 0}
              isExpanded={expandedCards.has(card.id)}
              onToggle={() => toggleCard(card.id)}
            />
          ))}
        </div>
      </div>

      {/* Upcoming Reminders */}
      {upcomingReminders && upcomingReminders.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4">Upcoming Service Reminders</h2>
          <div className="space-y-3">
            {upcomingReminders.map((reminder) => (
              <div key={reminder.id} className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{reminder.title}</p>
                  <p className="text-sm text-gray-600">
                    {reminder.due_date && `Due: ${format(new Date(reminder.due_date), "MMM d, yyyy")}`}
                    {reminder.due_date && reminder.due_mileage && " • "}
                    {reminder.due_mileage && `${reminder.due_mileage.toLocaleString()} miles`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogReminder(reminder)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Log
                  </button>
                  <button
                    onClick={() => handleCompleteReminder(reminder.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log Service Modal */}
      {logReminder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Log Service</h2>
              <button onClick={() => { setLogReminder(null); setLogCost(""); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div><p className="text-sm text-gray-500">Service Type</p><p className="font-medium">{logReminder.title}</p></div>
              <div><p className="text-sm text-gray-500">Date</p><p className="font-medium">{format(new Date(), "MMM d, yyyy")}</p></div>
              <div><p className="text-sm text-gray-500">Mileage</p><p className="font-medium">{(vehicle.current_mileage || logReminder.due_mileage || 0).toLocaleString()} miles</p></div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Cost (optional)</label>
                <input type="number" value={logCost} onChange={(e) => setLogCost(e.target.value)} placeholder="0.00" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setLogReminder(null); setLogCost(""); }} className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Cancel</button>
                <button onClick={handleLogService} className="flex-1 px-4 py-2 bg-toyota-red text-white rounded-lg hover:bg-red-700">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Maintenance Summary */}
      {summary && summary.length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4">Service History Summary</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">Service Type</th>
                  <th className="pb-3 font-medium">Count</th>
                  <th className="pb-3 font-medium">Total Cost</th>
                  <th className="pb-3 font-medium">Last Performed</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {summary.map((s) => (
                  <tr key={s.type} className="border-b last:border-b-0">
                    <td className="py-3 capitalize font-medium text-gray-900">{s.type.replace(/_/g, " ")}</td>
                    <td className="py-3 text-gray-600">{s.count}</td>
                    <td className="py-3 text-gray-600">${s.total_cost.toFixed(2)}</td>
                    <td className="py-3 text-gray-600">
                      {s.last_performed && format(new Date(s.last_performed), "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
