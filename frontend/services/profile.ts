import { API_URL, ApiError, jsonHeaders } from "./api";
import type {
  CareerProfile,
  CareerStatus,
  CareerTask,
  Experience,
  FullProfile,
  Project,
  Skill,
} from "@/types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: jsonHeaders(options?.headers),
    ...options,
  });

  if (!response.ok) {
    throw new ApiError(`API error: ${response.statusText}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function getProfile(): Promise<FullProfile> {
  const [profile, careerStatus, intelligence] = await Promise.all([
    request<Omit<FullProfile, "career_status" | "active_task">>("/profile"),
    request<CareerStatus>("/career/status").catch(() => null),
    request<{
      latest_gap: CareerStatus["latest_gap"];
      active_task?: CareerTask | null;
    }>("/career/intelligence").catch(() => null),
  ]);
  const status = careerStatus
    ? {
        ...careerStatus,
        latest_gap: intelligence?.latest_gap ?? careerStatus.latest_gap ?? null,
      }
    : null;
  return {
    ...profile,
    career_status: status,
    active_task: intelligence?.active_task ?? null,
  };
}

export async function getCareerStatus(): Promise<CareerStatus> {
  return request<CareerStatus>("/career/status");
}

export async function updateProfile(data: Partial<CareerProfile>): Promise<CareerProfile> {
  return request<CareerProfile>("/profile", {
    method: "PATCH",
    body: JSON.stringify({
      target_position: data.target_position,
      industry: data.industry,
      summary: data.summary,
      experience_year: data.experience_year,
    }),
  });
}

export async function resetProfile(): Promise<{ ok: boolean; message: string }> {
  return request<{ ok: boolean; message: string }>("/profile/reset", { method: "POST" });
}

export async function updateExperience(id: string, data: Partial<Experience>): Promise<Experience> {
  return request<Experience>(`/profile/experiences/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteExperience(id: string): Promise<void> {
  return request<void>(`/profile/experiences/${id}`, { method: "DELETE" });
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  return request<Project>(`/profile/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<void> {
  return request<void>(`/profile/projects/${id}`, { method: "DELETE" });
}

export async function updateSkill(id: string, data: Partial<Skill>): Promise<Skill> {
  return request<Skill>(`/profile/skills/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteSkill(id: string): Promise<void> {
  return request<void>(`/profile/skills/${id}`, { method: "DELETE" });
}
