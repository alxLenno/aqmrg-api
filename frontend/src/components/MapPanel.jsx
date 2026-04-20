import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTheme } from '../context/ThemeContext';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon issues in Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = DefaultIcon;

import { discoverMetrics, formatMetricLabel, getMetricUnit } from '../utils/metrics';

/**
 * Component to auto-fit the map to contain all sensor markers
 */
function ChangeView({ sensors }) {
    const map = useMap();
    useEffect(() => {
        if (sensors && sensors.length > 0) {
            const bounds = L.latLngBounds(sensors.map(s => [s.latitude, s.longitude]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
    }, [sensors, map]);
    return null;
}

export default function MapPanel({ sensors, loading }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    
    // Discover relevant metrics for popups
    const activeMetricKeys = discoverMetrics(sensors);

    // CartoDB Tile Layers
    const lightTiles = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    const darkTiles = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    const getStatusColor = (pm25) => {
        if (!pm25 && pm25 !== 0) return '#64748b'; // Gray
        if (pm25 <= 35) return '#22c55e'; // Green
        if (pm25 <= 55) return '#f59e0b'; // Amber
        if (pm25 <= 75) return '#f97316'; // Orange
        return '#ef4444'; // Red
    };

    const getAQICategory = (pm25) => {
        if (!pm25 && pm25 !== 0) return 'offline';
        if (pm25 <= 12) return 'good';
        if (pm25 <= 35) return 'moderate';
        if (pm25 <= 55) return 'usg';
        return 'unhealthy';
    };

    const getCustomIcon = (sensor) => {
        const pm25 = sensor.readings?.pm25;
        const category = getAQICategory(pm25);
        const isOnline = sensor.is_online;
        
        return L.divIcon({
            className: 'custom-leaflet-icon',
            html: `
                <div class="custom-marker-container">
                    <div class="marker-pulse ${category} ${isOnline ? 'active' : ''}"></div>
                    <div class="marker-dot ${category}"></div>
                </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12]
        });
    };

    if (loading && (!sensors || sensors.length === 0)) {
        return (
            <div className="card map-card loading">
                <div className="discovery-spinner"></div>
                <p>Initializing Geographic Services...</p>
            </div>
        );
    }

    return (
        <div className="card map-card animate-fade-in">
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="brand-icon" style={{ width: '32px', height: '32px', borderRadius: '8px' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                        </svg>
                    </div>
                    <h3>Network Geographic Overlook</h3>
                </div>
                <span className="card-badge model-badge">{sensors.length} Active Nodes</span>
            </div>

            <div className="map-container-wrapper">
                <MapContainer 
                    center={[-1.286389, 36.817223]} // Default to Nairobi
                    zoom={12} 
                    style={{ height: '500px', width: '100%', borderRadius: '12px' }}
                    scrollWheelZoom={false}
                >
                    <TileLayer
                        url={isDark ? darkTiles : lightTiles}
                        attribution={attribution}
                    />
                    
                    <ChangeView sensors={sensors} />

                    {sensors.map((sensor) => {
                        const readings = sensor.readings || {};
                        const pm25 = readings.pm25;
                        const statusColor = getStatusColor(pm25);
                        const customIcon = getCustomIcon(sensor);
                        
                        return (
                            <Marker 
                                key={sensor.id} 
                                position={[sensor.latitude, sensor.longitude]}
                                icon={customIcon}
                            >
                                <Popup className="custom-popup">
                                    <div className="map-popup-content">
                                        <div className="popup-header">
                                            <span className="popup-node-status" style={{ background: sensor.is_online ? '#22c55e' : '#ef4444' }}></span>
                                            <strong>{sensor.name}</strong>
                                        </div>
                                        <div className="popup-id">{sensor.device_id}</div>
                                        
                                        <div className="popup-grid">
                                            {activeMetricKeys.slice(0, 6).map(key => (
                                              <div key={key} className="popup-stat">
                                                  <label>{formatMetricLabel(key)}:</label>
                                                  <span style={key === 'pm25' ? { color: statusColor } : {}}>
                                                    {readings[key] ?? '--'}
                                                    <small>{getMetricUnit(key)}</small>
                                                  </span>
                                              </div>
                                            ))}
                                        </div>

                                        
                                        <div className="popup-footer">
                                            <span className="tag-location">{sensor.location_name}</span>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );
}

