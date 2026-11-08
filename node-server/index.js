import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import WebSocket, { WebSocketServer } from "ws";

dotenv.config();

const { OPENAI_API_KEY, PORT = 3000 } = process.env;
if (!OPENAI_API_KEY) {
  console.error('Set OPENAI_API_KEY in node-server/.env.');
  process.exit(1);
}

const app = express();
app.use(express.static(fileURLToPath(new URL("../client/dist/", import.meta.url))));
app.get("/", (_request, response) => {
  response.status(503).send("Build the webpage with npm run build in client/.");
});

const server = createServer(app);
const relay = new WebSocketServer({ server, path: "/" });
const realtimeUrl = "wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5";

relay.on("connection", (browser) => {
  const upstream = new WebSocket(realtimeUrl, {
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    handshakeTimeout: 10_000,
  });

  let lastAudioResponse;
  upstream.on("message", (data, isBinary) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      console.error("OpenAI returned an invalid Realtime event.");
      browser.close(1011, "Invalid Realtime event");
      return;
    }
    switch (event.type) {
      case "session.created":
      case "session.updated":
      case "input_audio_buffer.speech_started":
      case "input_audio_buffer.committed":
        console.log(`OpenAI: ${event.type}`);
        break;
      case "response.output_audio.delta":
        if (event.response_id !== lastAudioResponse) {
          lastAudioResponse = event.response_id;
          console.log("OpenAI: response.output_audio.delta");
        }
        break;
      case "response.done":
        console.log(`OpenAI: response.done (${event.response.status})`);
        break;
      case "error":
        console.error("OpenAI error:", event.error.code ?? event.error.type);
        break;
    }
    if (browser.readyState === WebSocket.OPEN) {
      browser.send(data, { binary: isBinary });
    }
  });

  browser.on("message", (data, isBinary) => {
    // The webpage waits for session.created before sending its first event.
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    }
  });

  const closeUpstream = () => upstream.close();
  browser.on("close", closeUpstream);
  browser.on("error", closeUpstream);
  upstream.on("close", (code) => {
    browser.close(code === 1000 ? 1000 : 1011, "OpenAI session closed");
  });
  upstream.on("error", (error) => {
    if (browser.readyState === WebSocket.OPEN) {
      console.error("OpenAI WebSocket error:", error.message);
      browser.close(1011, "Could not connect to OpenAI");
    }
  });
});

server.listen(Number(PORT), () => {
  console.log(`Voice agent listening on port ${server.address().port}`);
});
