import type { NextActionSuggestion } from "@/types";

export type FollowUpChip = {
  /** Shown on the chip — first-person intent, e.g. 「我想做 STAR 改写」 */
  label: string;
  /** Sent into chat when clicked — fuller first-person ask */
  message: string;
};

type WorkflowStage =
  | "jd_analysis"
  | "resume_optimize"
  | "star_rewrite"
  | "interview_live"
  | "interview_review"
  | "gap_analysis"
  | "career_direction"
  | "profile"
  | "general";

/** Product capability → next-step prompts (first person). */
const STAGE_NEXT: Record<WorkflowStage, FollowUpChip[]> = {
  jd_analysis: [
    {
      label: "我想按这份 JD 优化简历",
      message:
        "我想按刚才这份 JD，优化一版针对该岗位的简历，请给出可直接改的表述和关键词对齐建议。",
    },
    {
      label: "我想对照 JD 检查简历缺口",
      message:
        "我想对照刚才的 JD，看看我现在的简历还缺哪些证据和关键词，请逐条指出。",
    },
    {
      label: "我想做能力差距分析",
      message:
        "我想基于这份 JD 和我的画像做一次能力差距分析，并告诉我优先补齐哪几项。",
    },
    {
      label: "我想开始该岗位模拟面试",
      message: "我想开始针对这份岗位的模拟面试，请按 JD 重点出题并逐轮追问。",
    },
  ],
  resume_optimize: [
    {
      label: "我想做 STAR 经历改写",
      message:
        "我想把刚才涉及的项目/工作经历改写成完整 STAR，并补上可核实的量化结果。",
    },
    {
      label: "我想对照 JD 再看简历",
      message:
        "我想对照目标 JD，再检查这版简历有没有优化到位，还差哪些匹配点。",
    },
    {
      label: "我想开始模拟面试练表达",
      message: "简历先告一段落，我想开始文字模拟面试，检验表达能不能撑住岗位要求。",
    },
    {
      label: "我想做语音模拟面试",
      message: "我想进行语音模拟面试：录音回答、转写，并给我表达与内容反馈。",
    },
  ],
  star_rewrite: [
    {
      label: "我想再改下一段经历",
      message: "这段 STAR 可以了，我想继续改下一段经历，请按同样标准帮我改写。",
    },
    {
      label: "我想加强量化结果",
      message: "我想把刚才 STAR 里的结果再加强，请帮我补更有说服力的量化表述。",
    },
    {
      label: "我想开始模拟面试",
      message: "我想用刚改好的经历开始模拟面试，请围绕它来追问。",
    },
    {
      label: "我想把改写写回简历",
      message: "我想把刚才的 STAR 改写整理成可直接贴进简历的终稿表述。",
    },
  ],
  interview_live: [
    {
      label: "我想继续下一题",
      message: "我想继续下一题，请按我的短板针对性追问。",
    },
    {
      label: "我想先看这题参考答法",
      message: "这题我想先看一版更好的参考答法，再自己重答一遍。",
    },
    {
      label: "我想改成语音面试",
      message: "我想改成语音模拟面试，练流畅度和口头表达。",
    },
    {
      label: "我想先小结这轮表现",
      message: "我想先小结到目前为止的表现：优点、短板，和下一步怎么练。",
    },
  ],
  interview_review: [
    {
      label: "我想针对短板专项训练",
      message: "我想针对刚才复盘里的主要短板，做一轮专项训练。",
    },
    {
      label: "我想按短板回改简历",
      message: "我想按面试暴露的短板，回改简历里相关表述，让证据更站得住。",
    },
    {
      label: "我想再来一轮模拟面试",
      message: "我想再来一轮模拟面试，重点练刚才没答好的部分。",
    },
    {
      label: "我想做语音表达训练",
      message: "我想做一轮语音模拟面试，专门练表达节奏和口头禅。",
    },
  ],
  gap_analysis: [
    {
      label: "我想拆成三天行动计划",
      message: "我想把能力差距拆成未来 3 天可执行的小计划，请按优先级排好。",
    },
    {
      label: "我想先优化简历补证据",
      message: "我想先优化简历，把差距分析里缺的证据补上去。",
    },
    {
      label: "我想先练模拟面试",
      message: "我想先通过模拟面试练起来，优先攻最关键的短板。",
    },
    {
      label: "我想再看目标岗位 JD",
      message: "我想再分析一份目标岗位 JD，确认差距判断是否准确。",
    },
  ],
  career_direction: [
    {
      label: "我想理清最优先方向",
      message: "我想把当前可选求职方向理清楚，并选定一个最优先行动。",
    },
    {
      label: "我想完善个人画像",
      message: "我想完善个人画像：目标岗位、经历、优势和短板，请引导我补充。",
    },
    {
      label: "我想先分析一份 JD",
      message: "我想先上传/分析一份感兴趣的 JD，用具体岗位把方向落地。",
    },
    {
      label: "我想看看能力差距",
      message: "我想基于画像做一次能力差距分析，看自己更适合往哪走。",
    },
  ],
  profile: [
    {
      label: "我想继续补充经历",
      message: "我想继续补充一段关键经历，请引导我把信息说清楚。",
    },
    {
      label: "我想优化简历",
      message: "画像先这样，我想开始优化简历，把已有信息写得更有竞争力。",
    },
    {
      label: "我想做能力差距分析",
      message: "我想基于当前画像做能力差距分析，看还缺什么。",
    },
    {
      label: "我想开始模拟面试",
      message: "我想开始模拟面试，用对话检验表达和匹配度。",
    },
  ],
  general: [
    {
      label: "我想把下一步说得更具体",
      message: "我想基于刚才的回答，再往下讲具体一点，并给我可执行的下一步。",
    },
    {
      label: "我想优化我的简历",
      message: "我想优化简历：请结合刚才的讨论，给出可直接改的版本或改写建议。",
    },
    {
      label: "我想开始模拟面试",
      message: "我想开始文字模拟面试，请按我的目标岗位出题并逐轮追问。",
    },
    {
      label: "我想分析一份 JD",
      message: "我想分析一份岗位 JD，请告诉我该怎么发给你，并帮我拆解要求和匹配点。",
    },
  ],
};

function detectStage(content: string, intent?: string | null): WorkflowStage {
  const c = content;

  if (
    /复盘|本轮综合|改进建议|表达分析|面试已结束|短板集中|improvement/i.test(c) &&
    /面试|得分|流畅|口头禅/.test(c)
  ) {
    return "interview_review";
  }
  if (/面试官：|下一题|请回答|追问|自我介绍环节|项目深挖/.test(c)) {
    return "interview_live";
  }
  if (/STAR|情境|任务|行动|结果|量化结果/.test(c) && /经历|项目|改写/.test(c)) {
    return "star_rewrite";
  }
  if (/JD|岗位职责|任职要求|匹配度|关键词对齐|招聘要求/i.test(c)) {
    return "jd_analysis";
  }
  if (/简历|优化建议|项目经历|工作经历|终稿|润色/.test(c)) {
    return "resume_optimize";
  }
  if (/能力差距|Gap|匹配分|优先补齐|差距分析/i.test(c)) {
    return "gap_analysis";
  }
  if (/求职方向|迷茫|卡住|焦虑|不知道选|职业规划/.test(c)) {
    return "career_direction";
  }
  if (/个人画像|完善画像|目标岗位|补充信息/.test(c)) {
    return "profile";
  }

  switch (intent) {
    case "job_analysis":
      return "jd_analysis";
    case "resume":
      return "resume_optimize";
    case "interview":
      return "interview_live";
    case "career_consult":
      return "career_direction";
    default:
      return "general";
  }
}

function pushUnique(list: FollowUpChip[], chip: FollowUpChip) {
  const key = chip.label.replace(/\s/g, "");
  if (list.some((c) => c.label.replace(/\s/g, "") === key)) return;
  if (list.some((c) => c.message === chip.message)) return;
  list.push(chip);
}

/** Turn backend action labels into first-person chips. */
function asFirstPerson(raw: string): FollowUpChip {
  const t = raw.trim().replace(/[。！？.!?]+$/g, "");
  if (/^(我想|我想要|请帮我|帮我)/.test(t)) {
    const label = t.length > 22 ? `${t.slice(0, 21)}…` : t;
    return { label, message: `${t}${/[。！？]$/.test(raw.trim()) ? "" : "。"}` };
  }
  // strip leading verbs like 开始/优化
  const body = t.replace(/^(请|建议|可以|立刻|马上)/, "");
  const label = `我想${body}`.length > 22 ? `我想${body.slice(0, 18)}…` : `我想${body}`;
  return {
    label,
    message: `我想${body}，请按我当前的进度继续帮我。`,
  };
}

/**
 * Build 3–4 first-person follow-ups after every assistant reply,
 * mapped to the product workflow the user is currently in.
 */
export function buildFollowUpChips(opts: {
  content: string;
  intent?: string | null;
  nextAction?: NextActionSuggestion | null;
  preferNextAction?: boolean;
  count?: number;
}): FollowUpChip[] {
  const target = Math.min(4, Math.max(3, opts.count ?? 4));
  const stage = detectStage(opts.content, opts.intent);
  const chips: FollowUpChip[] = [];

  // 1) Backend next-action (workflow-aware) → first person
  if (opts.preferNextAction && opts.nextAction?.actions?.length) {
    for (const action of opts.nextAction.actions) {
      pushUnique(chips, asFirstPerson(action.label));
      if (chips.length >= target) break;
    }
  }

  // 2) Stage-specific product next steps (core)
  for (const chip of STAGE_NEXT[stage]) {
    if (chips.length >= target) break;
    pushUnique(chips, chip);
  }

  // 3) Soft fill from adjacent stages so we never look empty/generic-only
  if (chips.length < target) {
    const fallbacks = [
      ...STAGE_NEXT.general,
      ...STAGE_NEXT.resume_optimize,
      ...STAGE_NEXT.jd_analysis,
    ];
    for (const chip of fallbacks) {
      if (chips.length >= target) break;
      pushUnique(chips, chip);
    }
  }

  return chips.slice(0, target);
}
