CREATE DATABASE IF NOT EXISTS iot_data;

use iot_data;

CREATE TABLE IF NOT EXISTS charging_order (
  idTag String,
  connectorId String,
  transactionId String,
  startTimestamp DateTime,
  endTimestamp DateTime,
  duration UInt64,
  reservationId Nullable(String),
  stackLevel UInt8,
  meterStart Float64,
  meterStop Float64,
  meter Float64,
  stopReason String
) ENGINE = MergeTree()
ORDER BY transactionId
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS charging_record (
  connectorId String,
  transactionId String,
  timestamp DateTime,
  voltage UInt16,
  currentInput Float64,
  power UInt16,
  meter Float64,
  currentTemperature UInt8
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (transactionId, timestamp)
SETTINGS index_granularity = 8192;
