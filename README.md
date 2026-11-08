# Recall.ai Real-Time Voice Agent

### [Watch the Demo Here!](https://www.loom.com/share/2a02fac2643441c1990da861e829892c)

This demo application uses Recall.ai's [Output Media](https://docs.recall.ai/docs/stream-media) feature and OpenAI's [real-time API](https://platform.openai.com/docs/guides/realtime) to add an interactive voice agent to meetings.

## Prerequisites

1. [Node.js](https://nodejs.org/en/)
2. [Ngrok](https://ngrok.com/docs/getting-started/)
3. [Recall.ai API key](https://www.recall.ai/)
4. [OpenAI API key](https://platform.openai.com/docs/overview) with access to `gpt-realtime-1.5`

## Installation

From the repository root, build the frontend and install the relay dependencies.

```bash
cd client
npm install
npm run build
cd ../node-server
npm install
```

In `node-server/`, copy `.env.example` to `.env` and set `OPENAI_API_KEY`.

The historical Python relay in `python-server/` uses the retired Realtime beta.

## Quickstart

1. Run `npm run dev` in `node-server/`. The Node server serves both the built webpage and the WebSocket relay on port 3000.
2. Run `ngrok http 3000` in a separate terminal.
3. Create a bot using the tunnel's HTTPS URL as the Output Media webpage. The webpage connects to the relay on the same host. Use the API hostname for your Recall.ai workspace's region.

```bash
curl --request POST \
  --url https://us-east-1.recall.ai/api/v1/bot/ \
  --header 'Authorization: YOUR_RECALL_TOKEN' \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --data '{
    "meeting_url": "YOUR_MEETING_URL",
    "bot_name": "Recall.ai Notetaker",
    "output_media": {
      "camera": {
        "kind": "webpage",
        "config": {
          "url": "https://YOUR_NGROK_HOST"
        }
      }
    },
    "variant": {
      "zoom": "web_4_core",
      "google_meet": "web_4_core",
      "microsoft_teams": "web_4_core"
    }
  }'
```

The bot will join your meeting URL and stream the demo webpage's content directly to your meeting.

If you'd like to customize the webpage shown by the bot, or change the interaction with the OpenAI agent, follow the complete setup instructions below.

## Customizing the Webpage

### Local Development Setup

Navigate to the client directory and start the development server:

```bash
cd client
npm run dev
```

With the Node relay running, open `http://localhost:5173/?wss=ws://localhost:3000/`. For a bot run, rebuild the client after changes and use the public HTTPS URL for port 3000.

### Modifying the Agent

You can modify the initial prompt of the agent by editing the `conversation_config.ts` file.

### Building for Production

Build the client application:

```bash
npm run build
```

The built files will be in the `dist` directory, ready to be deployed to your hosting service.

When hosting the frontend and relay separately, pass the public WebSocket URL as the `wss` query parameter, for example `https://your-frontend.com/?wss=wss://your-relay.com/`.

## Acknowledgements

This project incorporates code from [OpenAI's real-time API demo](https://github.com/openai/openai-realtime-console), which is under the MIT License.

## FAQ

### The webpage shows that my bot is connected, why isn't it replying to me in the meeting?
Check the Node server log. After someone speaks, `input_audio_buffer.speech_started` and `input_audio_buffer.committed` show that OpenAI received a spoken turn. `response.output_audio.delta` shows that OpenAI sent audio back. For connection or quota errors, check the error shown on the webpage and in the server log.
