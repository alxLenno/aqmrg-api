export interface AqmReading {
    sensorId: string;
    manufacturer: string;
    timestamp: string;
    location: {
        lat?: number;
        lon?: number;
        name: string;
    };
    measurements: {
        pm1?: number;
        pm25: number;
        pm10: number;
        co?: number;
        co2?: number;
        temperature: number;
        humidity: number;
        voc_index?: number;
        nox_index?: number;
    };
}
