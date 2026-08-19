import { DEMO_JD_TEXT, DEMO_PERSONA, DEMO_RESUME_TEXT } from "@/lib/demo-persona";
import { jdRepo, resumeRepo } from "@/lib/local-db";

/** 把经历采集 / JD 定向优化的示例简历写入本地库，供押题、逐字稿等复用。 */
export async function seedDemoPersonaIfNeeded() {
  const [resumes, jds] = await Promise.all([resumeRepo.list(), jdRepo.list()]);

  if (!resumes.some((r) => r.title === DEMO_PERSONA.resumeTitle)) {
    await resumeRepo.create({
      title: DEMO_PERSONA.resumeTitle,
      rawContent: DEMO_RESUME_TEXT,
      optimizedContent: DEMO_RESUME_TEXT,
    });
  }

  if (!jds.some((j) => j.title === DEMO_PERSONA.jdTitle)) {
    await jdRepo.create({
      title: DEMO_PERSONA.jdTitle,
      company: DEMO_PERSONA.company,
      rawContent: DEMO_JD_TEXT,
    });
  }
}
