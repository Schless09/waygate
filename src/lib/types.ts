export type Telemetry = {
  totalPlayTime: number;
  seekCount: number;
  rewindCount: number;
  playbackSpeeds: number[];
  blurCount: number;
  pasteCount: number;
  pastedChars: number;
  quizAnswers?: number[];
  pauseCount?: number;
  longestPlayRun?: number;
  keystrokes?: number;
  largeInserts?: number;
  largeInsertChars?: number;
  heard?: [number, number][];
  snapshots?: TranscriptSnapshot[];
  reloads?: number;
};

export type TranscriptSnapshot = {
  t: number;
  heardTo: number;
  tail: string;
};

export type ReferenceUtterance = {
  speaker: string;
  begin_time: number;
  end_time: number;
  text: string;
};

export type ClipSummary = {
  id: string;
  slug: string;
  title: string;
  duration_seconds: number;
  speaker_count: number;
  difficulty: string;
  sort_order: number;
  audioUrl: string;
};
