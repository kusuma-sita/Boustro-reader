import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  ChevronsLeft,
  ChevronsRight,
  Volume2,
  VolumeX,
  Sliders,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  FileText,
  Presentation,
  FileCode,
  RotateCcw,
  Sparkles,
  Maximize2,
  Check
} from 'lucide-react';
import { ActiveDoc, WordMetadata, ReaderStatus } from '../types';
import { readBlobOrUriBuffer, getFileBlob } from '../utils/storage';
import { SAMPLE_DOCS } from '../data/sampleDocs';

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const JSD = 'https://cdn.jsdelivr.net/npm';

// Dynamic CDN Script Loader with caching
const loadedScripts = new Map<string, Promise<any>>();
function loadExternalScript(src: string, globalName: string): Promise<any> {
  const existing = loadedScripts.get(src);
  if (existing) return existing;

  const promise = new Promise((resolve, reject) => {
    if ((window as any)[globalName]) return resolve((window as any)[globalName]);
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => {
      if ((window as any)[globalName]) resolve((window as any)[globalName]);
      else resolve(true);
    };
    el.onerror = () => reject(new Error(`Failed to load viewer engine: ${globalName}`));
    document.head.appendChild(el);
  });

  loadedScripts.set(src, promise);
  return promise;
}

interface ReaderViewProps {
  doc: ActiveDoc;
  onBack: () => void;
  onPreviewExtracted?: (text: string) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  doc,
  onBack,
  onPreviewExtracted,
}) => {
  const [status, setStatus] = useState<ReaderStatus>('idle');
  const [speed, setSpeed] = useState<number>(1.0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [ready, setReady] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>('Preparing document view…');
  const [error, setError] = useState<string>('');
  const [pageInfo, setPageInfo] = useState<{ i: number; n: number }>({ i: 0, n: 0 });
  const [pageInput, setPageInput] = useState<string>('');
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);
  const [notification, setNotification] = useState<string>('');
  const [showAdjustments, setShowAdjustments] = useState<boolean>(false);
  const [showVoicePicker, setShowVoicePicker] = useState<boolean>(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [readingProgress, setReadingProgress] = useState<number>(0);

  // References to DOM elements
  const vpRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const notificationTimer = useRef<number | null>(null);

  // Reader state machine references
  const words = useRef<WordMetadata[]>([]);
  const starts = useRef<number[]>([0]);
  const slidesRef = useRef<HTMLElement[]>([]);
  const pagesRef = useRef<HTMLElement[]>([]);
  const tops = useRef<number[]>([]);
  const fullText = useRef<string>('');
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;

  // Viewport layout metrics
  const metrics = useRef<{
    scale: number;
    maxX: number;
    maxY: number;
    vw: number;
    vh: number;
    LH: number;
  }>({
    scale: 1,
    maxX: 0,
    maxY: 0,
    vw: 1,
    vh: 1,
    LH: 36,
  });

  // Kinetic motion & engine state
  const engine = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
    panX: number;
    returning: boolean;
    status: ReaderStatus;
    speed: number;
    cur: number;
    token: number;
    follow: boolean;
    slide: number;
    pc: number;
    voice: boolean;
    speaking: boolean;
    vt: number;
    hasTTS: boolean;
  }>({
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    panX: 0,
    returning: false,
    status: 'idle',
    speed: 1.0,
    cur: 0,
    token: 0,
    follow: false,
    slide: 0,
    pc: 0,
    voice: false,
    speaking: false,
    vt: 0,
    hasTTS: typeof window !== 'undefined' && 'speechSynthesis' in window,
  });

  const readerApi = useRef<any>({});

  // Populate SpeechSynthesis voices
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const updateVoices = () => {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) {
          setAvailableVoices(v);
          // Prefer English voice if not selected
          const defaultV = v.find((voice) => voice.lang.startsWith('en') && voice.name.includes('Natural')) ||
            v.find((voice) => voice.lang.startsWith('en')) ||
            v[0];
          if (defaultV && !selectedVoiceURI) {
            setSelectedVoiceURI(defaultV.voiceURI);
          }
        }
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, [selectedVoiceURI]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      if (readerApi.current.layout) {
        readerApi.current.layout();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      engine.current.token++;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  // Show ephemeral toast notice
  const notify = (msg: string) => {
    setNotification(msg);
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = window.setTimeout(() => setNotification(''), 4500);
  };

  // -------------------------------------------------------------
  // Load and Render Document
  // -------------------------------------------------------------
  useEffect(() => {
    let unmounted = false;

    (async () => {
      try {
        setLoadingText('Parsing document stream…');
        const content = contentRef.current;
        if (!content) return;
        content.innerHTML = '';
        pagesRef.current = [];
        slidesRef.current = [];

        // Check if buffer is already present or fetch from IndexedDB or sample registry
        let buffer: ArrayBuffer;
        if (doc.asset.buffer) {
          buffer = doc.asset.buffer;
        } else if (doc.asset.file) {
          buffer = await doc.asset.file.arrayBuffer();
        } else if (doc.asset.text) {
          buffer = new TextEncoder().encode(doc.asset.text).buffer as ArrayBuffer;
        } else {
          // Attempt to retrieve from IndexedDB or match sample doc
          const blob = await getFileBlob(doc.name);
          if (blob) {
            buffer = await blob.arrayBuffer();
          } else {
            const matchingSample = SAMPLE_DOCS.find((s) => s.name === doc.name);
            if (matchingSample) {
              buffer = new TextEncoder().encode(matchingSample.content).buffer as ArrayBuffer;
            } else {
              throw new Error(`Could not find document "${doc.name}". Please re-import the file.`);
            }
          }
        }

        if (unmounted) return;

        const u8 = new Uint8Array(buffer);
        const isZip = buffer.byteLength >= 4 && u8[0] === 0x50 && u8[1] === 0x4B; // PK magic bytes
        const isPdfBinary = buffer.byteLength >= 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46; // %PDF

        // --- PDF Rendering ---
        if (doc.ext === 'pdf') {
          if (isPdfBinary) {
            setLoadingText('Initializing PDF rendering engine…');
            const pdfjs = await loadExternalScript(`${CDN}/pdf.js/3.11.174/pdf.min.js`, 'pdfjsLib');
            pdfjs.GlobalWorkerOptions.workerSrc = `${CDN}/pdf.js/3.11.174/pdf.worker.min.js`;

            const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
            const numPages = pdf.numPages;

            for (let i = 1; i <= numPages; i++) {
              if (unmounted) return;
              setLoadingText(`Rendering page ${i} of ${numPages}…`);
              const page = await pdf.getPage(i);
              const vp = page.getViewport({ scale: 2.0 });

              const holder = document.createElement('div');
              holder.style.cssText = `position:relative;width:${vp.width}px;height:${vp.height}px;margin:0 0 24px 0;background:#ffffff;border-radius:4px;box-shadow:0 12px 32px rgba(0,0,0,0.45);overflow:hidden;`;

              const canvas = document.createElement('canvas');
              canvas.width = vp.width;
              canvas.height = vp.height;
              canvas.style.cssText = `display:block;width:${vp.width}px;height:${vp.height}px;`;

              const textLayer = document.createElement('div');
              textLayer.className = 'bz-text';
              textLayer.style.setProperty('--scale-factor', `${vp.scale}`);

              holder.append(canvas, textLayer);
              content.appendChild(holder);
              pagesRef.current.push(holder);

              await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
              const textContent = await page.getTextContent();
              await pdfjs.renderTextLayer({
                textContentSource: textContent,
                container: textLayer,
                viewport: vp,
                textDivs: [],
              }).promise;
            }
          } else {
            const rawText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
            renderPlainTextPages(rawText, false);
          }
        } 
        // --- DOCX Rendering ---
        else if (doc.ext === 'docx') {
          setLoadingText('Formatting Word document structure…');
          let rendered = false;

          if (isZip) {
            try {
              await loadExternalScript(`${CDN}/jszip/3.10.1/jszip.min.js`, 'JSZip');
              const docx = await loadExternalScript(`${JSD}/docx-preview@0.3.3/dist/docx-preview.min.js`, 'docx');
              content.style.cssText = 'background:#ffffff;color:#111827;padding:24px;border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,0.5);width:960px;min-height:800px;';
              await docx.renderAsync(buffer, content, styleRef.current || undefined, {
                className: 'docx',
                inWrapper: true,
                breakPages: true,
              });

              await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
              const sections = [...content.querySelectorAll('section.docx')] as HTMLElement[];
              if (sections.length > 0) {
                pagesRef.current = sections;
                rendered = true;
              }
            } catch (docxErr) {
              console.warn('docx-preview failed, falling back to text extractor:', docxErr);
              // Fallback: extract text from word/document.xml with JSZip
              try {
                const JSZip = (window as any).JSZip;
                if (JSZip) {
                  const zip = await JSZip.loadAsync(buffer);
                  const docXml = zip.file('word/document.xml');
                  if (docXml) {
                    const xml = await docXml.async('text');
                    const stripped = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    if (stripped) {
                      renderPlainTextPages(stripped, false);
                      rendered = true;
                    }
                  }
                }
              } catch (zipErr) {
                console.warn('JSZip fallback error:', zipErr);
              }
            }
          }

          if (!rendered) {
            // Document is plain text or sample docx
            const rawText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
            renderPlainTextPages(rawText, false);
          }
        } 
        // --- PPTX Rendering ---
        else if (doc.ext === 'pptx') {
          setLoadingText('Generating presentation slide decks…');
          let rendered = false;

          if (isZip) {
            try {
              await loadExternalScript(`${CDN}/jszip/3.10.1/jszip.min.js`, 'JSZip');
              const pptxLib = await loadExternalScript(`${JSD}/pptx-preview/dist/pptx-preview.umd.js`, 'pptxPreview');
              content.style.width = '960px';
              const previewer = pptxLib.init(content, { width: 960, height: 540, mode: 'list' });
              await previewer.preview(buffer);
              await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

              const all = [...content.querySelectorAll('*')] as HTMLElement[];
              const slideCandidates = all.filter(
                (el) => el.offsetWidth >= 880 && Math.abs(el.offsetWidth / el.offsetHeight - 16 / 9) < 0.15
              );
              const set = new Set(slideCandidates);
              slidesRef.current = slideCandidates.filter((el) => {
                for (let p = el.parentElement; p && p !== content; p = p.parentElement) {
                  if (set.has(p)) return false;
                }
                return true;
              });
              if (slidesRef.current.length > 0) {
                pagesRef.current = slidesRef.current;
                rendered = true;
              }
            } catch (pptxErr) {
              console.warn('pptx-preview failed, using slide parser fallback:', pptxErr);
            }
          }

          if (!rendered) {
            const rawText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
            renderPlainTextPages(rawText, true);
          }
        } 
        // --- Plain Text / Markdown Rendering ---
        else {
          setLoadingText('Formatting text pages…');
          const rawText = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
          renderPlainTextPages(rawText, false);
        }

        if (unmounted) return;

        // Next animation frame to measure geometry
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        if (doc.ext === 'docx' && content.querySelectorAll('section.docx').length > 0) {
          pagesRef.current = [...content.querySelectorAll('section.docx')] as HTMLElement[];
        }
        if (doc.ext === 'pptx' && slidesRef.current.length > 0) {
          pagesRef.current = slidesRef.current;
        }
        if (!pagesRef.current.length) {
          pagesRef.current = [content];
        }

        // Build word coordinates & start offsets
        buildWordMap();
        setPageInfo({ i: 0, n: pagesRef.current.length });

        if (slidesRef.current.length > 0) {
          slidesRef.current.forEach((el, idx) => {
            el.style.display = idx === 0 ? '' : 'none';
          });
        }

        if (onPreviewExtracted && fullText.current) {
          onPreviewExtracted(fullText.current.slice(0, 220));
        }

        setReady(true);
      } catch (err: unknown) {
        if (!unmounted) {
          const msg = err instanceof Error ? err.message : 'Unable to render this document.';
          setError(msg);
          setReady(true);
        }
      }
    })();

    return () => {
      unmounted = true;
    };
  }, [doc]);

  // Helper for Plain Text & Slide Page Generation
  function renderPlainTextPages(rawText: string, isSlides: boolean) {
    const content = contentRef.current;
    if (!content) return;
    content.innerHTML = '';

    if (isSlides || rawText.includes('SLIDE ')) {
      // Split into slides
      const slideParts = rawText.split(/(?=SLIDE\s+\d+:)/i).filter((s) => s.trim());
      slideParts.forEach((slideTxt, idx) => {
        const slideEl = document.createElement('div');
        slideEl.style.cssText = `width:960px;min-height:540px;background:#ffffff;color:#0F172A;border-radius:12px;padding:56px 64px;box-sizing:border-box;margin:0 0 32px 0;box-shadow:0 16px 40px rgba(0,0,0,0.5);display:${
          idx === 0 ? 'flex' : 'none'
        };flex-direction:column;justify-content:center;`;
        
        const lines = slideTxt.trim().split('\n');
        const title = lines[0];
        const body = lines.slice(1).join('\n');

        const titleEl = document.createElement('h2');
        titleEl.style.cssText = 'font-size:32px;font-weight:700;color:#0F172A;margin-bottom:24px;line-height:1.2;';
        titleEl.textContent = title;
        slideEl.appendChild(titleEl);

        const bodyEl = document.createElement('p');
        bodyEl.style.cssText = 'font-size:22px;line-height:1.7;color:#334155;white-space:pre-wrap;';
        bodyEl.textContent = body;
        slideEl.appendChild(bodyEl);

        content.appendChild(slideEl);
        slidesRef.current.push(slideEl);
      });
      pagesRef.current = slidesRef.current;
    } else {
      // Elegant multi-page book formatting for TXT
      const paragraphs = rawText.split(/\n\s*\n/).filter((p) => p.trim());
      const wordsPerPage = 260;
      let currentPageText: string[] = [];
      let currentWordCount = 0;
      const pagesData: string[][] = [];

      paragraphs.forEach((para) => {
        const pWords = para.split(/\s+/).length;
        if (currentWordCount + pWords > wordsPerPage && currentPageText.length > 0) {
          pagesData.push(currentPageText);
          currentPageText = [para];
          currentWordCount = pWords;
        } else {
          currentPageText.push(para);
          currentWordCount += pWords;
        }
      });
      if (currentPageText.length > 0) {
        pagesData.push(currentPageText);
      }

      pagesData.forEach((pageParas, pIdx) => {
        const pageHolder = document.createElement('div');
        pageHolder.style.cssText = `position:relative;width:880px;min-height:850px;background:#ffffff;color:#0F172A;border-radius:8px;padding:64px 72px;box-sizing:border-box;margin:0 0 36px 0;box-shadow:0 16px 40px rgba(0,0,0,0.45);font-family:'Plus Jakarta Sans', Georgia, serif;`;

        // Page header / number
        const pgHeader = document.createElement('div');
        pgHeader.style.cssText = 'display:flex;justify-content:space-between;border-bottom:1px solid #E2E8F0;padding-bottom:12px;margin-bottom:32px;font-size:12px;color:#94A3B8;letter-spacing:0.05em;text-transform:uppercase;font-weight:600;';
        pgHeader.innerHTML = `<span>${doc.name}</span><span>Page ${pIdx + 1} of ${pagesData.length}</span>`;
        pageHolder.appendChild(pgHeader);

        pageParas.forEach((p) => {
          if (/^[A-Z0-9\s:—\-]{4,}$/.test(p.trim().slice(0, 30)) || p.startsWith('CHAPTER ') || p.startsWith('SECTION ')) {
            const h = document.createElement('h2');
            h.style.cssText = 'font-size:24px;font-weight:700;color:#0F172A;margin:28px 0 16px 0;line-height:1.3;letter-spacing:-0.01em;';
            h.textContent = p;
            pageHolder.appendChild(h);
          } else {
            const pEl = document.createElement('p');
            pEl.style.cssText = 'font-size:18px;line-height:1.75;color:#334155;margin-bottom:20px;text-align:justify;';
            pEl.textContent = p;
            pageHolder.appendChild(pEl);
          }
        });

        content.appendChild(pageHolder);
        pagesRef.current.push(pageHolder);
      });
    }
  }

  // -------------------------------------------------------------
  // Word Coordinate Extractor
  // -------------------------------------------------------------
  function buildWordMap() {
    if (!contentRef.current) return;
    const treeWalker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
    const textNodes: { node: Text; start: number }[] = [];
    let aggregatedText = '';
    let currNode: Node | null;

    while ((currNode = treeWalker.nextNode())) {
      const val = currNode.nodeValue || '';
      if (!val.trim() || /^(STYLE|SCRIPT)$/i.test(currNode.parentNode?.nodeName || '')) continue;
      textNodes.push({ node: currNode as Text, start: aggregatedText.length });
      aggregatedText += val + ' ';
    }

    const pageOf = (node: Node) => Math.max(0, pagesRef.current.findIndex((pg) => pg.contains(node)));
    const slideOf = (node: Node) => slidesRef.current.findIndex((sl) => sl.contains(node));
    const blockOf = (node: Node) =>
      node.parentElement?.closest('p,li,h1,h2,h3,h4,h5,h6,td,th,div') || node.parentElement;

    const out: WordMetadata[] = [];
    const sentenceStarts: number[] = [];
    const regex = /\S+/g;
    const nodeCache = new Map<Node, { slide: number; page: number; block: Element | null }>();
    let match: RegExpExecArray | null;
    let nodeIdx = 0;

    while ((match = regex.exec(aggregatedText))) {
      while (nodeIdx + 1 < textNodes.length && textNodes[nodeIdx + 1].start <= match.index) {
        nodeIdx++;
      }
      const item = textNodes[nodeIdx];
      const node = item.node;
      const ls = match.index - item.start;

      if (!nodeCache.has(node)) {
        nodeCache.set(node, {
          slide: slideOf(node),
          page: pageOf(node),
          block: blockOf(node),
        });
      }
      const info = nodeCache.get(node)!;
      const w: WordMetadata = {
        start: match.index,
        end: match.index + match[0].length,
        node,
        ls,
        le: ls + match[0].length,
        slide: info.slide,
        page: info.page,
        block: info.block,
      };

      const prev = out[out.length - 1];
      // Detect sentence / line boundaries
      if (
        !prev ||
        prev.page !== w.page ||
        prev.block !== w.block ||
        /[.!?\u2026]["'\u201d\u2019)\]]*$/.test(aggregatedText.slice(prev.start, prev.end)) ||
        aggregatedText.slice(prev.end, w.start).includes('\n')
      ) {
        sentenceStarts.push(out.length);
      }
      out.push(w);
    }

    words.current = out;
    fullText.current = aggregatedText;
    starts.current = sentenceStarts.length ? sentenceStarts : [0];
  }

  // -------------------------------------------------------------
  // Layout Metrics
  // -------------------------------------------------------------
  readerApi.current.layout = () => {
    const content = contentRef.current;
    const vp = vpRef.current?.getBoundingClientRect();
    if (!content || !vp || !scalerRef.current) return;

    const nw = Math.max(1, content.scrollWidth);
    const nh = Math.max(1, content.scrollHeight);
    const canvasW = vp.width * 1.35 * zoomRef.current;
    const scale = canvasW / nw;

    metrics.current = {
      scale,
      maxX: Math.max(0, canvasW - vp.width),
      maxY: Math.max(0, nh * scale - vp.height),
      vw: vp.width,
      vh: vp.height,
      LH: 38 * zoomRef.current,
    };

    scalerRef.current.style.width = nw + 'px';
    scalerRef.current.style.transform = `scale(${scale})`;

    if (!slidesRef.current.length && pagesRef.current.length > 0) {
      const cr = content.getBoundingClientRect();
      tops.current = pagesRef.current.map((pg) => (pg.getBoundingClientRect().top - cr.top) / scale);
    }
  };

  useEffect(() => {
    if (!ready) return;
    readerApi.current.layout();
    const x = engine.current;
    x.x = Math.min(x.x, metrics.current.maxX);
    x.y = Math.min(x.y, metrics.current.maxY);
    x.panX = x.x;
    x.tx = x.x;
    x.ty = x.y;

    if (words.current.length && x.status !== 'idle') {
      readerApi.current.focus(x.cur, true);
    } else {
      applyTransform();
    }
  }, [ready, zoom]);

  function applyTransform() {
    if (!wrapRef.current) return;
    const x = engine.current;
    wrapRef.current.style.transform = `translate3d(${-x.x}px,${-x.y}px,0)`;
  }

  // -------------------------------------------------------------
  // Continuous 2D Boustrophedon rAF Engine
  // -------------------------------------------------------------
  useEffect(() => {
    let raf: number;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const x = engine.current;
      const mm = metrics.current;
      const ease = (k: number) => 1 - Math.exp(-k * dt);

      if (x.status === 'playing') {
        // Silent Mode (when Read Aloud is OFF): virtual reading clock advances word highlight
        if (x.follow && !x.speaking) {
          const W = words.current;
          const cw = W[x.cur];
          if (cw) {
            const txt = fullText.current.slice(cw.start, cw.end);
            x.vt += dt;
            const dur =
              (0.08 + 0.045 * txt.length + (/[.!?]$/.test(txt) ? 0.32 : /[,;:]$/.test(txt) ? 0.14 : 0)) /
              x.speed;
            if (x.vt >= dur) {
              x.vt -= dur;
              if (x.cur + 1 >= W.length) {
                readerApi.current.stop();
                raf = requestAnimationFrame(tick);
                return;
              }
              readerApi.current.focus(x.cur + 1);
            }
          }
        }

        // Camera follow modes
        if (x.follow) {
          // Glide smoothly toward active word beacon
          x.x += (x.tx - x.x) * ease(5.5);
          x.y += (x.ty - x.y) * ease(5.5);
          x.panX = x.x;
        } else if (x.returning) {
          // Carriage return glide: sweep back to left margin and step down one line
          x.x += (0 - x.x) * ease(9);
          x.y += (x.ty - x.y) * ease(9);
          if (x.x < 1.5) {
            x.x = 0;
            x.panX = 0;
            x.returning = false;
          }
        } else {
          // Continuous pan across the line at chosen reading speed
          x.panX += 95 * x.speed * dt;
          x.x = x.panX;
          x.y += (x.ty - x.y) * ease(9);
          if (x.panX >= mm.maxX) {
            if (x.ty >= mm.maxY - 1) {
              readerApi.current.endOfUnit();
            } else {
              x.panX = mm.maxX;
              x.x = mm.maxX;
              x.returning = true;
              x.ty = Math.min(mm.maxY, x.ty + mm.LH);
            }
          }
        }

        // Periodic page number update
        if (!x.follow && !slidesRef.current.length && ++x.pc % 12 === 0) {
          const yy = (x.y + mm.vh * 0.4) / mm.scale;
          let pg = 0;
          tops.current.forEach((t, i) => {
            if (t <= yy) pg = i;
          });
          readerApi.current.setPage(pg);
        }

        // Update overall reading progress percentage
        if (words.current.length > 0) {
          setReadingProgress(Math.round(((x.cur + 1) / words.current.length) * 100));
        }

        applyTransform();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // -------------------------------------------------------------
  // Binary Search Word Lookup
  // -------------------------------------------------------------
  const findWord = (abs: number) => {
    const w = words.current;
    let lo = 0;
    let hi = w.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (w[mid].start <= abs) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  };

  // -------------------------------------------------------------
  // Focus & High-Fidelity Word Highlighting
  // -------------------------------------------------------------
  readerApi.current.focus = (idx: number, snap?: boolean) => {
    const w = words.current[idx];
    if (!w || !contentRef.current || !hlRef.current) return;
    const x = engine.current;

    if (slidesRef.current.length && w.slide >= 0 && w.slide !== x.slide) {
      readerApi.current.showSlide(w.slide);
      snap = true;
    }

    const mm = metrics.current;
    x.cur = idx;
    readerApi.current.setPage(w.page);

    try {
      const range = document.createRange();
      range.setStart(w.node, Math.min(w.ls, w.node.nodeValue?.length || 0));
      range.setEnd(w.node, Math.min(w.le, w.node.nodeValue?.length || 0));

      const rect = range.getBoundingClientRect();
      const cRect = contentRef.current.getBoundingClientRect();

      const px = (rect.left - cRect.left) / mm.scale;
      const py = (rect.top - cRect.top) / mm.scale;
      const pw = rect.width / mm.scale;
      const ph = rect.height / mm.scale;

      const hl = hlRef.current;
      hl.style.display = 'block';
      hl.style.left = `${px - 3}px`;
      hl.style.top = `${py - 2}px`;
      hl.style.width = `${pw + 6}px`;
      hl.style.height = `${ph + 4}px`;

      x.tx = Math.min(mm.maxX, Math.max(0, (px + pw / 2) * mm.scale - mm.vw / 2));
      x.ty = Math.min(mm.maxY, Math.max(0, (py + ph / 2) * mm.scale - mm.vh / 2));

      if (snap) {
        x.x = x.tx;
        x.y = x.ty;
        x.panX = x.x;
        applyTransform();
      }
    } catch {
      // Range safety fallback
    }
  };

  // -------------------------------------------------------------
  // Speech Synthesis & Boundary Sync
  // -------------------------------------------------------------
  readerApi.current.speakFrom = (idx: number) => {
    if (!window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const x = engine.current;
    const W = words.current;

    synth.cancel();
    x.speaking = true;
    x.vt = 0;
    const token = ++x.token;

    const speakChunk = (si: number) => {
      if (token !== x.token) return;
      if (si >= W.length) {
        readerApi.current.stop();
        return;
      }

      let ei = si + 1;
      while (ei < W.length && W[ei].page === W[si].page && W[ei].end - W[si].start < 220) {
        ei++;
      }

      const chunkText = fullText.current.slice(W[si].start, W[ei - 1].end);
      const utterance = new SpeechSynthesisUtterance(chunkText);
      utterance.rate = Math.min(2.5, Math.max(0.5, x.speed));

      // Apply selected voice
      if (selectedVoiceURI) {
        const found = availableVoices.find((v) => v.voiceURI === selectedVoiceURI);
        if (found) utterance.voice = found;
      }

      utterance.onboundary = (ev) => {
        if (token === x.token && (!ev.name || ev.name === 'word')) {
          const targetWordIdx = findWord(W[si].start + ev.charIndex);
          readerApi.current.focus(targetWordIdx);
        }
      };

      utterance.onend = () => speakChunk(ei);
      utterance.onerror = (ev) => {
        if (ev.error !== 'canceled' && ev.error !== 'interrupted') {
          speakChunk(ei);
        }
      };

      readerApi.current.focus(si);
      synth.speak(utterance);
    };

    x.follow = true;
    speakChunk(idx);
  };

  readerApi.current.showSlide = (i: number) => {
    slidesRef.current.forEach((el, k) => {
      el.style.display = k === i ? 'flex' : 'none';
    });
    engine.current.slide = i;
    readerApi.current.setPage(i);
    readerApi.current.layout();
  };

  readerApi.current.endOfUnit = () => {
    const x = engine.current;
    const n = slidesRef.current.length;
    if (n && x.slide < n - 1) {
      readerApi.current.showSlide(x.slide + 1);
      const first = words.current.findIndex((w) => w.slide === x.slide);
      if (first >= 0) x.cur = first;
      x.x = x.y = x.tx = x.ty = x.panX = 0;
      x.returning = false;
      applyTransform();
    } else {
      readerApi.current.stop();
    }
  };

  readerApi.current.skip = (dir: number) => {
    const x = engine.current;
    const S = starts.current;
    if (!words.current.length) return;

    let k = 0;
    for (let lo = 0, hi = S.length - 1; lo <= hi; ) {
      const mid = (lo + hi) >> 1;
      if (S[mid] <= x.cur) {
        k = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const target =
      dir > 0 ? S[Math.min(S.length - 1, k + 1)] : x.cur - S[k] > 2 ? S[k] : S[Math.max(0, k - 1)];
    x.cur = target;

    if (x.status === 'playing') {
      readerApi.current.startFrom(target);
    } else {
      readerApi.current.focus(target, true);
    }
  };

  readerApi.current.setPage = (i: number) => {
    setPageInfo((p) => (p.i === i ? p : { ...p, i }));
  };

  readerApi.current.jump = (p: number) => {
    const x = engine.current;
    const W = words.current;
    const slideMode = slidesRef.current.length > 0;
    if (!(p >= 0 && p < pagesRef.current.length)) return;

    const idx = W.findIndex((w) => w.page >= p);
    const hasText = idx >= 0 && W[idx].page === p;

    if (slideMode) readerApi.current.showSlide(p);
    readerApi.current.setPage(p);
    x.returning = false;
    if (idx >= 0) x.cur = idx;

    if (!hasText) {
      if (hlRef.current) hlRef.current.style.display = 'none';
      const pageY = slideMode
        ? 0
        : Math.min(metrics.current.maxY, Math.max(0, (tops.current[p] || 0) * metrics.current.scale));
      x.tx = 0;
      x.ty = pageY;
      x.x = x.panX = 0;
      x.y = x.ty;
      applyTransform();
      notify(idx >= 0 ? `Page ${p + 1} has no text. Resuming from page ${W[idx].page + 1}.` : 'Page has no text to read.');
      if (idx >= 0 && x.status === 'playing') readerApi.current.startFrom(idx);
      return;
    }

    if (x.status === 'playing') {
      readerApi.current.startFrom(idx);
      x.x = x.tx;
      x.y = x.ty;
      x.panX = x.x;
      applyTransform();
    } else {
      readerApi.current.focus(idx, true);
    }
  };

  readerApi.current.startFrom = (idx: number) => {
    const x = engine.current;
    x.token++;
    x.vt = 0;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (!words.current.length) return;
    x.follow = true;

    if (x.voice && x.hasTTS) {
      readerApi.current.speakFrom(idx);
    } else {
      x.speaking = false;
      readerApi.current.focus(idx);
    }
  };

  readerApi.current.setVoice = (on: boolean) => {
    const x = engine.current;
    if (on && !x.hasTTS) {
      notify('Text-to-Speech is not available in this browser environment.');
      return;
    }
    x.voice = on;
    setVoiceEnabled(on);
    if (x.status !== 'playing') return;

    if (on) {
      readerApi.current.speakFrom(x.cur);
    } else {
      x.token++;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      x.speaking = false;
      x.vt = 0;
    }
  };

  readerApi.current.play = () => {
    const x = engine.current;
    x.status = 'playing';
    setStatus('playing');
    readerApi.current.startFrom(x.cur);
  };

  readerApi.current.pause = () => {
    const x = engine.current;
    x.status = 'paused';
    setStatus('paused');
    x.token++;
    x.follow = false;
    x.speaking = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  readerApi.current.stop = () => {
    const x = engine.current;
    x.token++;
    x.status = 'idle';
    setStatus('idle');
    x.follow = false;
    x.speaking = false;
    x.returning = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (slidesRef.current.length && x.slide !== 0) {
      readerApi.current.showSlide(0);
    }
    x.cur = 0;
    x.x = x.y = x.tx = x.ty = x.panX = 0;
    readerApi.current.setPage(0);
    if (hlRef.current) hlRef.current.style.display = 'none';
    applyTransform();
  };

  const handleSpeedChange = (delta: number) => {
    const next = Math.min(5.0, Math.max(0.5, Math.round((speed + delta) * 4) / 4));
    setSpeed(next);
    engine.current.speed = next;
    if (engine.current.status === 'playing' && engine.current.speaking) {
      readerApi.current.speakFrom(engine.current.cur);
    }
  };

  const handleZoomChange = (delta: number) => {
    setZoom((z) => Math.min(3.0, Math.max(0.75, Math.round((z + delta) * 4) / 4)));
  };

  const unit = doc.ext === 'pptx' ? 'Slide' : 'Page';
  const pageValid =
    ready &&
    /^\d+$/.test(pageInput.trim()) &&
    +pageInput >= 1 &&
    +pageInput <= pageInfo.n;

  const handlePageJumpSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pageValid) {
      readerApi.current.jump(+pageInput - 1);
      setPageInput('');
    }
  };

  const togglePlayPause = () => {
    if (status === 'playing') readerApi.current.pause();
    else readerApi.current.play();
  };

  // Click-to-read on document canvas
  const handleContentClick = (e: React.MouseEvent) => {
    if (!words.current.length) return;
    const clickTarget = e.target as HTMLElement;
    // Check if target contains text
    const clickedText = clickTarget.textContent || '';
    if (!clickedText) return;

    // Search closest word around point
    const rect = clickTarget.getBoundingClientRect();
    const mm = metrics.current;
    const cRect = contentRef.current?.getBoundingClientRect();
    if (!cRect) return;

    const clickRelX = (e.clientX - cRect.left) / mm.scale;
    const clickRelY = (e.clientY - cRect.top) / mm.scale;

    // Find nearest word
    let bestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < words.current.length; i += 3) {
      const w = words.current[i];
      try {
        const r = document.createRange();
        r.setStart(w.node, w.ls);
        r.setEnd(w.node, w.le);
        const b = r.getBoundingClientRect();
        const bx = (b.left - cRect.left) / mm.scale;
        const by = (b.top - cRect.top) / mm.scale;
        const dist = Math.hypot(bx - clickRelX, by - clickRelY);
        if (dist < minDistance) {
          minDistance = dist;
          bestIdx = i;
        }
      } catch {
        // skip
      }
    }

    if (minDistance < 250) {
      if (engine.current.status === 'playing') {
        readerApi.current.startFrom(bestIdx);
      } else {
        readerApi.current.focus(bestIdx, true);
      }
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0D0D12] text-[#EDEDED] select-none overflow-hidden">
      {/* Reading Progress Line */}
      <div className="h-0.5 w-full bg-[#1A1A24] z-50">
        <div
          className="h-full bg-gradient-to-r from-[#3B82F6] to-[#F59E0B] transition-all duration-150"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* -------------------------------------------------------------
          Floating Top Glassmorphic Control Panel
      -------------------------------------------------------------- */}
      <header className="z-40 px-4 py-3 bg-[#1A1A24]/90 backdrop-blur-xl border-b border-[#2A2A3B] shadow-2xl transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          {/* 1. Navigation Cluster */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                readerApi.current.stop();
                onBack();
              }}
              className="px-3 py-1.5 rounded-lg bg-[#242433] hover:bg-[#2F2F44] text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#2A2A3B]"
              title="Return to Library"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Library</span>
            </button>

            {/* Document Title with Format Badge */}
            <div className="flex items-center gap-2 max-w-[140px] sm:max-w-[220px] md:max-w-[280px]">
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 uppercase shrink-0">
                {doc.ext}
              </span>
              <h1 className="text-xs sm:text-sm font-semibold text-white truncate" title={doc.name}>
                {doc.name}
              </h1>
            </div>

            {/* Page Jump & Counter */}
            <div className="hidden lg:flex items-center gap-1 bg-[#12121A] px-2 py-1 rounded-lg border border-[#2A2A3B] text-xs">
              <button
                onClick={() => readerApi.current.jump(Math.max(0, pageInfo.i - 1))}
                disabled={!ready || pageInfo.i <= 0}
                className="p-1 rounded hover:bg-[#242433] disabled:opacity-30 disabled:pointer-events-none text-slate-300"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <form onSubmit={handlePageJumpSubmit} className="flex items-center gap-1">
                <input
                  type="text"
                  value={pageInput}
                  placeholder={`${ready ? pageInfo.i + 1 : '-'}`}
                  onChange={(e) => setPageInput(e.target.value)}
                  className="w-10 px-1 py-0.5 text-center bg-[#1A1A24] border border-[#2A2A3B] rounded text-white text-xs focus:outline-none focus:border-blue-500"
                />
                <span className="text-slate-500">/ {ready ? pageInfo.n : '-'}</span>
                {pageInput && pageValid && (
                  <button
                    type="submit"
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-500"
                  >
                    Go
                  </button>
                )}
              </form>

              <button
                onClick={() => readerApi.current.jump(Math.min(pageInfo.n - 1, pageInfo.i + 1))}
                disabled={!ready || pageInfo.i >= pageInfo.n - 1}
                className="p-1 rounded hover:bg-[#242433] disabled:opacity-30 disabled:pointer-events-none text-slate-300"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 2 & 3. Primary Play / Pause / Skip Group */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Skip Line Backward */}
            <button
              onClick={() => readerApi.current.skip(-1)}
              disabled={!ready}
              className="p-2 rounded-lg bg-[#242433] hover:bg-[#2F2F44] text-slate-200 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-[#2A2A3B]"
              title="Skip backward one sentence/line (<<)"
              aria-label="Skip Backward"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            {/* Primary Play / Pause Toggle */}
            <button
              onClick={togglePlayPause}
              disabled={!ready}
              className={`px-4 sm:px-5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md ${
                status === 'playing'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-amber-500/20 active:scale-95'
                  : 'bg-gradient-to-r from-[#3B82F6] to-[#6366F1] text-white shadow-blue-500/25 hover:from-[#2563EB] hover:to-[#4F46E5] active:scale-95'
              }`}
            >
              {status === 'playing' ? (
                <>
                  <Pause className="w-4 h-4 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span>Play</span>
                </>
              )}
            </button>

            {/* Skip Line Forward */}
            <button
              onClick={() => readerApi.current.skip(1)}
              disabled={!ready}
              className="p-2 rounded-lg bg-[#242433] hover:bg-[#2F2F44] text-slate-200 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-[#2A2A3B]"
              title="Skip forward one sentence/line (>>)"
              aria-label="Skip Forward"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>

            {/* Stop / Reset Button */}
            <button
              onClick={() => readerApi.current.stop()}
              disabled={!ready || (status === 'idle' && engine.current.cur === 0)}
              className="p-2 rounded-lg bg-[#242433] hover:bg-rose-500/20 hover:text-rose-400 text-slate-300 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed border border-[#2A2A3B]"
              title="Reset reading position"
              aria-label="Stop Reading"
            >
              <Square className="w-4 h-4" />
            </button>
          </div>

          {/* 4 & 5. Audio Mode & Adjustments Cluster */}
          <div className="flex items-center gap-2">
            {/* Read Aloud Toggle */}
            <button
              onClick={() => readerApi.current.setVoice(!voiceEnabled)}
              disabled={!ready}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer border ${
                voiceEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                  : 'bg-[#242433] text-slate-300 hover:text-white border-[#2A2A3B]'
              }`}
              title={
                voiceEnabled
                  ? 'Audio narration active. Click to read silently with visual highlight only.'
                  : 'Silent glide active. Click to enable synchronized speech narration.'
              }
            >
              {voiceEnabled ? (
                <>
                  <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span>Read Aloud: ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4 text-slate-400" />
                  <span>Read Aloud: OFF</span>
                </>
              )}
            </button>

            {/* Adjustments Dropdown Popover Button */}
            <div className="relative">
              <button
                onClick={() => setShowAdjustments(!showAdjustments)}
                className={`p-2 rounded-lg transition-colors cursor-pointer border ${
                  showAdjustments
                    ? 'bg-[#3B82F6] text-white border-blue-400'
                    : 'bg-[#242433] hover:bg-[#2F2F44] text-slate-300 hover:text-white border-[#2A2A3B]'
                }`}
                title="Adjust reading speed and zoom"
              >
                <Sliders className="w-4 h-4" />
              </button>

              {/* Adjustments Flyout Popover */}
              {showAdjustments && (
                <div className="absolute right-0 top-12 w-72 p-4 rounded-xl glass-dropdown z-50 text-xs space-y-4 shadow-2xl animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between pb-2 border-b border-[#2A2A3B]">
                    <span className="font-semibold text-white">Reading Controls</span>
                    <button
                      onClick={() => setShowAdjustments(false)}
                      className="text-slate-400 hover:text-white text-xs"
                    >
                      Close
                    </button>
                  </div>

                  {/* Speed Adjustment */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Flow Speed</span>
                      <span className="font-bold text-white tabular-nums bg-[#12121A] px-2 py-0.5 rounded border border-[#2A2A3B]">
                        {speed.toFixed(2)}x
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleSpeedChange(-0.25)}
                        className="px-2 py-1 rounded bg-[#242433] hover:bg-[#2F2F44] text-white font-bold"
                      >
                        -
                      </button>
                      <div className="flex-1 grid grid-cols-4 gap-1">
                        {[1.0, 1.25, 1.5, 2.0].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => {
                              setSpeed(preset);
                              engine.current.speed = preset;
                              if (engine.current.status === 'playing' && engine.current.speaking) {
                                readerApi.current.speakFrom(engine.current.cur);
                              }
                            }}
                            className={`py-1 rounded text-[11px] font-medium transition-colors ${
                              Math.abs(speed - preset) < 0.05
                                ? 'bg-blue-600 text-white font-bold'
                                : 'bg-[#1E1E2B] text-slate-400 hover:text-white'
                            }`}
                          >
                            {preset}x
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => handleSpeedChange(0.25)}
                        className="px-2 py-1 rounded bg-[#242433] hover:bg-[#2F2F44] text-white font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Zoom Adjustment */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Canvas Zoom</span>
                      <span className="font-bold text-white tabular-nums bg-[#12121A] px-2 py-0.5 rounded border border-[#2A2A3B]">
                        {Math.round(zoom * 100)}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleZoomChange(-0.25)}
                        className="p-1.5 flex-1 rounded bg-[#242433] hover:bg-[#2F2F44] text-white flex items-center justify-center gap-1"
                        title="Zoom out"
                      >
                        <ZoomOut className="w-3.5 h-3.5" /> -25%
                      </button>
                      <button
                        onClick={() => setZoom(1.0)}
                        className="p-1.5 rounded bg-[#1E1E2B] hover:bg-[#242433] text-slate-300"
                        title="Reset zoom to 100%"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleZoomChange(0.25)}
                        className="p-1.5 flex-1 rounded bg-[#242433] hover:bg-[#2F2F44] text-white flex items-center justify-center gap-1"
                        title="Zoom in"
                      >
                        <ZoomIn className="w-3.5 h-3.5" /> +25%
                      </button>
                    </div>
                  </div>

                  {/* Voice Selector */}
                  {availableVoices.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-[#2A2A3B]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Speech Voice</span>
                      </div>
                      <select
                        value={selectedVoiceURI}
                        onChange={(e) => setSelectedVoiceURI(e.target.value)}
                        className="w-full p-1.5 rounded bg-[#12121A] border border-[#2A2A3B] text-white text-xs focus:outline-none focus:border-blue-500"
                      >
                        {availableVoices.map((v) => (
                          <option key={v.voiceURI} value={v.voiceURI}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Ephemeral Notification Banner */}
      {notification && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-amber-500/90 text-black font-semibold text-xs shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-1">
          {notification}
        </div>
      )}

      {/* -------------------------------------------------------------
          Document Viewport & Canvas Layout
      -------------------------------------------------------------- */}
      <div
        ref={vpRef}
        onClick={handleContentClick}
        className="relative flex-1 overflow-hidden bg-[#0D0D12] cursor-crosshair"
      >
        {/* Subtle grid background to enhance depth */}
        <div
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />

        {/* Continuous Gliding Container */}
        <div
          ref={wrapRef}
          className="absolute left-0 top-0 will-change-transform"
          style={{ transform: 'translate3d(0,0,0)' }}
        >
          <div
            ref={scalerRef}
            className="relative"
            style={{ transformOrigin: '0 0' }}
          >
            {/* The Document Visual Frame (White paper inside obsidian canvas) */}
            <div
              ref={contentRef}
              className="relative w-max p-12 reader-canvas-shadow rounded-sm"
            />

            {/* TTS Active Word Highlight Badge */}
            <div
              ref={hlRef}
              className="tts-word-highlight"
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Invisible style holder for docx */}
        <div ref={styleRef} className="hidden" />

        {/* Loading Overlay */}
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0D0D12]/95 backdrop-blur-sm z-30 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#3B82F6] to-[#6366F1] flex items-center justify-center animate-spin">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="text-center space-y-1">
              <div className="text-sm font-semibold text-white tracking-wide">{loadingText}</div>
              <p className="text-xs text-slate-500">Preparing high-resolution text matrix and saccadic path</p>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute top-6 left-6 right-6 p-4 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-300 text-sm backdrop-blur-md z-40 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError('')}
              className="px-3 py-1 rounded bg-rose-900 text-white text-xs font-semibold hover:bg-rose-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Quick Viewport Hint (Bottom Corner) */}
        {ready && (
          <div className="absolute bottom-4 right-4 z-20 px-3 py-1.5 rounded-lg bg-[#1A1A24]/80 backdrop-blur-md border border-[#2A2A3B] text-[11px] text-slate-400 flex items-center gap-3">
            <span>{unit} {pageInfo.i + 1} of {pageInfo.n}</span>
            <span>·</span>
            <span>Click any word to anchor</span>
          </div>
        )}
      </div>
    </div>
  );
};
