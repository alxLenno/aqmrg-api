-- Seeding data for AQMRG

INSERT INTO sensors (device_id, name, location_name, latitude, longitude, manufacturer)
VALUES
    ('AQM-001', 'Nairobi Central', 'Nairobi', -1.2833, 36.8167, 'Arduino-Custom'),
    ('AQM-002', 'Nairobi West', 'Nairobi', -1.3033, 36.7917, 'Arduino-Custom'),
    ('AQM-003', 'Nairobi East', 'Nairobi', -1.2733, 36.8817, 'Arduino-Custom'),
    ('AQM-004', 'Nairobi South', 'Nairobi', -1.3233, 36.8517, 'Arduino-Custom'),
    ('AQM-005', 'Karen', 'Nairobi', -1.3333, 36.7017, 'Arduino-Custom')
ON CONFLICT (device_id) DO NOTHING;
