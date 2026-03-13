export type ModerationResultView = {
  riskLevel: 'low' | 'medium' | 'high' | 'error';
  confidence: number | null;
  recommendedAction: 'approve' | 'manual_review' | null;
  summary: string | null;
  violations: string[];
  createdAt: Date;
};

export type ModerationWorkflowResult = {
  moderation: ModerationResultView;
  appliedAction: 'approved' | 'pending';
  status: 'success' | 'error';
  failureType?: ModerationFailureType;
  errorMessage?: string;
};

export type ModerationFailureType =
  | 'TIMEOUT'
  | 'PROVIDER'
  | 'PARSE'
  | 'UNKNOWN';

export type ModerationJobStatusView =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export type ListingModerationInput = {
  id: string;
  title: string;
  description: string;
  category: string;
  department?: string;
};
