import { ActiveDoc } from '../types';

export interface SampleDocDefinition {
  id: string;
  name: string;
  ext: 'txt' | 'docx' | 'pptx' | 'pdf';
  category: string;
  description: string;
  pages: number;
  readTime: string;
  content: string;
}

export const SAMPLE_DOCS: SampleDocDefinition[] = [
  {
    id: 'sample-boustrophedon',
    name: 'The Science of Boustrophedon Reading.txt',
    ext: 'txt',
    category: 'Cognitive Science & Ergonomics',
    description: 'An exploration of bidirectional reading kinematics, saccadic eye movements, and visual fatigue reduction.',
    pages: 2,
    readTime: '3 min',
    content: `THE SCIENCE AND ART OF BOUSTROPHEDON READING
A Treatise on Visual Ergonomics and Spatial Text Flow

CHAPTER I: THE HISTORICAL CONTINUUM
Boustrophedon, derived from the Ancient Greek terms for "ox-turning", represents one of the most mechanically harmonious methods of human text transcription ever devised. In classical inscriptions of early Greece and the Aegean, lines alternated directions continuously: left-to-right, followed by right-to-left, mimicking the continuous furrowing of a plowed field.

The primary visual benefit of this design lies in the elimination of rapid ocular return sweeps. In standard unidirectional reading, the human eye must execute an abrupt saccade from the right margin across the entire breadth of the page to re-anchor at the start of the next line. This sweep causes momentary disorientations and ocular fatigue.

CHAPTER II: 2D CONTINUOUS VISUAL KINEMATICS
Modern digital readers introduce high-refresh rate display panels that permit smooth viewport translation. When coupled with two-dimensional continuous gliding, the viewport moves fluidly along the printed line. The reader does not need to crane their neck or manually scroll.

When the reader reaches the boundary margin, the camera glides gently down to the subsequent sentence without abrupt jumping. By combining this gliding camera movement with acoustic speech synchronization, both the auditory cortex and the visual processing center remain lock-stepped in perceptual harmony.

CHAPTER III: SYNCHRONIZED AUDITORY ANCHORING
Text-to-Speech engines provide precise word boundary timestamps. By tracking word coordinates and illuminating each spoken term with a distinctive golden beacon, the eye remains anchored at the high-contrast focal point.

Cognitive load is reduced by over forty percent when reading while listening, allowing complex technical documents, academic papers, and long-form literature to be digested with elevated comprehension and minimal fatigue.`,
  },
  {
    id: 'sample-quantum-computing',
    name: 'Executive Brief - Quantum Computing 2026.docx',
    ext: 'docx',
    category: 'Technology & Enterprise Strategy',
    description: 'Executive briefing on fault-tolerant topological qubits, cryogenic interconnects, and commercial timelines.',
    pages: 3,
    readTime: '4 min',
    content: `EXECUTIVE BRIEFING: QUANTUM ACCELERATION 2026
Strategic Overview for Technical Leaders and Architecture Teams

SECTION 1: THE FAULT-TOLERANCE THRESHOLD
Over the past eighteen months, quantum computing has crossed a definitive threshold from noisy intermediate-scale quantum devices into verifiable fault-tolerant logical qubits. Breakthroughs in surface codes and cat-qubit error suppression have decreased physical-to-logical overhead by an entire order of magnitude.

Enterprises in quantitative finance, molecular modeling, and logistics optimization are now benchmarking algorithms against real quantum backends with sub-millisecond coherence times.

SECTION 2: CRYOGENIC SYSTEM INTEGRATION
Scaling quantum hardware past ten thousand physical qubits requires unprecedented breakthroughs in cryogenic CMOS control electronics. Rather than routing individual coaxial lines to room-temperature controllers, next-generation dilution refrigerators incorporate localized cryogenic controllers operating at four kelvin.

This architecture mitigates thermal leakage and enables ultra-dense packaging required for scalable quantum data centers.

SECTION 3: STRATEGIC RECOMMENDATIONS
1. Audit cryptographic foundations immediately to transition toward post-quantum encryption algorithms.
2. Develop domain-specific problem formulations using tensor networks and quantum annealing primitives.
3. Establish cloud hybrid interfaces that seamlessly orchestrate classical HPC clusters with quantum coprocessors.`,
  },
  {
    id: 'sample-spatial-design',
    name: 'Presentation - Spatial Typography & Design.pptx',
    ext: 'pptx',
    category: 'Design Systems',
    description: 'A 4-slide keynote presentation on optical sizing, tactile contrast, and dark mode design principles.',
    pages: 4,
    readTime: '2 min',
    content: `SLIDE 1: THE EVOLUTION OF DIGITAL TYPOGRAPHY
Display geometry has evolved from static pixels into dynamic spatial canvases. Modern interfaces demand responsive optical weights and harmonious contrast ratios.

SLIDE 2: OBSIDIAN CANVAS & ELEVATED SURFACES
Deep obsidian dark palettes provide superior contrast and reduced ocular glare. By utilizing subtle glass elevation rather than noisy border lines, content floats with physical depth and dignity.

SLIDE 3: ATTENTION & FOCAL ANCHORING
A single dominant focal point guides the eye through complex reading material. The golden badge highlight provides immediate orientation without visual clutter or distraction.

SLIDE 4: THE FUTURE OF IMMERSIVE READING
As multi-modal audio and visual systems converge, the boundary between reading and listening dissolves into an effortless sensory flow.`,
  },
];

export function createSampleActiveDoc(sample: SampleDocDefinition): ActiveDoc {
  const enc = new TextEncoder();
  const buffer = enc.encode(sample.content).buffer as ArrayBuffer;
  const blob = new Blob([sample.content], { type: 'text/plain;charset=utf-8' });
  return {
    name: sample.name,
    ext: sample.ext,
    asset: {
      file: blob,
      buffer,
      text: sample.content,
    },
    isSample: true,
  };
}
