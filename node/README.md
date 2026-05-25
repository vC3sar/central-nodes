# Node Client

Cliente simple que manda heartbeats al servidor central para que el dispositivo aparezca en el panel.

## Ejecutar

```bash
cd node
npm start
```

## Configuración (opcional)

Variables de entorno soportadas:

- `SERVER_URL` (default: `http://localhost:3000`)
- `HEARTBEAT_INTERVAL_MS` (default: `10000`)
- `NODE_ID` (default: autogenerado)
- `NODE_NAME` (default: hostname)
- `NODE_MODEL` (default: plataforma del OS)
- `NODE_ANDROID` (default: `N/A`)

Ejemplo:

```bash
SERVER_URL=http://192.168.1.120:3000 NODE_NAME=Moto-G55 npm start
```

## Qué envía

- `nodeId`, `name`, `model`, `android`, `localIp`
- métricas base: `cpuLoad`, `ramUsed`, `ramTotal`, `uptime`
- `services` y `metadata`

Con eso, el backend actualiza `nodes:update` y el panel refleja el nuevo dispositivo en tiempo real.
