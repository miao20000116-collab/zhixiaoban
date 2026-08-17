"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Period = "morning" | "noon" | "afternoon" | "evening" | "night";

type GreetingTone = "warm" | "lively" | "pro";

type GreetingLine = {
  title: string;
  subtitle: string;
  tone: GreetingTone;
};

const BY_PERIOD: Record<Period, GreetingLine[]> = {
  morning: [
    {
      tone: "warm",
      title: "早安，我们慢慢开始",
      subtitle: "新的一天，先选一件小事推进就好。",
    },
    {
      tone: "lively",
      title: "早上好，能量已就绪",
      subtitle: "简历、JD 或面试，今天从哪一步出发？",
    },
    {
      tone: "pro",
      title: "早上好，我是你的求职搭档",
      subtitle: "把目标说清楚，我会帮你拆成可执行步骤。",
    },
  ],
  noon: [
    {
      tone: "warm",
      title: "中午好，稍作停顿也没关系",
      subtitle: "用几分钟理清重点，比一口气做完更有效。",
    },
    {
      tone: "lively",
      title: "午安，来点轻量推进",
      subtitle: "优化一段经历，或快速拆解一份 JD。",
    },
    {
      tone: "pro",
      title: "中午好，保持节奏即可",
      subtitle: "优先处理匹配度最高的那一件事。",
    },
  ],
  afternoon: [
    {
      tone: "warm",
      title: "下午好，我在这里陪你",
      subtitle: "卡住了就说出来，我们一起找下一步。",
    },
    {
      tone: "lively",
      title: "嘿，下午好",
      subtitle: "模拟面试、STAR、画像，随时可以开聊。",
    },
    {
      tone: "pro",
      title: "下午好，我是你的求职搭档",
      subtitle: "画像、JD、简历或面试——直接点下面开始，也可以打字告诉我。",
    },
  ],
  evening: [
    {
      tone: "warm",
      title: "傍晚好，收一收今天的收获",
      subtitle: "复盘一次面试，或把想法沉淀进画像。",
    },
    {
      tone: "lively",
      title: "傍晚好，轻松收个尾",
      subtitle: "不求完美，只求比早上更清楚一点。",
    },
    {
      tone: "pro",
      title: "傍晚好，我是你的求职伙伴",
      subtitle: "把今天的进展整理清楚，明天会更从容。",
    },
  ],
  night: [
    {
      tone: "warm",
      title: "夜深了，先照顾好自己",
      subtitle: "想聊就聊；想休息，明天我们再继续。",
    },
    {
      tone: "lively",
      title: "夜里也欢迎你回来",
      subtitle: "轻声对话也很好——方向会在交流里慢慢清晰。",
    },
    {
      tone: "pro",
      title: "晚上好，我随时在线",
      subtitle: "需要策略、材料或面试准备，直接告诉我。",
    },
  ],
};

const ROTATE_MS = 45_000;

function periodOf(date: Date): Period {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "noon";
  if (h >= 14 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

function pickIndex(len: number, seed: number) {
  return ((seed % len) + len) % len;
}

export function WelcomeHero({
  className,
  actions,
}: {
  className?: string;
  actions?: ReactNode;
}) {
  const [now, setNow] = useState(() => new Date());
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 60_000);
    const rotator = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setTick((t) => t + 1);
        setVisible(true);
      }, 280);
    }, ROTATE_MS);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(rotator);
    };
  }, []);

  const line = useMemo(() => {
    const period = periodOf(now);
    const pool = BY_PERIOD[period];
    return pool[pickIndex(pool.length, period.length + tick + now.getDate())]!;
  }, [now, tick]);

  return (
    <div className={cn("mx-auto flex w-full max-w-2xl flex-col items-center", className)}>
      <div
        className={cn(
          "space-y-4 text-center transition-all duration-300",
          visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
      >
        <p className="font-[family-name:var(--font-quote)] text-[1.65rem] font-medium leading-snug tracking-[0.02em] text-foreground/90 sm:text-[1.85rem]">
          {line.title}
        </p>
        <p className="mx-auto max-w-md text-[0.95rem] leading-7 text-foreground/55">
          {line.subtitle}
        </p>
      </div>
      {actions ? <div className="mt-9 w-full">{actions}</div> : null}
    </div>
  );
}
