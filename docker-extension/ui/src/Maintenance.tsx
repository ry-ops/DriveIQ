import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Plus, X, List, Clock, Upload, Paperclip, Trash2 } from "lucide-react";
import { maintenanceApi, vehicleApi, serviceRecordsApi } from "./api";
import { useChat } from "./ChatContext";
import type { Vehicle, MaintenanceRecord, ServiceRecord } from "./types";

interface CombinedRecord {
  id: number;
  maintenance_type: string;
  date_performed: string;
  mileage: number;
  description?: string | null;
  service_provider?: string | null;
  notes?: string | null;
  cost?: number | null;
  source: string;
  tags: string[];
  parts_used?: string;
}

export default function Maintenance() {
  const { openWithMessage } = useChat();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [allRecords, setAllRecords] = useState<CombinedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const v = await vehicleApi.get();
      setVehicle(v);

      const [records, serviceRecords] = await Promise.all([
        maintenanceApi.getAll(),
        serviceRecordsApi.getAll().catch(() => [] as ServiceRecord[]),
      ]);

      const combined: CombinedRecord[] = [
        ...(records?.map((r) => ({ ...r, source: "manual", tags: [] as string[] })) || []),
        ...(serviceRecords?.map((r) => ({
          id: r.id,
          maintenance_type: r.service_type,
          date_performed: r.date,
          mileage: r.mileage || 0,
          description: r.description,
          service_provider: r.location,
          notes: r.description,
          cost: null as number | null,
          source: r.source,
          tags: r.tags || [],
        })) || []),
      ].sort((a, b) => new Date(b.date_performed).getTime() - new Date(a.date_performed).getTime());

      setAllRecords(combined);
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!vehicle) return;
    const fd = new FormData(e.currentTarget);

    await maintenanceApi.create({
      vehicle_id: vehicle.id,
      maintenance_type: fd.get("type") as string,
      description: (fd.get("description") as string) || undefined,
      date_performed: fd.get("date") as string,
      mileage: parseInt(fd.get("mileage") as string),
      cost: fd.get("cost") ? parseFloat(fd.get("cost") as string) : undefined,
      service_provider: (fd.get("provider") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });

    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: number, source: string) {
    if (source === "manual") {
      await maintenanceApi.delete(id);
    } else {
      await serviceRecordsApi.delete(id);
    }
    loadData();
  }

  const handleAskAbout = (maintenanceType: string) => {
    const friendlyType = maintenanceType.replace(/_/g, " ");
    const vehicleInfo = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "my vehicle";
    openWithMessage(`Tell me about the ${friendlyType} procedure for ${vehicleInfo}. What are the steps, specifications, and any important tips?`);
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Maintenance Log</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md shadow-sm">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-l-md border ${viewMode === "list" ? "bg-gray-100 text-gray-900 border-gray-300" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}
            >
              <List className="h-4 w-4" />
              List
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${viewMode === "timeline" ? "bg-gray-100 text-gray-900 border-gray-300" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}
            >
              <Clock className="h-4 w-4" />
              Timeline
            </button>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700"
          >
            <Plus className="h-4 w-4" />
            Add Record
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">New Maintenance Record</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select name="type" required className="w-full px-3 py-2 border border-gray-300 rounded-md">
                  <optgroup label="Routine Maintenance">
                    <option value="oil_change">Oil Change</option>
                    <option value="tire_rotation">Tire Rotation</option>
                    <option value="air_filter">Air Filter</option>
                    <option value="cabin_filter">Cabin Air Filter</option>
                    <option value="wiper_blades">Wiper Blades</option>
                    <option value="inspection">Inspection</option>
                  </optgroup>
                  <optgroup label="Brakes">
                    <option value="brakes_checked">Brakes Checked</option>
                    <option value="brake_pads">Brake Pads</option>
                    <option value="brake_rotors">Brake Rotors</option>
                  </optgroup>
                  <optgroup label="Fluids">
                    <option value="transmission_service">Transmission Service</option>
                    <option value="coolant_flush">Coolant Flush</option>
                  </optgroup>
                  <optgroup label="Other">
                    <option value="battery">Battery</option>
                    <option value="diagnostic">Diagnostic</option>
                    <option value="other">Other</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input type="date" name="date" required defaultValue={format(new Date(), "yyyy-MM-dd")} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mileage *</label>
                <input type="number" name="mileage" required defaultValue={vehicle?.current_mileage || ""} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost ($)</label>
                <input type="number" name="cost" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Provider</label>
                <input type="text" name="provider" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" name="description" className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea name="notes" rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-toyota-red text-white rounded-md hover:bg-red-700">Save Record</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Records List */}
      <div className="space-y-3">
        {allRecords.length > 0 ? (
          allRecords.map((record, index) => (
            <div key={`${record.source}-${record.id}-${index}`} className="bg-white rounded-xl shadow-md border-l-4 border-gray-300 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 capitalize">
                      {record.maintenance_type.replace(/_/g, " ")}
                    </h3>
                    {record.cost != null && record.cost > 0 && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                        ${record.cost.toFixed(2)}
                      </span>
                    )}
                    {record.source !== "manual" && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                        {record.source}
                      </span>
                    )}
                  </div>
                  {record.description && (
                    <p className="text-sm text-gray-600 mb-1">{record.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{format(new Date(record.date_performed), "MMM d, yyyy")}</span>
                    <span>{record.mileage.toLocaleString()} mi</span>
                    {record.service_provider && <span>{record.service_provider}</span>}
                  </div>
                  {record.parts_used && (
                    <p className="text-xs text-gray-500 mt-1">Parts: {record.parts_used}</p>
                  )}
                  {record.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {record.tags.map((tag) => (
                        <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={() => handleAskAbout(record.maintenance_type)}
                    className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    Ask AI
                  </button>
                  <button
                    onClick={() => handleDelete(record.id, record.source)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No maintenance records yet. Add your first record above or import a CARFAX report.
          </div>
        )}
      </div>
    </div>
  );
}
