export type FileExtension = 'pdf' | 'docx' | 'pptx' | 'txt' | 'md';

export interface RecentDocItem {
  id: string;
  name: string;
  ext: FileExtension;
  preview: string;
  date: number;
  size?: number;
  pageCount?: number;
}

export interface ActiveDoc {
  name: string;
  ext: FileExtension;
  asset: {
    file?: Blob;
    buffer?: ArrayBuffer;
    text?: string;
  };
  isSample?: boolean;
}

export interface WordMetadata {
  start: number;
  end: number;
  node: Text;
  ls: number;
  le: number;
  slide: number;
  page: number;
  block: Element | null;
}

export type ReaderStatus = 'idle' | 'playing' | 'paused';
