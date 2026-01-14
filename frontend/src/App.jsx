import { useState, useEffect, useCallback } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import Dashboard from './components/Dashboard'

// Use relative URLs when served from same origin, or explicit URLs for dev
const getApiUrl = () => {
    // In production (served by nginx), use relative path
    if (window.location.hostname !== 'localhost' || window.location.port === '3000') {
        return ''  // Relative - nginx proxies to backend
    }
    return 'http://localhost:8080'
}

const API_URL = getApiUrl()
const WS_URL = API_URL + '/ws'  // SockJS uses http://, not ws://

function App() {
    const [health, setHealth] = useState(null)
    const [safeMode, setSafeMode] = useState({ active: false })
    const [connected, setConnected] = useState(false)
    const [error, setError] = useState(null)

    // Fetch initial health data
    const fetchHealth = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/health`)
            if (response.ok) {
                const data = await response.json()
                setHealth(data)
                setError(null)
            }
        } catch (err) {
            setError('Failed to connect to backend')
            console.error('Health fetch error:', err)
        }
    }, [])

    // Fetch safe mode status
    const fetchSafeMode = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/health/safe-mode`)
            if (response.ok) {
                const data = await response.json()
                setSafeMode(data)
            }
        } catch (err) {
            console.error('Safe mode fetch error:', err)
        }
    }, [])

    // WebSocket connection
    useEffect(() => {
        const client = new Client({
            webSocketFactory: () => new SockJS(WS_URL),
            reconnectDelay: 5000,
            heartbeatIncoming: 4000,
            heartbeatOutgoing: 4000,

            onConnect: () => {
                console.log('WebSocket connected')
                setConnected(true)

                // Subscribe to health updates
                client.subscribe('/topic/health', (message) => {
                    const data = JSON.parse(message.body)
                    setHealth(data)
                })

                // Subscribe to safe mode updates
                client.subscribe('/topic/safe-mode', (message) => {
                    const data = JSON.parse(message.body)
                    setSafeMode(data)
                })
            },

            onDisconnect: () => {
                console.log('WebSocket disconnected')
                setConnected(false)
            },

            onStompError: (frame) => {
                console.error('STOMP error:', frame)
                setConnected(false)
            }
        })

        client.activate()

        return () => {
            client.deactivate()
        }
    }, [])

    // Initial fetch and polling fallback
    useEffect(() => {
        fetchHealth()
        fetchSafeMode()

        // Fallback polling if WebSocket fails
        const interval = setInterval(() => {
            if (!connected) {
                fetchHealth()
                fetchSafeMode()
            }
        }, 10000)

        return () => clearInterval(interval)
    }, [connected, fetchHealth, fetchSafeMode])

    // Toggle safe mode
    const toggleSafeMode = async () => {
        try {
            const endpoint = safeMode.active
                ? `${API_URL}/health/safe-mode/resolve`
                : `${API_URL}/health/safe-mode/trigger`

            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Manual toggle from dashboard' })
            })

            fetchSafeMode()
        } catch (err) {
            console.error('Toggle safe mode error:', err)
        }
    }

    return (
        <Dashboard
            health={health}
            safeMode={safeMode}
            connected={connected}
            error={error}
            onToggleSafeMode={toggleSafeMode}
        />
    )
}

export default App
