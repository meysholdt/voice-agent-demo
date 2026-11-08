import { useEffect, useState } from "react";
// @ts-expect-error - External library without type definitions
import { WavRecorder, WavStreamPlayer } from "./lib/wavtools/index.js";
import { instructions } from "./conversation_config.js";
import "./App.css";

const sampleRate = 24000;
const audioFormat = { type: "audio/pcm", rate: sampleRate };

type RealtimeEvent =
  | { type: "session.created" | "session.updated" | "input_audio_buffer.speech_started" }
  | { type: "response.created"; response: { id: string } }
  | { type: "response.done"; response: {
      id: string;
      status: string;
      status_details?: { error?: { code?: string } };
    } }
  | { type: "response.output_audio.delta"; response_id: string; item_id: string; delta: string }
  | { type: "error"; error: { code?: string; type: string } };

function relayUrl() {
  const pageUrl = new URL(window.location.href);
  const configuredUrl = pageUrl.searchParams.get("wss");
  const url = configuredUrl === null
    ? new URL("/", pageUrl)
    : new URL(configuredUrl);
  if (configuredUrl === null) {
    url.protocol = pageUrl.protocol === "https:" ? "wss:" : "ws:";
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("The relay URL must use ws:// or wss://.");
  }
  return url.href;
}

export function App() {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    const recorder = new WavRecorder({ sampleRate });
    const player = new WavStreamPlayer({ sampleRate });
    let socket: WebSocket | undefined;
    let sessionTimeout: number | undefined;
    let stopped = false;
    let recordingStarted = false;
    let ready = false;
    let activeResponse: string | undefined;
    let interruptedResponse: string | undefined;

    function stop() {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(sessionTimeout);
      socket?.close();
      void recorder.close();
      void player.close();
    }

    function fail(message: string) {
      if (stopped) return;
      setStatus("disconnected");
      setDetail(message);
      stop();
    }

    function send(event: object) {
      if (!stopped && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    }

    async function startRecording() {
      if (recordingStarted) return;
      recordingStarted = true;
      await recorder.record(({ mono }: { mono: ArrayBuffer }) => {
        const bytes = new Uint8Array(mono);
        const audio = btoa(String.fromCharCode(...bytes));
        send({ type: "input_audio_buffer.append", audio });
      }, 2048, false);

      if (stopped) return;
      ready = true;
      window.clearTimeout(sessionTimeout);
      setStatus("connected");
      send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Hello!" }],
        },
      });
      send({ type: "response.create" });
    }

    function onMessage(message: MessageEvent<string>) {
      if (stopped) return;
      const event = JSON.parse(message.data) as RealtimeEvent;
      switch (event.type) {
        case "session.created":
          send({
            type: "session.update",
            session: {
              type: "realtime",
              instructions,
              output_modalities: ["audio"],
              audio: {
                input: {
                  format: audioFormat,
                  turn_detection: {
                    type: "server_vad",
                    create_response: true,
                    interrupt_response: true,
                  },
                },
                output: { format: audioFormat, voice: "alloy" },
              },
            },
          });
          break;
        case "session.updated":
          void startRecording().catch((error: Error) => fail(error.message));
          break;
        case "response.created":
          activeResponse = event.response.id;
          break;
        case "response.output_audio.delta":
          if (event.response_id !== interruptedResponse) {
            const audio = Uint8Array.from(atob(event.delta), (byte) => byte.charCodeAt(0));
            player.add16BitPCM(audio.buffer, event.item_id);
          }
          break;
        case "input_audio_buffer.speech_started": {
          const responseInProgress = activeResponse;
          if (responseInProgress) interruptedResponse = responseInProgress;
          void player.interrupt().then((played: { trackId: string | null; offset: number; pending: boolean } | null) => {
            if (played?.trackId && (played.pending || responseInProgress)) {
              send({
                type: "conversation.item.truncate",
                item_id: played.trackId,
                content_index: 0,
                audio_end_ms: Math.floor(played.offset * 1000 / sampleRate),
              });
            }
          });
          break;
        }
        case "response.done":
          if (activeResponse === event.response.id) activeResponse = undefined;
          if (event.response.status === "failed") {
            fail(`OpenAI response failed: ${event.response.status_details?.error?.code ?? "unknown error"}`);
          }
          break;
        case "error": {
          const code = event.error.code ?? event.error.type;
          console.error("OpenAI Realtime error:", code);
          if (!ready) fail(`OpenAI session error: ${code}`);
          break;
        }
      }
    }

    async function connect() {
      const url = relayUrl();
      setDetail(url);
      await recorder.begin();
      if (stopped) {
        await recorder.close();
        return;
      }
      await player.connect();
      if (stopped) return;

      socket = new WebSocket(url);
      socket.onmessage = onMessage;
      socket.onerror = () => fail("Could not reach the WebSocket relay.");
      socket.onclose = (event) => fail(event.reason || "The relay disconnected.");
      sessionTimeout = window.setTimeout(() => fail("Timed out waiting for OpenAI."), 15_000);
    }

    void connect().catch((error: Error) => fail(error.message));
    return stop;
  }, []);

  return (
    <div className="app-container">
      <div className="status-indicator">
        <div className={`status-dot ${status}`} />
        <div className="status-text">
          <div className="status-label">
            {status === "connecting" ? "Connecting to:" :
              status === "connected" ? "Connected to:" : "Disconnected"}
          </div>
          <div className="status-url">{detail}</div>
        </div>
      </div>
    </div>
  );
}

export default App;
