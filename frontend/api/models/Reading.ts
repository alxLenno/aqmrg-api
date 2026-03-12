import mongoose, { Schema, Document } from 'mongoose';

export interface IReading extends Document {
    sensor_id: mongoose.Types.ObjectId;
    recorded_at: Date;
    pm1?: number;
    pm25?: number;
    pm10?: number;
    co?: number;
    co2?: number;
    temperature?: number;
    humidity?: number;
    voc_index?: number;
    nox_index?: number;
    status: string;
}

const ReadingSchema: Schema = new Schema({
    sensor_id: { type: Schema.Types.ObjectId, ref: 'Sensor', required: true },
    recorded_at: { type: Date, default: Date.now },
    pm1: { type: Number, default: null },
    pm25: { type: Number, default: null },
    pm10: { type: Number, default: null },
    co: { type: Number, default: null },
    co2: { type: Number, default: null },
    temperature: { type: Number, default: null },
    humidity: { type: Number, default: null },
    voc_index: { type: Number, default: null },
    nox_index: { type: Number, default: null },
    status: { type: String, default: 'Good' }
}, {
    timestamps: true
});

ReadingSchema.index({ recorded_at: -1 });

export default mongoose.models.Reading || mongoose.model<IReading>('Reading', ReadingSchema);
