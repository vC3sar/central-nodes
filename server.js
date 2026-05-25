const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const NODE_TIMEOUT_MS = 60_000;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const nodes = new Map();
const logs = [];

function addLog(type, message, nodeId = null) {
  const log = {
    id: Date.now() + Math.random(),
    type,
    message,
    nodeId,
    time: new Date().toISOString(),
  };

  logs.unshift(log);

  if (logs.length > 300) {
    logs.pop();
  }

  io.emit("log:new", log);
}

function getNodeStatus(node) {
  const diff = Date.now() - node.lastSeen;
  return diff > NODE_TIMEOUT_MS ? "offline" : "online";
}

function getPublicNodes() {
  return Array.from(nodes.values()).map((node) => ({
    ...node,
    status: getNodeStatus(node),
  }));
}

app.get("/api/health", (req, res) => {
  res.json({
    server: "online",
    uptime: process.uptime(),
    totalNodes: nodes.size,
    onlineNodes: getPublicNodes().filter((n) => n.status === "online").length,
    offlineNodes: getPublicNodes().filter((n) => n.status === "offline").length,
    time: new Date().toISOString(),
  });
});

app.get("/api/nodes", (req, res) => {
  res.json(getPublicNodes());
});

app.get("/api/logs", (req, res) => {
  res.json(logs);
});

app.post("/api/node/heartbeat", (req, res) => {
  const data = req.body;

  if (!data.nodeId) {
    return res.status(400).json({
      error: "nodeId es requerido",
    });
  }

  const oldNode = nodes.get(data.nodeId);
  const isNew = !oldNode;

  const node = {
    nodeId: data.nodeId,
    name: data.name || data.nodeId,
    model: data.model || "Unknown",
    android: data.android || "Unknown",
    ip: req.ip,
    localIp: data.localIp || null,

    battery: data.battery ?? null,
    charging: data.charging ?? null,
    temperature: data.temperature ?? null,

    ramUsed: data.ramUsed ?? null,
    ramTotal: data.ramTotal ?? null,
    storageUsed: data.storageUsed ?? null,
    storageTotal: data.storageTotal ?? null,

    cpuLoad: data.cpuLoad ?? null,
    uptime: data.uptime || null,
    wifi: data.wifi || null,

    services: data.services || [],
    metadata: data.metadata || {},

    firstSeen: oldNode?.firstSeen || Date.now(),
    lastSeen: Date.now(),
  };

  nodes.set(data.nodeId, node);

  if (isNew) {
    addLog("info", `Nuevo nodo conectado: ${node.name}`, data.nodeId);
  }

  io.emit("nodes:update", getPublicNodes());

  res.json({
    ok: true,
    message: "Heartbeat recibido",
    node,
  });
});

app.post("/api/node/:nodeId/log", (req, res) => {
  const { nodeId } = req.params;
  const { type = "info", message } = req.body;

  if (!message) {
    return res.status(400).json({
      error: "message es requerido",
    });
  }

  addLog(type, message, nodeId);

  res.json({
    ok: true,
  });
});

app.post("/api/node/:nodeId/name", (req, res) => {
  const { nodeId } = req.params;
  const { name } = req.body || {};

  if (!nodes.has(nodeId)) {
    return res.status(404).json({
      error: "Nodo no encontrado",
    });
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({
      error: "name es requerido",
    });
  }

  const current = nodes.get(nodeId);
  const nextName = name.trim().slice(0, 50);
  const updated = {
    ...current,
    name: nextName,
  };

  nodes.set(nodeId, updated);
  addLog("info", `Nombre actualizado: ${current.name} -> ${nextName}`, nodeId);
  io.emit("nodes:update", getPublicNodes());

  res.json({
    ok: true,
    node: {
      ...updated,
      status: getNodeStatus(updated),
    },
  });
});

app.delete("/api/node/:nodeId", (req, res) => {
  const { nodeId } = req.params;

  if (!nodes.has(nodeId)) {
    return res.status(404).json({
      error: "Nodo no encontrado",
    });
  }

  nodes.delete(nodeId);

  addLog("warn", `Nodo eliminado manualmente: ${nodeId}`, nodeId);
  io.emit("nodes:update", getPublicNodes());

  res.json({
    ok: true,
  });
});

io.on("connection", (socket) => {
  socket.emit("nodes:update", getPublicNodes());
  socket.emit("logs:init", logs);

  socket.on("disconnect", () => {});
});

setInterval(() => {
  io.emit("nodes:update", getPublicNodes());
}, 5000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor central iniciado en http://0.0.0.0:${PORT}`);
  addLog("info", `Servidor central iniciado en puerto ${PORT}`);
});
