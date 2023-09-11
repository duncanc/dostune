/// <reference path="./audio-worklet.d.ts" />

const baseFrequency = 1193182;

class PCSpeakerPrecisionProcessor extends AudioWorkletProcessor {
  constructor(options: AudioWorkletNodeOptions = {}) {
    super(options);
    const { processorOptions: { updateHz = 64 } = {}, numberOfInputs=1, channelCount=1  } = options;
    this.repeatSamples = Math.round(sampleRate / updateHz);
    this.prevValues = Array.from({length: numberOfInputs}, () => new Float32Array(channelCount));
  }
  repeatSamples: number;
  prevValues: Float32Array[];
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const { repeatSamples } = this;
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      for (let j = 0; j < input.length; j++) {
        const channel = input[j];

        // Calculate the first and last master array index for this chunk
        const firstIndex = currentFrame;
        const lastIndex = currentFrame + channel.length - 1;

        // Calculate the first and last repeated value indices for this chunk
        const firstRepeatIndex = Math.floor(firstIndex / repeatSamples);
        const lastRepeatIndex = Math.ceil((lastIndex + 1) / repeatSamples) - 1;

        for (let repeatIndex = firstRepeatIndex; repeatIndex <= lastRepeatIndex; repeatIndex++) {
          // Calculate the value that should be repeated
          const value = (repeatIndex * repeatSamples >= firstIndex) ? baseFrequency / Math.round(baseFrequency / channel[Math.floor(repeatIndex * repeatSamples - firstIndex)]) : this.prevValues[i][j];

          // Calculate the start and end index for this repeated value within the chunk
          const localStartIndex = Math.max(repeatIndex * repeatSamples - firstIndex, 0);
          const localEndIndex = Math.min((repeatIndex + 1) * repeatSamples - firstIndex, channel.length);

          // Fill the chunk with the repeated value
          outputs[i][j].fill(value, localStartIndex, localEndIndex);
        }

        // Update lastValue for the next chunk
        this.prevValues[i][j] = outputs[i][j][outputs[i][j].length - 1];
      }
    }
    return true;
  }
}

registerProcessor('pc-speaker-precision', PCSpeakerPrecisionProcessor);

class WhiteNoiseProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>) {
    const output = outputs[0];
    for (let channel = 0; channel < output.length; ++channel) {
      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; ++i) {
        outputChannel[i] = Math.random() * 2 - 1;
      }
    }
    return true;
  }
}

registerProcessor('white-noise', WhiteNoiseProcessor);
