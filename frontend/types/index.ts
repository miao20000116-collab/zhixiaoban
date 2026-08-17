export interface User {
  id: string;
  email: string;
  avatar?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  summary?: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  token_count?: number;
  created_at: string;
}

export interface CareerStatus {
  id: string;
  user_id: string;
  stage: string;
  stage_label?: string;
  interview_count: number;
  application_count: number;
  strength?: string | null;
  weakness?: string | null;
  last_interview_score?: number | null;
  recent_failures?: number;
  focus_areas?: string[] | null;
  next_action?: string | null;
  latest_gap?: CareerGapResult | null;
  updated_at?: string | null;
}

export interface GapEvidence {
  claim: string;
  source: string;
  source_type?: string;
}

export interface CareerGapResult {
  target_position?: string | null;
  company?: string | null;
  match_score: number;
  strengths: Array<{
    title: string;
    reason?: string;
    evidence?: GapEvidence[];
  }>;
  gaps: Array<{
    title: string;
    reason: string;
    evidence?: GapEvidence[];
  }>;
  recommendations: Array<{
    action: string;
    why?: string;
    priority?: string;
  }>;
  evidence?: GapEvidence[];
  summary?: string | null;
  evaluation?: Record<string, unknown> | null;
}

export interface CareerTask {
  id: string;
  user_id: string;
  conversation_id?: string | null;
  task_type: string;
  goal: string;
  status: string;
  progress: number;
  completed_steps: string[];
  pending_steps: string[];
  next_action?: string | null;
  updated_at?: string | null;
}

export interface WorkflowStep {
  id: string;
  agent: string;
  agent_label: string;
  title: string;
  detail?: string;
  status: "running" | "done" | "error" | string;
  phase?: "think" | "route" | "run" | "evaluate" | "answer" | string;
  ts?: number;
}

export interface NextActionSuggestion {
  trigger?: string;
  title?: string;
  message?: string;
  why?: string;
  sources?: Array<{ type?: string; label: string } | string>;
  priority?: string;
  goal?: string;
  plan?: Array<{ step: string; reason?: string; source?: string; priority?: string }>;
  actions?: Array<{ id?: string; label: string; intent?: string }>;
}

export interface CareerProfile {
  id: string;
  user_id: string;
  target_position?: string;
  industry?: string;
  summary?: string;
  experience_year?: number;
  confidence_score?: number;
  updated_at: string;
}

export interface FullProfile {
  profile: CareerProfile | null;
  experiences: Experience[];
  projects: Project[];
  skills: Skill[];
  career_status?: CareerStatus | null;
  active_task?: CareerTask | null;
}

export interface Skill {
  id: string;
  user_id: string;
  skill_name: string;
  level?: number;
  source?: string;
  confidence?: number;
}

export interface Experience {
  id: string;
  user_id: string;
  company?: string;
  position?: string;
  duration?: string;
  responsibility?: string;
  achievement?: string;
  source?: string;
  confidence?: number;
}

export interface Project {
  id: string;
  user_id: string;
  project_name?: string;
  background?: string;
  goal?: string;
  role?: string;
  action?: string;
  result?: string;
  skill_tags?: string[];
  source?: string;
  confidence?: number;
}

export interface ChatRequest {
  conversation_id: string;
  message: string;
}

export interface ChatResponse {
  message: string;
  agent?: string;
  evaluation?: Record<string, unknown>;
}

export interface JobAnalyzeResponse {
  id: string;
  analysis: Record<string, unknown>;
  evaluation?: Record<string, unknown> | null;
  markdown: string;
  created_at: string;
}

export interface JobAnalysisListItem {
  id: string;
  position?: string;
  company?: string;
  input_type: string;
  created_at: string;
}

export interface ResumeTaskResponse {
  id: string;
  task_type: string;
  result: Record<string, unknown>;
  evaluation?: Record<string, unknown> | null;
  markdown: string;
  created_at: string;
}

export interface ResumeVersionListItem {
  id: string;
  task_type: string;
  target_position?: string;
  created_at: string;
}

export interface InterviewSessionResponse {
  id: string;
  conversation_id?: string | null;
  mode: string;
  stage: string;
  status: string;
  position?: string | null;
  turns_in_stage: number;
  turn?: Record<string, unknown> | null;
  review?: Record<string, unknown> | null;
  evaluation?: Record<string, unknown> | null;
  markdown: string;
  created_at: string;
  updated_at: string;
}

export interface InterviewQuestionsResponse {
  questions: Record<string, unknown>;
  markdown: string;
}

