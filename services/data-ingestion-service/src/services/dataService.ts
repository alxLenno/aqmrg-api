import { Kafka } from 'kafkajs';
import Sensor from '../models/Sensor';
import Reading from '../models/Reading';

// Kafka Setup
const kafka = new Kafka({
    clientId: 'data-ingestion-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')
});
const producer = kafka.producer();

let isProducerConnected = false;

const connectProducer = async () => {
    try {
        await producer.connect();
        isProducerConnected = true;
        console.log('Kafka Producer connected successfully');
    } catch (error) {
        console.error('Failed to connect Kafka Producer:', error);
    }
};

connectProducer();

/**
 * Calculate air quality status based on Kenya Air Quality Regulations, 2024
 */
export const calculateStatus = (m: any): string => {
    const pm25 = m.pm25 ?? 0;
    const pm10 = m.pm10 ?? 0;
    const co = m.co ?? 0;

    if (pm25 > 75 || pm10 > 100 || co > 3.4) {
        return 'Danger';
    }
    if (pm25 > 55 || pm10 > 75 || co > 2.5) {
        return 'Warning';
    }
    if (pm25 > 35 || pm10 > 50 || co > 1.7) {
        return 'Moderate';
    }
    return 'Good';
};

/**
 * Process and save normalized sensor data
 */
export const processIngestion = async (reading: any) => {
    const measurementsWithStatus = {
        ...reading.measurements,
        status: calculateStatus(reading.measurements)
    };

    // Heartbeat tracking: UPSERT sensor record
    const sensor = await Sensor.findOneAndUpdate(
        { device_id: reading.sensorId },
        {
            device_id: reading.sensorId,
            name: reading.name || `Device ${reading.sensorId.slice(-4)}`,
            location_name: reading.location?.name || 'Unknown',
            manufacturer: reading.manufacturer || 'Arduino-Custom',
            latitude: reading.location?.latitude !== undefined ? reading.location.latitude : null,
            longitude: reading.location?.longitude !== undefined ? reading.location.longitude : null,
            last_seen: new Date(),
            last_readings: measurementsWithStatus,
            controller_id: reading.controllerId || null,
            hardware_details: reading.hardware || null
        },
        { upsert: true, new: true }
    );

    if (sensor) {
        const m = reading.measurements;
        const timestamp = reading.timestamp ? new Date(reading.timestamp) : new Date();
        
        // Record historical reading in MongoDB
        const newReading = new Reading({
            sensor_id: sensor._id,
            recorded_at: timestamp,
            pm1: m.pm1 ?? null,
            pm25: m.pm25 ?? null,
            pm10: m.pm10 ?? null,
            co: m.co ?? null,
            co2: m.co2 ?? null,
            temperature: m.temperature ?? null,
            humidity: m.humidity ?? null,
            voc_index: m.voc_index ?? null,
            nox_index: m.nox_index ?? null,
            status: measurementsWithStatus.status
        });

        await newReading.save();

        // Broadcast to Kafka for real-time processing
        if (isProducerConnected) {
            try {
                const kafkaPayload = {
                    ...reading,
                    id: newReading._id,
                    db_sensor_id: sensor._id,
                    status: measurementsWithStatus.status,
                    ingested_at: new Date().toISOString()
                };
                
                await producer.send({
                    topic: process.env.KAFKA_TOPIC_SENSOR_RAW || 'sensor.raw.airquality',
                    messages: [{ value: JSON.stringify(kafkaPayload) }],
                });
                console.log(`Successfully published sensor data for ${reading.sensorId} to Kafka`);
            } catch (kErr) {
                console.error('Kafka publishing failed:', kErr);
            }
        }

        return { sensor, reading: newReading };
    }
    
    throw new Error('Failed to create or update sensor record');
};
