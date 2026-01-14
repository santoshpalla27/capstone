import StatusCard from './StatusCard'

const INFRA_ICONS = {
    mysql: '🗄️',
    redis: '⚡',
    kafka: '📨',
    default: '🔧'
}

const INFRA_DESCRIPTIONS = {
    mysql: 'Primary database for durable state',
    redis: 'Cache, sessions, and pub/sub',
    kafka: 'Async event streaming'
}

function InfrastructurePanel({ components }) {
    if (!components || Object.keys(components).length === 0) {
        return (
            <div className="glass-card">
                <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                    Loading infrastructure status...
                </p>
            </div>
        )
    }

    return (
        <div className="grid grid-3">
            {Object.entries(components).map(([name, component]) => {
                const description = INFRA_DESCRIPTIONS[name] || '';
                // Show description always, plus actual error if status is not UP
                const message = component.status === 'UP'
                    ? description
                    : `${description}${description && component.message ? ' • ' : ''}${component.message || ''}`;

                return (
                    <StatusCard
                        key={name}
                        name={`${INFRA_ICONS[name] || INFRA_ICONS.default} ${name.charAt(0).toUpperCase() + name.slice(1)}`}
                        status={component.status}
                        lastCheck={component.lastCheck}
                        message={message}
                    />
                );
            })}
        </div>
    )
}

export default InfrastructurePanel
