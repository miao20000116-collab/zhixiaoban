"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavItem = { path: string; label: string };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "AI 求职 Agent",
    items: [{ path: "/", label: "小伴 Agent" }],
  },
  {
    label: "简历准备",
    items: [
      { path: "/tools/resume-builder", label: "AI 经历采集" },
      { path: "/tools/jd-analysis", label: "JD 定向优化" },
    ],
  },
  {
    label: "面试准备",
    items: [
      { path: "/tools/industry-research", label: "行业调研" },
      { path: "/tools/interview-predict", label: "面试押题" },
      { path: "/tools/interview-script", label: "逐字稿" },
    ],
  },
  {
    label: "面试复盘",
    items: [
      { path: "/tools/interview-review", label: "录音复盘" },
      { path: "/tools/answer-scoring", label: "答题评分" },
    ],
  },
  {
    label: "系统",
    items: [{ path: "/tools/settings", label: "设置" }],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.path === "/") return pathname === "/";
  return pathname === item.path;
}

export function V20Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 z-30 hidden h-full bg-[#1e293b] lg:block" style={{ width: 240 }}>
      <div className="flex h-16 items-center border-b border-white/5 px-6">
        <span className="text-sm font-medium tracking-wide text-white/80">AI 求职 Agent</span>
      </div>
      <nav className="v20-sidebar-scroll mt-2 overflow-y-auto px-3 pr-1.5" style={{ maxHeight: "calc(100vh - 4rem)" }}>
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-3 pt-1 pb-1.5 text-[10px] font-medium tracking-wider text-white/30">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={cn(
                      "v20-nav-item mx-1 flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm transition-all duration-150",
                      active ? "v20-nav-active" : "text-[#94a3b8] hover:bg-[#334155] hover:text-[#f8fafc]",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
