// Shapes returned by upande_spatial.api.inspection (Upande ERP).

export type RunStatus = 'Planned' | 'Downloaded' | 'In Progress' | 'Completed' | 'Partially Completed' | 'Cancelled';
export type VisitStatus = 'Pending' | 'Passed' | 'Failed' | 'Skipped';
export type AnswerType = 'Yes/No' | 'Select' | 'Number' | 'Text' | 'Photo' | 'Signature';

export interface RunSummary {
  name: string;
  plan: string;
  farm?: string | null;
  scheduled_date: string;
  status: RunStatus;
  total_waypoints: number;
  visited: number;
  passed: number;
  failed: number;
  skipped: number;
  checkin_radius_m: number;
  distance_walked_m?: number | null;
}

export interface Question {
  question: string;
  answer_type: AnswerType;
  required: number;
  options: string[];
  fail_when?: string | null;
  help_text?: string | null;
}

export interface Template {
  name: string;
  asset_role?: string | null;
  description?: string | null;
  questions: Question[];
}

export interface AssetDetails {
  name: string;
  title?: string | null;
  role?: string | null;
  layer?: string | null;
  properties: Record<string, unknown>;
  length_m?: number | null;
  area_sq_m?: number | null;
}

export interface Visit {
  name: string;
  sequence: number;
  waypoint_title: string;
  status: VisitStatus;
  asset?: string | null;
  template?: string | null;
  target_lat: number;
  target_lon: number;
  arrived_at?: string | null;
  within_radius?: number;
  completed_at?: string | null;
  skip_reason?: string | null;
  instructions?: string | null;
  asset_details?: AssetDetails | null;
}

export interface RunPackage {
  run: RunSummary & { inspector: string; started_at?: string | null };
  plan: { name: string; description?: string | null; farm?: string | null; checkin_radius_m: number };
  visits: Visit[];
  templates: Record<string, Template>;
}

export interface CheckInResult {
  within_radius: boolean;
  distance_m: number | null;
  radius_m: number;
}

export interface AnswerInput {
  question: string;
  answer?: string | null;
  photo?: string | null;
}

export interface SubmitResult {
  status: VisitStatus;
  visit: string;
  failed_questions?: string[];
  duplicate?: boolean;
}

export interface PhotoInput {
  uri: string;
  name: string;
  type: string;
  file?: Blob; // web: the picked File
}

/** What the screens talk to - the real ERP or the bundled demo. */
export interface Backend {
  readonly demo: boolean;
  myRuns(): Promise<RunSummary[]>;
  downloadRun(run: string): Promise<RunPackage>;
  checkIn(visit: string, lat: number, lon: number, accuracy?: number | null): Promise<CheckInResult>;
  submitVisit(visit: string, answers: AnswerInput[], clientId: string): Promise<SubmitResult>;
  skipVisit(visit: string, reason: string, clientId: string): Promise<SubmitResult>;
  uploadPhoto(visit: string, photo: PhotoInput): Promise<string>;
  uploadTrack(run: string, coordinates: [number, number][]): Promise<{ distance_walked_m: number }>;
  finishRun(run: string): Promise<{ status: RunStatus; pending: number }>;
  signOut(): Promise<void>;
}
