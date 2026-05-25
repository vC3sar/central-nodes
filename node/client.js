const os = require("os");
const crypto = require("crypto");

const SERVER_URL = (
  process.env.SERVER_URL || "http://192.168.1.68:3000"
).replace(/\/$/, "");
const HEARTBEAT_INTERVAL_MS = Number(
  process.env.HEARTBEAT_INTERVAL_MS || 10_000,
);
const NODE_ID =
  process.env.NODE_ID ||
  `node-${os.hostname()}-${crypto.randomBytes(2).toString("hex")}`;
const NODE_NAME = process.env.NODE_NAME || os.hostname();
const NODE_MODEL = process.env.NODE_MODEL || os.platform();
const NODE_ANDROID = process.env.NODE_ANDROID || "N/A";

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const entry of iface || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return null;
}

function getCpuLoadPercent() {
  const cores = os.cpus().length || 1;
  const avg1m = os.loadavg()[0] || 0;
  return Math.max(0, Math.min(100, Math.round((avg1m / cores) * 100)));
}

function buildHeartbeatPayload() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    nodeId: NODE_ID,
    name: NODE_NAME,
    model: NODE_MODEL,
    android: NODE_ANDROID,
    localIp: getLocalIp(),
    battery: null,
    charging: null,
    temperature: null,
    ramUsed: usedMem,
    ramTotal: totalMem,
    storageUsed: null,
    storageTotal: null,
    cpuLoad: getCpuLoadPercent(),
    uptime: Math.floor(os.uptime()),
    wifi: null,
    services: [
      {
        name: "heartbeat-client",
        status: "running",
      },
    ],
    metadata: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
    },
  };
}

async function postJson(path, body) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} - ${text}`);
  }

  return response.json();
}

async function sendHeartbeat() {
  const payload = buildHeartbeatPayload();
  await postJson("/api/node/heartbeat", payload);
}

async function sendBootLog() {
  try {
    await postJson(`/api/node/${encodeURIComponent(NODE_ID)}/log`, {
      type: "info",
      message: `Cliente iniciado: ${NODE_NAME}`,
    });
  } catch (error) {
    console.error(
      "[node-client] No se pudo enviar log inicial:",
      error.message,
    );
  }
}

async function loop() {
  try {
    await sendHeartbeat();
    console.log(
      `[node-client] Heartbeat OK -> ${NODE_NAME} (${NODE_ID}) @ ${SERVER_URL}`,
    );
  } catch (error) {
    console.error("[node-client] Heartbeat error:", error.message);
  }
}

async function main() {
  console.log(`[node-client] Iniciando cliente para ${SERVER_URL}`);
  console.log(`[node-client] nodeId=${NODE_ID} nodeName=${NODE_NAME}`);

  await sendBootLog();
  await loop();
  setInterval(loop, HEARTBEAT_INTERVAL_MS);
}

main().catch((error) => {
  console.error("[node-client] Error fatal:", error);
  process.exit(1);
});
