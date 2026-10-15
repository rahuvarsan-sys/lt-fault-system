CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE transformer_data_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  voltage_r DOUBLE,
  voltage_y DOUBLE,
  voltage_b DOUBLE,
  current_r DOUBLE,
  current_y DOUBLE,
  current_b DOUBLE,
  active_power DOUBLE,
  reactive_power DOUBLE,
  apparent_power DOUBLE,
  power_factor DOUBLE,
  frequency DOUBLE,
  energy_kwh DOUBLE,
  load_percent DOUBLE,
  temperature DOUBLE,
  health_index DOUBLE
);

CREATE TABLE fault_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  fault_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  description TEXT,
  location VARCHAR(100),
  distance_km INT
);

CREATE TABLE location_nodes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  distance_km DOUBLE NOT NULL
);

CREATE TABLE alerts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  location VARCHAR(100),
  nearest_node VARCHAR(100)
);

CREATE TABLE energy_consumption_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  energy_kwh DOUBLE NOT NULL,
  load_percent DOUBLE NOT NULL
);
