'use strict';(function(){class l extends AudioWorkletProcessor{constructor(d={}){super(d);let {processorOptions:{updateHz:c=64}={},numberOfInputs:a=1,channelCount:b=1}=d;this.repeatSamples=Math.round(sampleRate/c);this.prevValues=Array.from({length:a},()=>new Float32Array(b))}process(d,c){let {repeatSamples:a}=this;for(let e=0;e<d.length;e++){let k=d[e];for(let f=0;f<k.length;f++){let h=k[f],g=currentFrame;var b=Math.floor(g/a);let m=Math.ceil((currentFrame+h.length-1+1)/a)-1;for(;b<=m;b++)c[e][f].fill(b*
a>=g?1193182/Math.round(1193182/h[Math.floor(b*a-g)]):this.prevValues[e][f],Math.max(b*a-g,0),Math.min((b+1)*a-g,h.length));this.prevValues[e][f]=c[e][f][c[e][f].length-1]}}return!0}}registerProcessor("pc-speaker-precision",l);class n extends AudioWorkletProcessor{process(d,c,a){d=c[0];for(c=0;c<d.length;++c){a=d[c];for(let b=0;b<a.length;++b)a[b]=2*Math.random()-1}return!0}}registerProcessor("white-noise",n)})()
