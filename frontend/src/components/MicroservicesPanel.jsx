import { useState } from 'react'

// Route through backend - frontend -> nginx -> backend -> gateway -> microservice
const API_BASE = ''  // Relative path, nginx proxies to backend

const services = [
    { id: 'go', name: 'Go Service', port: 3001, storage: 'MongoDB', color: '#00ADD8' },
    { id: 'java', name: 'Java Service', port: 3002, storage: 'Kafka', color: '#ED8B00' },
    { id: 'python', name: 'Python Service', port: 3003, storage: 'MongoDB', color: '#3776AB' },
    { id: 'node', name: 'Node Service', port: 3004, storage: 'Kafka', color: '#339933' }
]

function MicroservicesPanel() {
    const [serviceStatus, setServiceStatus] = useState({})
    const [loading, setLoading] = useState({})
    const [connectivityResults, setConnectivityResults] = useState({})

    const checkServiceHealth = async (serviceId) => {
        setLoading(prev => ({ ...prev, [serviceId]: true }))
        try {
            const start = Date.now()
            // Route through backend: /api/microservices/{serviceId}/health
            const response = await fetch(`${API_BASE}/api/microservices/${serviceId}/health`)
            const latency = Date.now() - start

            if (response.ok) {
                const data = await response.json()
                setServiceStatus(prev => ({
                    ...prev,
                    [serviceId]: { status: 'UP', latency: `${latency}ms`, ...data }
                }))
            } else {
                setServiceStatus(prev => ({
                    ...prev,
                    [serviceId]: { status: 'DOWN', error: `HTTP ${response.status}` }
                }))
            }
        } catch (err) {
            setServiceStatus(prev => ({
                ...prev,
                [serviceId]: { status: 'DOWN', error: err.message }
            }))
        }
        setLoading(prev => ({ ...prev, [serviceId]: false }))
    }

    const checkConnectivity = async (serviceId, checkType) => {
        const key = `${serviceId}-${checkType}`
        setLoading(prev => ({ ...prev, [key]: true }))

        try {
            // Route through backend: /api/microservices/{serviceId}/check-{storage|services}
            const storageType = services.find(s => s.id === serviceId).storage.toLowerCase()
            const endpoint = checkType === 'storage'
                ? `${API_BASE}/api/microservices/${serviceId}/check-${storageType}`
                : `${API_BASE}/api/microservices/${serviceId}/check-services`

            const response = await fetch(endpoint)
            const data = await response.json()

            setConnectivityResults(prev => ({
                ...prev,
                [key]: { success: response.ok, data }
            }))
        } catch (err) {
            setConnectivityResults(prev => ({
                ...prev,
                [key]: { success: false, error: err.message }
            }))
        }

        setLoading(prev => ({ ...prev, [key]: false }))
    }

    const checkAllServices = async () => {
        for (const service of services) {
            await checkServiceHealth(service.id)
        }
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'UP': return '#10b981'
            case 'DOWN': return '#ef4444'
            case 'DEGRADED': return '#f59e0b'
            default: return '#6b7280'
        }
    }

    return (
        <div className="microservices-panel">
            <div className="panel-header">
                <h2>🔌 Microservices</h2>
                <button className="refresh-all-btn" onClick={checkAllServices}>
                    Refresh All
                </button>
            </div>

            <div className="services-grid">
                {services.map(service => {
                    const status = serviceStatus[service.id]
                    const storageKey = `${service.id}-storage`
                    const servicesKey = `${service.id}-services`

                    return (
                        <div
                            key={service.id}
                            className="service-card"
                            style={{ borderLeftColor: service.color }}
                        >
                            <div className="service-header">
                                <span className="service-name">{service.name}</span>
                                <span
                                    className="status-badge"
                                    style={{ backgroundColor: getStatusColor(status?.status) }}
                                >
                                    {status?.status || 'UNKNOWN'}
                                </span>
                            </div>

                            <div className="service-info">
                                <span>Port: {service.port}</span>
                                <span>Storage: {service.storage}</span>
                                {status?.latency && <span>Latency: {status.latency}</span>}
                                {status?.uptime && <span>Uptime: {status.uptime}</span>}
                            </div>

                            {status?.error && (
                                <div className="error-msg">{status.error}</div>
                            )}

                            <div className="service-actions">
                                <button
                                    onClick={() => checkServiceHealth(service.id)}
                                    disabled={loading[service.id]}
                                    className="action-btn health-btn"
                                >
                                    {loading[service.id] ? '...' : '🏥 Health'}
                                </button>

                                <button
                                    onClick={() => checkConnectivity(service.id, 'storage')}
                                    disabled={loading[storageKey]}
                                    className="action-btn storage-btn"
                                >
                                    {loading[storageKey] ? '...' : `🔌 ${service.storage}`}
                                </button>

                                <button
                                    onClick={() => checkConnectivity(service.id, 'services')}
                                    disabled={loading[servicesKey]}
                                    className="action-btn services-btn"
                                >
                                    {loading[servicesKey] ? '...' : '🔗 Peers'}
                                </button>
                            </div>

                            {connectivityResults[storageKey] && (
                                <div className={`connectivity-result ${connectivityResults[storageKey].success ? 'success' : 'error'}`}>
                                    <strong>{service.storage}:</strong> {connectivityResults[storageKey].data?.status || 'Error'}
                                    {connectivityResults[storageKey].data?.latency && ` (${connectivityResults[storageKey].data.latency})`}
                                </div>
                            )}

                            {connectivityResults[servicesKey] && (
                                <div className="connectivity-result">
                                    <strong>Peers:</strong>
                                    {connectivityResults[servicesKey].data?.services &&
                                        Object.entries(connectivityResults[servicesKey].data.services).map(([name, info]) => (
                                            <span
                                                key={name}
                                                className={`peer-status ${info.status === 'UP' ? 'up' : 'down'}`}
                                            >
                                                {name}: {info.status}
                                            </span>
                                        ))
                                    }
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            <style>{`
        .microservices-panel {
          background: rgba(30, 41, 59, 0.8);
          border-radius: 16px;
          padding: 24px;
          margin-top: 24px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .panel-header h2 {
          margin: 0;
          color: #f1f5f9;
          font-size: 1.5rem;
        }

        .refresh-all-btn {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          font-weight: 600;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .refresh-all-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }

        .services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        .service-card {
          background: rgba(15, 23, 42, 0.6);
          border-radius: 12px;
          padding: 16px;
          border-left: 4px solid;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .service-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }

        .service-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .service-name {
          color: #f1f5f9;
          font-weight: 600;
          font-size: 1.1rem;
        }

        .status-badge {
          padding: 4px 12px;
          border-radius: 12px;
          color: white;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .service-info {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          color: #94a3b8;
          font-size: 0.875rem;
          margin-bottom: 12px;
        }

        .error-msg {
          background: rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          margin-bottom: 12px;
        }

        .service-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .action-btn {
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .action-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .health-btn {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }

        .storage-btn {
          background: rgba(99, 102, 241, 0.2);
          color: #a5b4fc;
        }

        .services-btn {
          background: rgba(245, 158, 11, 0.2);
          color: #fcd34d;
        }

        .action-btn:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .connectivity-result {
          margin-top: 12px;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          background: rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
        }

        .connectivity-result.success {
          border-left: 3px solid #10b981;
        }

        .connectivity-result.error {
          border-left: 3px solid #ef4444;
        }

        .peer-status {
          display: inline-block;
          margin: 4px 8px 4px 0;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
        }

        .peer-status.up {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }

        .peer-status.down {
          background: rgba(239, 68, 68, 0.2);
          color: #fca5a5;
        }
      `}</style>
        </div>
    )
}

export default MicroservicesPanel
