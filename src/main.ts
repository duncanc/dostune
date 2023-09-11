
import "./index.html";
import "./favicon.png";
import "./dostune.css";
import { createBeeper, BeeperCommand, playCommands } from "./beeper";

const DEFAULT_VOLUME = 0.05;

const isIgnorableNode = (node: Node) => node.nodeType === Node.COMMENT_NODE || (node.nodeType === Node.TEXT_NODE && !/\S/.test(node.textContent || ''));

const extractElementOrFragment = (frag: DocumentFragment): HTMLElement | DocumentFragment => {
  const el = frag.firstElementChild as HTMLElement | null;
  if (!el) return frag;
  for (let node = el.previousSibling; node; node = node.previousSibling) {
    if (!isIgnorableNode(node)) return frag;
  }
  for (let node = el.nextSibling; node; node = node.nextSibling) {
    if (!isIgnorableNode(node)) return frag;
  }
  return el;
};

function templateFactory<T extends HTMLElement | DocumentFragment>(name: string, init: (node: T) => void = () => {}) {
  const template = document.getElementById(name+'-template') as HTMLTemplateElement;
  const node = extractElementOrFragment(template.content);
  return () => {
    const copy = node.cloneNode(true) as T;
    init(copy);
    return copy;
  };
}

function openDialog() {
  return new Promise<Blob | null>((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      
      // Handle file selection
      input.onchange = (e) => {
          if (input.files?.length) {
              resolve(input.files![0]);
          } else {
              resolve(null);  // No file selected (though this is hard to detect consistently)
          }
      };

      // Trigger the file dialog
      input.click();
  });
}

async function main() {
  const makeBlock = templateFactory('block', (node: HTMLElement | DocumentFragment) => {
    const root = node.querySelector('.block') || (node as HTMLElement);
    const typeSelector = root.querySelector('.block-type-selector') as HTMLSelectElement;
    let currentMode = typeSelector.value;
    root.classList.toggle(`mode-${currentMode}`, true);
    typeSelector.onchange = () => {
      root.classList.toggle(`mode-${currentMode}`, false);
      currentMode = typeSelector.value;
      root.classList.toggle(`mode-${currentMode}`, true);
    };
    const body = root.querySelector('.block-body') as HTMLElement;
    body.appendChild(makeAddBlockButton());
    const deleteButton = root.querySelector('.delete-button') as HTMLButtonElement;
    deleteButton.onclick = () => {
      root.parentNode?.removeChild(root);
    };
  });
  
  const makeAddBlockButton = templateFactory<HTMLButtonElement>('add-block-button', node => {
    node.onclick = () => {
      const block = makeBlock();
      node.parentNode!.insertBefore(block, node);
      node.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    };
  });
  
  const blockContainer = document.getElementById('blocks')!;
  const addBlockButton = makeAddBlockButton() as HTMLButtonElement;
  blockContainer.appendChild(addBlockButton);
  const setTune = (tune: BeeperCommand[]) => {
    while (addBlockButton.previousElementSibling) {
      blockContainer.removeChild(addBlockButton.previousElementSibling);
    }
    const addElements = (target: HTMLElement, cmds: BeeperCommand[]) => {
      for (const cmd of cmds) {
        const el = makeBlock();
        const root = el.querySelector('.block') || (el as HTMLElement);
        const typeSelector = root.querySelector('.block-type-selector') as HTMLSelectElement;
        typeSelector.value = cmd.type;
        typeSelector.dispatchEvent(new Event('change'));
        switch (cmd.type) {
          case 'bpm': {
            const bpmInput = root.querySelector('.bpm > input') as HTMLInputElement;
            bpmInput.value = String(cmd.bpm);
            const addButton = root.querySelector('.block-body > .add-block-button') as HTMLButtonElement;
            addElements(addButton, cmd.commands);
            break;
          }
          case 'hz': {
            const hzInput = root.querySelector('.raw-hz > input') as HTMLInputElement;
            hzInput.value = String(cmd.hz);
            const msInput = root.querySelector('.raw-duration > input') as HTMLInputElement;
            msInput.value = String(cmd.ms);
            break;
          }
          case 'note': {
            const toneSelector = root.querySelector('.tone-selector') as HTMLSelectElement;
            toneSelector.value = cmd.note;
            const octaveInput = root.querySelector('.octave-selector') as HTMLInputElement;
            octaveInput.value = String(cmd.octave ?? 4);
            const numeratorInput = root.querySelector('.numerator') as HTMLInputElement;
            const denominatorInput = root.querySelector('.denominator') as HTMLInputElement;
            numeratorInput.value = String(cmd.semiquavers ?? 1);
            denominatorInput.value = '16';
            break;
          }
          case 'off': {
            const msInput = root.querySelector('.raw-duration > input') as HTMLInputElement;
            msInput.value = String(cmd.ms);
            break;
          }
          case 'rest': {
            const numeratorInput = root.querySelector('.numerator') as HTMLInputElement;
            const denominatorInput = root.querySelector('.denominator') as HTMLInputElement;
            numeratorInput.value = String(cmd.semiquavers ?? 1);
            denominatorInput.value = '16';
            break;
          }
          case 'vibrato': {
            const semitonesInput = root.querySelector('.semitones > input') as HTMLInputElement;
            semitonesInput.value = String(cmd.semitones);
            const hzInput = root.querySelector('.vibrato-hz > input') as HTMLInputElement;
            hzInput.value = String(cmd.hz);
            const addButton = root.querySelector('.block-body > .add-block-button') as HTMLButtonElement;
            addElements(addButton, cmd.commands);            
            break;
          }
          case 'perturb': {
            const semitonesInput = root.querySelector('.semitones > input') as HTMLInputElement;
            semitonesInput.value = String(cmd.semitones);
            const addButton = root.querySelector('.block-body > .add-block-button') as HTMLButtonElement;
            addElements(addButton, cmd.commands);            
            break;
          }
          case 'bend': {
            const semitonesInput = root.querySelector('.semitones > input') as HTMLInputElement;
            semitonesInput.value = String(cmd.semitones);
            const addButton = root.querySelector('.block-body > .add-block-button') as HTMLButtonElement;
            addElements(addButton, cmd.commands);
            break;
          }
        }
        target.parentNode!.insertBefore(el, target);
      }
    };
    addElements(addBlockButton, tune);
  };
  const getTune = (container: HTMLElement = blockContainer): BeeperCommand[] => {
    const cmds: BeeperCommand[] = [];
    for (let el = container.firstElementChild; el; el = el.nextElementSibling) {
      if (!el.classList.contains('block')) continue;
      const typeSelector = el.querySelector('.block-type-selector') as HTMLSelectElement;
      switch (typeSelector.value as BeeperCommand['type']) {
        case 'note': {
          const toneSelector = el.querySelector('.tone-selector') as HTMLSelectElement;
          const octaveInput = el.querySelector('.octave-selector') as HTMLInputElement;
          const numeratorInput = el.querySelector('.numerator') as HTMLInputElement;
          const denominatorInput = el.querySelector('.denominator') as HTMLInputElement;
          cmds.push({ type: 'note', note: toneSelector.value as any, octave: Number.parseFloat(octaveInput.value), semiquavers: Number.parseFloat(numeratorInput.value) * Number.parseFloat(denominatorInput.value) / 16 });
          break;
        }
        case 'rest': {
          const numeratorInput = el.querySelector('.numerator') as HTMLInputElement;
          const denominatorInput = el.querySelector('.denominator') as HTMLInputElement;
          cmds.push({ type: 'rest', semiquavers: Number.parseFloat(numeratorInput.value) * Number.parseFloat(denominatorInput.value) / 16 });
          break;
        }
        case 'bpm': {
          const bpmInput = el.querySelector('.bpm > input') as HTMLInputElement;
          const commands = getTune(el.querySelector('.block-body') as HTMLElement);
          cmds.push({ type:'bpm', bpm: Number.parseFloat(bpmInput.value), commands });
          break;
        }
        case 'hz': {
          const hzInput = el.querySelector('.raw-hz > input') as HTMLInputElement;
          const msInput = el.querySelector('.raw-duration > input') as HTMLInputElement;
          cmds.push({ type: 'hz', hz: Number.parseFloat(hzInput.value), ms: Number.parseFloat(msInput.value) });
          break;
        }
        case 'off': {
          const msInput = el.querySelector('.raw-duration > input') as HTMLInputElement;
          cmds.push({ type: 'off', ms: Number.parseFloat(msInput.value) });
          break;
        }
        case 'vibrato': {
          const semitonesInput = el.querySelector('.semitones > input') as HTMLInputElement;
          const hzInput = el.querySelector('.vibrato-hz > input') as HTMLInputElement;
          const commands = getTune(el.querySelector('.block-body') as HTMLElement);
          cmds.push({ type:'vibrato', hz: Number.parseFloat(hzInput.value), commands, semitones: Number.parseFloat(semitonesInput.value) });
          break;
        }
        case 'perturb': {
          const semitonesInput = el.querySelector('.semitones > input') as HTMLInputElement;
          const commands = getTune(el.querySelector('.block-body') as HTMLElement);
          cmds.push({ type:'perturb', commands, semitones: Number.parseFloat(semitonesInput.value) });
          break;
        }
        case 'bend': {
          const semitonesInput = el.querySelector('.semitones > input') as HTMLInputElement;
          const commands = getTune(el.querySelector('.block-body') as HTMLElement);
          cmds.push({ type:'bend', commands, semitones: Number.parseFloat(semitonesInput.value) });
          break;
        }
      }
    }
    return cmds;
  };
  document.getElementById('new-tune-button')!.onclick = () => {
    setTune([]);
  };
  document.getElementById('save-button')!.onclick = () => {
    const blob = new Blob([JSON.stringify({tune:getTune()})], {type:'application/json'});
    const blobLink = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'tune.dostune.json';
    link.href = blobLink;
    link.click();
  };
  document.getElementById('load-button')!.onclick = async () => {
    const blob = await openDialog();
    if (blob) {
      try {
        setTune(JSON.parse(await blob.text()).tune);
      }
      catch (e) {
        alert(e);
      }
    }
  };
  const exampleSelector = document.getElementById('example-selector') as HTMLSelectElement;
  for (const el of document.querySelectorAll('script[type="application/json"]')) {
    const id = el.getAttribute('id');
    if (!id) continue;
    const op = document.createElement('option');
    op.textContent = (el as HTMLElement).dataset.title || id;
    op.value = id;
    exampleSelector.appendChild(op);
  }
  document.getElementById('load-example-button')!.onclick = () => {
    const exampleId = exampleSelector.value;
    const script = document.getElementById(exampleId) as HTMLScriptElement | null;
    if (script) {
      setTune(JSON.parse(script.text));
    }
  };

  /*
  if (navigator && typeof navigator.requestMIDIAccess === 'function') {
    navigator.requestMIDIAccess().then(midi => {
      const inputs = [...midi.inputs.values()];
      console.log(`got ${midi.inputs.size} inputs and ${midi.outputs.size} outputs`)
      for (const input of inputs) {
        input.onmidimessage = (event: Event) => {
          const { data } = event as MIDIMessageEvent;
          console.log(data);
        };
      }
    })
    .catch(e => {
      console.log('failed: ' + e);
    });
  }
  */
  const audioCtx = new AudioContext();
  const masterGainNode = audioCtx.createGain();
  masterGainNode.gain.value = DEFAULT_VOLUME;
  masterGainNode.connect(audioCtx.destination);
  await audioCtx.audioWorklet.addModule('audio-worklet.js');
  const beeper = createBeeper(audioCtx);
  beeper.outputNode.connect(masterGainNode);

  const playButton = document.getElementById('play-button') as HTMLButtonElement;
  const waitSeconds = (seconds: number) => new Promise<void>(resolve => void setTimeout(() => resolve(), seconds * 1000));
  playButton.onclick = async () => {
    playButton.disabled = true;
    await audioCtx.resume();
    const endTime = playCommands(beeper, getTune(), audioCtx.currentTime);
    await waitSeconds(endTime - audioCtx.currentTime);
    playButton.disabled = false;
  };
  /*
  soundSwitch.onclick = async e => {
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
      document.body.classList.toggle('sound-enabled', true);
    }
    else if (masterGainNode.gain.value === 0) {
      document.body.classList.toggle('sound-enabled', true);
      masterGainNode.gain.value = DEFAULT_VOLUME;
    }
    else {
      document.body.classList.toggle('sound-enabled', false);
      masterGainNode.gain.value = 0;
    }
  };
  const audioActive = new Promise<AudioContext>((resolve, reject) => {
    if (audioCtx.state === 'running') {
      document.body.classList.toggle('sound-enabled', true);
      resolve(audioCtx);
    }
    else {
      function onstatechange() {
        switch (audioCtx.state) {
          case 'running':
            document.body.classList.toggle('sound-enabled', true);
            audioCtx.removeEventListener('statechange', onstatechange);
            resolve(audioCtx);
            break;
          case 'closed':
            document.body.classList.toggle('sound-enabled', false);
            audioCtx.removeEventListener('statechange', onstatechange);
            reject('audio context closed');
            break;
        }
      }
      audioCtx.addEventListener('statechange', onstatechange);
    }
  });
  await audioActive;
  */
  //const startTime = audioCtx.currentTime + 0.1;
  //const endTime = playCommands(beeper, terminatorTune, startTime);
  //beeper.pitchBend(startTime, -3, endTime-startTime, { ease: v => { const omv = 1-v; return 1-(omv * omv * omv); }});
}

window.addEventListener('DOMContentLoaded', main, {once: true});
