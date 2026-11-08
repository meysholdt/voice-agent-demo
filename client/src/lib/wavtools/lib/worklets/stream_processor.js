export const StreamProcessorWorklet = `
class StreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.chunkOffset = 0;
    this.trackId = null;
    this.playedSamples = 0;
    this.interrupted = false;
    this.port.onmessage = ({ data }) => {
      switch (data.event) {
        case 'write':
          if (data.buffer.length) {
            this.queue.push({ buffer: data.buffer, trackId: data.trackId });
          }
          break;
        case 'offset':
        case 'interrupt':
          this.port.postMessage({
            event: 'offset',
            requestId: data.requestId,
            trackId: this.trackId ?? this.queue[0]?.trackId ?? null,
            offset: this.playedSamples,
            pending: this.queue.length > 0,
          });
          this.interrupted = data.event === 'interrupt';
          break;
      }
    };
  }

  process(_inputs, outputs) {
    if (this.interrupted) {
      this.port.postMessage({ event: 'stop' });
      return false;
    }

    const output = outputs[0][0];
    let written = 0;
    while (written < output.length && this.queue.length) {
      const { buffer, trackId } = this.queue[0];
      if (trackId !== this.trackId) {
        this.trackId = trackId;
        this.playedSamples = 0;
      }
      const count = Math.min(buffer.length - this.chunkOffset, output.length - written);
      for (let i = 0; i < count; i++) {
        output[written + i] = buffer[this.chunkOffset + i] / 0x8000;
      }
      written += count;
      this.playedSamples += count;
      this.chunkOffset += count;
      if (this.chunkOffset === buffer.length) {
        this.queue.shift();
        this.chunkOffset = 0;
      }
    }
    return true;
  }
}

registerProcessor('stream_processor', StreamProcessor);
`;

const script = new Blob([StreamProcessorWorklet], {
  type: 'application/javascript',
});
const src = URL.createObjectURL(script);
export const StreamProcessorSrc = src;
