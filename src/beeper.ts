
export interface Beeper {
  outputNode: AudioNode;
  silenceAt(time: number): void;
  toneAt(time: number, hz: number, duration?: number): void;
  vibratoAt(startTime: number, rateHz: number, depthSemitones: number, duration: number): void;
  noiseAt(startTime: number, depthSemitones: number, duration: number): void;
  pitchBend(startTime: number, semitones: number, duration: number, params?: { startDelay?: number, endDelay?: number, ease?: (this: void, v: number) => number }): void;
}

const BEEPER_TRANSITION = 0.01;
const UPDATE_HZ = 64;

export function createBeeper(ac: AudioContext): Beeper {
  const frequencyNode = ac.createConstantSource();
  frequencyNode.offset.value = 440;
  frequencyNode.start();
  const precisionNode = new AudioWorkletNode(ac, 'pc-speaker-precision', {
    processorOptions: {
      updateHz: UPDATE_HZ,
    }
  });
  const frequencyGain = ac.createGain();
  frequencyNode.connect(frequencyGain);
  frequencyGain.connect(precisionNode);
  const vibratoNode = ac.createOscillator();
  vibratoNode.type = 'sine';
  vibratoNode.start();
  const vibratoGain = ac.createGain();
  vibratoGain.gain.value = 0;
  vibratoNode.connect(vibratoGain);
  vibratoGain.connect(frequencyGain.gain);

  const noiseNode = new AudioWorkletNode(ac, 'white-noise', {
    numberOfInputs: 0,
  });
  const noiseGain = ac.createGain();
  noiseGain.gain.value = 0;
  noiseNode.connect(noiseGain);
  noiseGain.connect(frequencyGain.gain);

  const pitchBend = ac.createConstantSource();
  pitchBend.offset.value = 0;
  pitchBend.start();
  pitchBend.connect(frequencyGain.gain);

  const oscillatorNode = ac.createOscillator();
  oscillatorNode.frequency.value = 0;
  oscillatorNode.type = 'square'; 
  precisionNode.connect(oscillatorNode.frequency);
  const gainNode = ac.createGain();
  oscillatorNode.connect(gainNode);
  oscillatorNode.start();
  gainNode.gain.value = 0;
  return {
    outputNode: gainNode,
    silenceAt(time) {
      gainNode.gain.setTargetAtTime(0, time, BEEPER_TRANSITION);
    },
    toneAt(startTime, hz, duration) {
      frequencyNode.offset.setTargetAtTime(hz, startTime, BEEPER_TRANSITION);
      gainNode.gain.setTargetAtTime(1, startTime, BEEPER_TRANSITION);
      if (typeof duration === 'number') {
        gainNode.gain.setTargetAtTime(0, startTime + duration, BEEPER_TRANSITION);
      }
    },
    vibratoAt(startTime, rateHz, depthSemitones, duration) {
      vibratoNode.frequency.setValueAtTime(startTime, rateHz);
      vibratoGain.gain.setValueAtTime(Math.pow(2, depthSemitones / 12)-1, startTime);
      vibratoGain.gain.setValueAtTime(0, startTime + duration);
    },
    noiseAt(startTime, depthSemitones, duration) {
      noiseGain.gain.setValueAtTime(Math.pow(2, depthSemitones / 12)-1, startTime);
      noiseGain.gain.setValueAtTime(0, startTime + duration);
    },
    pitchBend(startTime, semitones, duration, { startDelay=0, endDelay=0, ease = (v: number) => v } = {}) {
      if ((duration - startDelay - endDelay) < 0) {
        throw new Error('delays are longer than full duration');
      }
      const bufferLen = Math.floor(UPDATE_HZ * (duration - startDelay - endDelay));
      const maxValue = Math.pow(2, semitones / 12) - 1;
      const buffer = new Float32Array(bufferLen + 1);
      for (let i = 0; i < bufferLen; i++) {
        buffer[i] = ease(i/bufferLen) * maxValue;
      }
      buffer[bufferLen] = ease(1) * maxValue;
      pitchBend.offset.setValueAtTime(startTime, 0);
      pitchBend.offset.setValueCurveAtTime(buffer, startTime + startDelay, duration - startDelay - endDelay);
      pitchBend.offset.setValueAtTime(startTime + duration, 0);
    },
  };
}

export type Note = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export namespace BeeperCommand {
  export interface BPM {
    type: 'bpm';
    bpm: number;
    commands: BeeperCommand[];
  }
  export interface PlayHz {
    type: 'hz';
    hz: number;
    ms: number;
  }
  export interface Off {
    type: 'off';
    ms: number;
  }
  export interface PlayNote {
    type: 'note';
    note: Note;
    octave?: number;
    semiquavers?: number;
  }
  export interface Rest {
    type: 'rest';
    semiquavers?: number;
  }
  export interface Vibrato {
    type: 'vibrato';
    hz: number;
    semitones: number;
    commands: BeeperCommand[];
  }
  export interface Perturb {
    type: 'perturb';
    semitones: number;
    commands: BeeperCommand[];
  }
  export interface PitchBend {
    type: 'bend';
    semitones: number;
    commands: BeeperCommand[];
  }
}

export type BeeperCommand = (
  | BeeperCommand.BPM
  | BeeperCommand.Off
  | BeeperCommand.PlayHz
  | BeeperCommand.PlayNote
  | BeeperCommand.Rest
  | BeeperCommand.Vibrato
  | BeeperCommand.Perturb
  | BeeperCommand.PitchBend
);

export function getCommandDuration(cmd: BeeperCommand, settings: { bpm?: number } = {}): number {
  switch (cmd.type) {
    case 'bpm': {
      const subsettings = { ...settings, bpm: cmd.bpm };
      return cmd.commands.reduce((cumulative, subcmd) => cumulative + getCommandDuration(subcmd, subsettings), 0);
    }
    case 'hz': case 'off': {
      return cmd.ms;
    }
    case 'note': case 'rest': {
      const { bpm = 120 } = settings;
      return (cmd.semiquavers ?? 1) / (4 * (bpm / 60));
    }
    case 'vibrato': case 'bend': case 'perturb': {
      return cmd.commands.reduce((cumulative, subcmd) => cumulative + getCommandDuration(subcmd, settings), 0);
    }
  }
}

export function playCommands(beeper: Beeper, cmds: BeeperCommand[], startTime: number, bpm = 120) {
  let refTime = startTime;
  for (const cmd of cmds) {
    switch (cmd.type) {
      case 'note': {
        let duration = (cmd.semiquavers ?? 1) / (4 * (bpm / 60));
        beeper.toneAt(refTime, noteHz(cmd.note, cmd.octave ?? 4), duration - 0.01);
        refTime += duration;
        break;
      }
      case 'rest': {
        let duration = (cmd.semiquavers ?? 1) / (4 * (bpm / 60));
        refTime += duration;
        break;
      }
      case 'bpm': {
        refTime = playCommands(beeper, cmd.commands, refTime, cmd.bpm);
        break;
      }
      case 'hz': {
        beeper.toneAt(refTime, cmd.hz, cmd.ms / 1000);
        refTime += cmd.ms / 1000;
        break;
      }
      case 'off': {
        refTime += cmd.ms / 1000;
        break;
      }
      case 'vibrato': {
        const startTime = refTime;
        refTime = playCommands(beeper, cmd.commands, startTime, bpm);
        beeper.vibratoAt(startTime, cmd.hz, cmd.semitones, refTime - startTime);
        break;
      }
    }
  }
  return refTime;
}

const noteOrder: Note[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const referenceFrequency = 440; // Frequency of A4
const indexA = noteOrder.indexOf('A');
const TWO_POW_TWELFTH = Math.pow(2, 1 / 12);

export function noteHz(note: Note, octave: number): number {
  const indexNote = noteOrder.indexOf(note);

  if (indexNote === -1) {
    throw new Error('Invalid note');
  }

  const semitonesFromA4 = 12 * (octave - 4) + (indexNote - indexA);
  return referenceFrequency * Math.pow(TWO_POW_TWELFTH, semitonesFromA4);
}
