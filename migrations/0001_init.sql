-- DriveIQ v2 starting schema. One owner, one vehicle (the first row in
-- `vehicles`), its service history, reminders, and what Aiana needs.

CREATE TABLE vehicles (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	vin TEXT UNIQUE,               -- optional
	year INTEGER NOT NULL,
	make TEXT NOT NULL,
	model TEXT NOT NULL,
	trim TEXT,
	engine TEXT,
	transmission TEXT,
	drivetrain TEXT,
	color_exterior TEXT,
	color_interior TEXT,
	purchase_date TEXT,
	purchase_mileage INTEGER,
	current_mileage INTEGER,
	last_mileage_update TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT
);

CREATE TABLE maintenance_records (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
	maintenance_type TEXT NOT NULL,
	description TEXT,
	date_performed TEXT NOT NULL,
	mileage INTEGER NOT NULL,
	cost REAL,
	parts_cost REAL,
	labor_cost REAL,
	service_provider TEXT,
	location TEXT,
	parts_used TEXT,   -- JSON-encoded string
	notes TEXT,
	documents TEXT,    -- JSON-encoded array of file names
	photos TEXT,       -- JSON-encoded array of photo objects
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT
);
CREATE INDEX idx_maintenance_vehicle_id ON maintenance_records(vehicle_id);
CREATE INDEX idx_maintenance_date_performed ON maintenance_records(date_performed);
CREATE INDEX idx_maintenance_type ON maintenance_records(maintenance_type);

CREATE TABLE reminders (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
	title TEXT NOT NULL,
	description TEXT,
	reminder_type TEXT NOT NULL, -- mileage | date | both
	category TEXT,               -- appointment | reminder
	maintenance_type TEXT,       -- links a reminder to a schedule row
	due_date TEXT,
	due_mileage INTEGER,
	is_recurring INTEGER NOT NULL DEFAULT 0,
	recurrence_interval_days INTEGER,
	recurrence_interval_miles INTEGER,
	is_active INTEGER NOT NULL DEFAULT 1,
	is_completed INTEGER NOT NULL DEFAULT 0,
	completed_at TEXT,
	notify_days_before INTEGER NOT NULL DEFAULT 7,
	notify_miles_before INTEGER NOT NULL DEFAULT 500,
	last_notified TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT
);
CREATE INDEX idx_reminders_vehicle_id ON reminders(vehicle_id);
CREATE INDEX idx_reminders_active ON reminders(is_active, is_completed);

-- The maintenance schedule the forecast and Aiana use. Starts with general
-- intervals; every vehicle differs, so the owner edits it to match their
-- owner's manual (Settings page, or PUT /api/schedule/:type).
CREATE TABLE maintenance_schedule (
	type TEXT PRIMARY KEY,         -- slug used by records and reminders, e.g. oil_change
	name TEXT NOT NULL,
	interval_miles INTEGER,
	interval_months INTEGER,
	sort_order INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT
);
INSERT INTO maintenance_schedule (type, name, interval_miles, interval_months, sort_order) VALUES
	('oil_change', 'Oil & Filter Change', 5000, 6, 10),
	('tire_rotation', 'Tire Rotation', 5000, 6, 20),
	('cabin_filter', 'Cabin Air Filter', 15000, 12, 30),
	('wiper_blades', 'Wiper Blades', 15000, 12, 40),
	('air_filter', 'Engine Air Filter', 30000, 36, 50),
	('brake_fluid', 'Brake Fluid', 30000, 36, 60),
	('brake_pads_front', 'Front Brake Pads', 40000, 48, 70),
	('brake_pads_rear', 'Rear Brake Pads', 50000, 60, 80),
	('battery', 'Battery', 50000, 48, 90),
	('transmission_fluid', 'Transmission Fluid', 60000, 72, 100),
	('coolant', 'Engine Coolant', 100000, 120, 110),
	('spark_plugs', 'Spark Plugs', 100000, 120, 120),
	('drive_belt', 'Drive Belt', 100000, 120, 130);

-- Exact specs the owner has confirmed (oil type and capacity, tire size, part
-- numbers). Aiana prefers these over anything it finds in documents.
CREATE TABLE vehicle_specs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
	maintenance_type TEXT NOT NULL,
	spec_text TEXT NOT NULL,
	part_number TEXT,
	source_note TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT,
	UNIQUE(vehicle_id, maintenance_type)
);

-- Recalls from NHTSA's public recall lookup (POST /api/recalls/check).
CREATE TABLE recalls (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
	nhtsa_campaign TEXT NOT NULL UNIQUE,
	component TEXT NOT NULL,
	summary TEXT NOT NULL,
	consequence TEXT,
	remedy TEXT,
	report_receipt_date TEXT,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'remedied')),
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT
);

-- Aiana's conversation: one shared thread, reset after a few idle hours.
CREATE TABLE aiana_messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
	content TEXT NOT NULL,
	sources TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_aiana_messages_created_at ON aiana_messages(created_at);

-- Documents Aiana can search. Vectorize deletes by id only, so each chunk's id
-- is <hash of name>:<chunk number> and this table records the chunk count.
CREATE TABLE documents (
	name TEXT PRIMARY KEY,
	chunk_count INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
