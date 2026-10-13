export type Telemetry = {
  totalPlayTime: number;
  seekCount: number;
  rewindCount: number;
  playbackSpeeds: number[];
  blurCount: number;
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
