# Node Client

Cliente simple que manda heartbeats al servidor central para que el dispositivo aparezca en el panel.

## Ejecutar

```bash
cd node
npm start
```

## Configuración con `config.json`

Edita `node/config.json`:

```json
{
  "serverUrl": "http://localhost:3000",
  "heartbeatIntervalMs": 10000,
  "termuxApiEnabled": true,
  "nodeId": "",
  "nodeName": "Mi Nodo",
  "nodeModel": "Generic Node",
  "nodeAndroid": "N/A"
}
```

Si `nodeId` queda vacío, se autogenera.

## Overrides por variables de entorno (opcional)

También puedes sobrescribir desde variables de entorno:

- `SERVER_URL` (default: valor de `config.json` o `http://localhost:3000`)
- `HEARTBEAT_INTERVAL_MS` (default: `10000`)
- `TERMUX_API_ENABLED` (default: `true`)
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

## Precisión con Termux API

Si estás en Android/Termux y tienes `termux-api`, el cliente intentará usar:

- `termux-battery-status` para `battery`, `charging`, `temperature`
- `termux-wifi-connectioninfo` para `wifi`
- `termux-telephony-deviceinfo` para mejorar `model` y `android`

Si algún comando o permiso falla, el cliente sigue enviando heartbeat con fallback.
