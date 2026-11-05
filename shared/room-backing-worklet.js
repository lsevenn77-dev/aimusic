import {SoundTouch} from '@soundtouchjs/core';

// Process the live media element at its original clock rate. All listeners use
// the same semitone value from the room coordinator.
class RoomBacking extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new SoundTouch({sampleRate,sampleBufferType:'circular'});
    this.key = 0;
    this.port.onmessage = ({data}) => {
      if (!Number.isInteger(data) || Math.abs(data)>6 || data===this.key) return;
      this.key = data;
      this.engine.clear();
      this.engine.pitchSemitones = data;
    };
  }
  process(inputs,outputs) {
    const input = inputs[0], output = outputs[0];
    if (!input.length || !output.length) return true;
    if (!this.key) {
      output.forEach((channel,index)=>channel.set(input[index] || input[0]));
      return true;
    }
    const count = input[0].length;
    if (this.samples?.length!==2*count) this.samples = new Float32Array(2*count);
    const right = input[1] || input[0];
    for (let i=0;i<count;i++) {
      this.samples[2*i]=input[0][i];
      this.samples[2*i+1]=right[i];
    }
    this.engine.inputBuffer.putSamples(this.samples);
    this.engine.process();
    const available = Math.min(count,this.engine.outputBuffer.frameCount);
    if (available) {
      this.engine.outputBuffer.extract(this.samples,0,available);
      this.engine.outputBuffer.receive(available);
      for (let i=0;i<available;i++) {
        output[0][i]=this.samples[2*i];
        if (output[1]) output[1][i]=this.samples[2*i+1];
      }
    }
    return true;
  }
}
registerProcessor('room-backing',RoomBacking);
