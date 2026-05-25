const os = require("os");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CONFIG_PATH = path.join(__dirname, "config.json");

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("[node-client] Error leyendo config.json:", error.message);
    return {};
  }
}

const config = loadConfig();
const SERVER_URL = (process.env.SERVER_URL || config.serverUrl || "http://localhost:3000").replace(/\/$/, "");
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || config.heartbeatIntervalMs || 10_000);
const NODE_ID = process.env.NODE_ID || config.nodeId || `node-${os.hostname()}-${crypto.randomBytes(2).toString("hex")}`;
const NODE_NAME = process.env.NODE_NAME || config.nodeName || os.hostname();
const NODE_MODEL = process.env.NODE_MODEL || config.nodeModel || os.platform();
const NODE_ANDROID = process.env.NODE_ANDROID || config.nodeAndroid || "N/A";
const termuxFlagRaw = process.env.TERMUX_API_ENABLED ?? config.termuxApiEnabled ?? "auto";
const TERMUX_API_ENABLED = (() => {
  const value = String(termuxFlagRaw).toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return process.platform === "android";
})();

let termuxAvailable = null;
let prevCpuSample = null;

function detectTermuxApi() {
  if (!TERMUX_API_ENABLED) {
    return false;
  }
  if (termuxAvailable !== null) {
    return termuxAvailable;
  }
  try {
    execFileSync("termux-battery-status", [], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2500,
    });
    termuxAvailable = true;
  } catch {
    termuxAvailable = false;
  }
  return termuxAvailable;
}

function runTermuxJson(command) {
  try {
    const out = execFileSync(command, [], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3500,
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function getTermuxSnapshot() {
  if (!detectTermuxApi()) {
    return null;
  }

  const battery = runTermuxJson("termux-battery-status");
  const wifi = runTermuxJson("termux-wifi-connectioninfo");
  const deviceInfo = runTermuxJson("termux-telephony-deviceinfo");

  return {
    battery,
    wifi,
    deviceInfo,
  };
}

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
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) {
    return 0;
  }

  const current = cpus.reduce(
    (acc, cpu) => {
      const times = cpu.times;
      acc.idle += times.idle;
      acc.total += times.user + times.nice + times.sys + times.irq + times.idle;
      return acc;
    },
    { idle: 0, total: 0 },
  );

  if (!prevCpuSample) {
    prevCpuSample = current;
    const cores = cpus.length || 1;
    const avg1m = os.loadavg()[0] || 0;
    return Math.max(0, Math.min(100, Math.round((avg1m / cores) * 100)));
  }

  const idleDiff = current.idle - prevCpuSample.idle;
  const totalDiff = current.total - prevCpuSample.total;
  prevCpuSample = current;
  if (totalDiff <= 0) {
    return 0;
  }

  const usage = 100 * (1 - idleDiff / totalDiff);
  return Math.max(0, Math.min(100, Math.round(usage)));
}

function buildHeartbeatPayload() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const termux = getTermuxSnapshot();
  const termuxBattery = termux?.battery;
  const termuxWifi = termux?.wifi;
  const termuxDevice = termux?.deviceInfo;
  const deviceModel = termuxDevice?.device_model || NODE_MODEL;
  const androidVersion = termuxDevice?.software_version || NODE_ANDROID;

  return {
    nodeId: NODE_ID,
    name: NODE_NAME,
    model: deviceModel,
    android: androidVersion,
    localIp: getLocalIp(),
    battery: typeof termuxBattery?.percentage === "number" ? termuxBattery.percentage : null,
    charging: typeof termuxBattery?.plugged === "string" ? termuxBattery.plugged !== "UNPLUGGED" : null,
    temperature: typeof termuxBattery?.temperature === "number" ? termuxBattery.temperature : null,
    ramUsed: usedMem,
    ramTotal: totalMem,
    storageUsed: null,
    storageTotal: null,
    cpuLoad: getCpuLoadPercent(),
    uptime: Math.floor(os.uptime()),
    wifi: termuxWifi || null,
    services: [
      {
        name: "heartbeat-client",
        status: "running",
      },
      {
        name: "termux-api",
        status: detectTermuxApi() ? "running" : "unavailable",
      },
    ],
    metadata: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      termuxApiEnabled: TERMUX_API_ENABLED,
      termuxApiAvailable: detectTermuxApi(),
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
