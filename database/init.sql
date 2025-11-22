-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    vin VARCHAR(17) UNIQUE NOT NULL,
    year INTEGER NOT NULL,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    trim VARCHAR(100),
    engine VARCHAR(100),
    transmission VARCHAR(100),
    drivetrain VARCHAR(50),
    color_exterior VARCHAR(50),
    color_interior VARCHAR(50),
    purchase_date DATE,
    purchase_mileage INTEGER,
    current_mileage INTEGER,
    last_mileage_update TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Maintenance records table
CREATE TABLE IF NOT EXISTS maintenance_records (
    id SERIAL PRIMARY KEY,
    vehicle_id INTEGER REFERENCES vehicles(id) NOT NULL,
    maintenance_type VARCHAR(100) NOT NULL,
    description TEXT,
    date_performed DATE NOT NULL,
    mileage INTEGER NOT NULL,
    cost DECIMAL(10, 2),
    parts_cost DECIMAL(10, 2),
    labor_cost DECIMAL(10, 2),
    service_provider VARCHAR(200),
    location VARCHAR(200),
    parts_used TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Reminders table
CREATE TABLE IF NOT EXISTS reminders (
    id SERIAL PRIMARY KEY,
    vehicle_id INTEGER REFERENCES vehicles(id) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    reminder_type VARCHAR(50) NOT NULL,
    due_date DATE,
    due_mileage INTEGER,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_interval_days INTEGER,
    recurrence_interval_miles INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notify_days_before INTEGER DEFAULT 7,
    notify_miles_before INTEGER DEFAULT 500,
    last_notified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Document chunks table for vector search
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(50),
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    page_number INTEGER,
    embedding vector(1536),
    tokens INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Maintenance logs table for CARFAX and manual service records
CREATE TABLE IF NOT EXISTS maintenance_logs (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    mileage INTEGER,
    service_type VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'maintenance',
    source VARCHAR(50) DEFAULT 'manual',
    location VARCHAR(300),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date, mileage, service_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin);
CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle ON maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_type ON maintenance_records(maintenance_type);
CREATE INDEX IF NOT EXISTS idx_maintenance_date ON maintenance_records(date_performed);
CREATE INDEX IF NOT EXISTS idx_reminders_vehicle ON reminders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_reminders_active ON reminders(is_active, is_completed);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_date ON maintenance_logs(date);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_category ON maintenance_logs(category);

-- Insert initial vehicle data (2018 Toyota 4Runner SR5 Premium)
INSERT INTO vehicles (
    vin, year, make, model, trim, engine, transmission, drivetrain,
    color_exterior, purchase_mileage, current_mileage
) VALUES (
    'JTEBU5JR2J5517128',
    2018,
    'Toyota',
    '4Runner',
    'SR5 Premium',
    '4.0L V6 DOHC 24V',
    '5-Speed Automatic',
    '4WD',
    'Super White',
    NULL,
    NULL
) ON CONFLICT (vin) DO NOTHING;
