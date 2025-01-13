const { WebSocketServer } = require("ws");
require("dotenv").config();

const wss = new WebSocketServer({ port: process.env.WS_PORT });
const connections = new Map();

wss.on("connection", (ws, req) => {
  console.log("WebSocket client connected");

  ws.on("message", (message) => {
    const { userId } = JSON.parse(message);
    if (userId) {
      connections.set(userId, ws);
      console.log(`User ${userId} connected`);
    }
  });

  ws.on("close", () => {
    for (const [userId, connection] of connections.entries()) {
      if (connection === ws) {
        connections.delete(userId);
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});

const sendProgressToUser = (userId, progress) => {
  const ws = connections.get(userId);
  if (ws && ws.readyState === 1) {
    ws.send(progress);
  }
};

module.exports = { sendProgressToUser };
