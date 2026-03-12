import mongoose, { Schema, Document } from 'mongoose';

export interface ISensor extends Document {
    device_id: string;
    name: string;
    location_name: string;
    manufacturer: string;
    latitude?: number;
    longitude?: number;
    last_seen: Date;
    last_readings: any;
    controller_id: string;
    hardware_details: any;
}

const SensorSchema: Schema = new Schema({
    device_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    location_name: { type: String, default: 'Unknown' },
    manufacturer: { type: String, default: 'Arduino-Custom' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    last_seen: { type: Date, default: Date.now },
    last_readings: { type: Schema.Types.Mixed, default: {} },
    controller_id: { type: String, default: null },
    hardware_details: { type: Schema.Types.Mixed, default: null }
}, {
    timestamps: true
});

export default mongoose.models.Sensor || mongoose.model<ISensor>('Sensor', SensorSchema);
