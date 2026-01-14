import StatusCard from './StatusCard'
import SafeModeBanner from './SafeModeBanner'
import InfrastructurePanel from './InfrastructurePanel'

function Dashboard({ health, safeMode, connected, error, onToggleSafeMode }) {
    const getOverallStatus = () => {
        if (!health) return 'unknown'
        return health.status?.toLowerCase() || 'unknown'
    }

    const getComponentCount = (status) => {
        if (!health?.components) return 0
        return Object.values(health.components).filter(c => c.status === status).length
    }

    return (
        <div className="dashboard">
            {/* Header */}
            <header className="header">
                <h1>⚡ Control Plane</h1>
                <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                    <span className={`status-dot ${connected ? 'up' : 'down'}`}></span>
                    {connected ? 'Live' : 'Polling'}
                </div>
            </header>

            {/* Error Banner */}
            {error && (
                <div className="glass-card" style={{ marginBottom: 24, borderColor: 'rgba(239, 68, 68, 0.5)' }}>
                    <p style={{ color: 'var(--status-down)' }}>⚠️ {error}</p>
                </div>
            )}

            {/* Safe Mode Banner */}
            {safeMode.active && (
                <SafeModeBanner safeMode={safeMode} onResolve={onToggleSafeMode} />
            )}

            {/* Overview Cards */}
            <div className="grid grid-4" style={{ marginBottom: 32 }}>
                <div className="glass-card overview-card">
                    <div className="value">{getOverallStatus().toUpperCase()}</div>
                    <div className="label">System Status</div>
                </div>

                <div className="glass-card overview-card">
                    <div className="value" style={{ color: 'var(--status-up)' }}>
                        {getComponentCount('UP')}
                    </div>
                    <div className="label">Healthy</div>
                </div>

                <div className="glass-card overview-card">
                    <div className="value" style={{ color: 'var(--status-degraded)' }}>
                        {getComponentCount('DEGRADED')}
                    </div>
                    <div className="label">Degraded</div>
                </div>

                <div className="glass-card overview-card">
                    <div className="value" style={{ color: 'var(--status-down)' }}>
                        {getComponentCount('DOWN')}
                    </div>
                    <div className="label">Down</div>
                </div>
            </div>

            {/* Infrastructure Panel */}
            <section style={{ marginBottom: 32 }}>
                <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
                    Infrastructure Status
                </h2>
                <InfrastructurePanel components={health?.components} />
            </section>

            {/* Safe Mode Toggle */}
            <section className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Safe Mode Control</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                            {safeMode.active
                                ? 'System is in safe mode. Click to resolve.'
                                : 'Manually trigger safe mode for maintenance.'}
                        </p>
                    </div>
                    <button
                        className={`btn ${safeMode.active ? 'btn-primary' : 'btn-danger'}`}
                        onClick={onToggleSafeMode}
                    >
                        {safeMode.active ? 'Resolve Safe Mode' : 'Trigger Safe Mode'}
                    </button>
                </div>
            </section>
        </div>
    )
}

export default Dashboard
