import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";

import {
  highlightPlainText,
  highlightReactChildren,
} from "@/lib/highlight-text";
import { stripDecorativeEmoji } from "@/lib/strip-emoji";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  role: "user" | "assistant" | "system";
  content: string;
  isStreaming?: boolean;
  /** In-conversation find query — keywords get amber highlight. */
  highlightQuery?: string;
  /** Whether this message is the current find result. */
  highlightActive?: boolean;
}

function wrapHighlighted(
  children: ReactNode,
  query?: string,
  active?: boolean,
): ReactNode {
  if (!query?.trim()) return children;
  return highlightReactChildren(children, query, { active });
}

export function MessageBubble({
  role,
  content,
  isStreaming,
  highlightQuery,
  highlightActive,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const q = highlightQuery?.trim() || "";
  const display = isUser ? content : stripDecorativeEmoji(content);

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground shadow-sm"
            : "border border-[color:var(--season-border)] bg-[color:var(--season-panel)] text-foreground shadow-sm backdrop-blur-sm",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">
            {q
              ? highlightPlainText(display, q, {
                  active: highlightActive,
                  className: highlightActive
                    ? "bg-amber-200 text-foreground"
                    : "bg-amber-100/90 text-foreground",
                })
              : display}
          </p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => (
                  <p>{wrapHighlighted(children, q, highlightActive)}</p>
                ),
                li: ({ children }) => (
                  <li>{wrapHighlighted(children, q, highlightActive)}</li>
                ),
                h1: ({ children }) => (
                  <h1>{wrapHighlighted(children, q, highlightActive)}</h1>
                ),
                h2: ({ children }) => (
                  <h2>{wrapHighlighted(children, q, highlightActive)}</h2>
                ),
                h3: ({ children }) => (
                  <h3>{wrapHighlighted(children, q, highlightActive)}</h3>
                ),
                h4: ({ children }) => (
                  <h4>{wrapHighlighted(children, q, highlightActive)}</h4>
                ),
                strong: ({ children }) => (
                  <strong>{wrapHighlighted(children, q, highlightActive)}</strong>
                ),
                em: ({ children }) => (
                  <em>{wrapHighlighted(children, q, highlightActive)}</em>
                ),
                td: ({ children }) => (
                  <td>{wrapHighlighted(children, q, highlightActive)}</td>
                ),
                th: ({ children }) => (
                  <th>{wrapHighlighted(children, q, highlightActive)}</th>
                ),
                blockquote: ({ children }) => (
                  <blockquote>{wrapHighlighted(children, q, highlightActive)}</blockquote>
                ),
                a: ({ children, href }) => (
                  <a href={href}>{wrapHighlighted(children, q, highlightActive)}</a>
                ),
                pre: ({ children }) => (
                  <pre className="overflow-x-auto rounded-md bg-black/10 p-3 text-xs dark:bg-white/10">
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => {
                  const isBlock = className?.includes("language-");
                  if (isBlock) {
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                  const text =
                    typeof children === "string"
                      ? children
                      : Array.isArray(children)
                        ? children.join("")
                        : String(children ?? "");
                  return (
                    <code
                      className="rounded bg-black/10 px-1 py-0.5 text-xs dark:bg-white/10"
                      {...props}
                    >
                      {q
                        ? highlightPlainText(text, q, { active: highlightActive })
                        : children}
                    </code>
                  );
                },
              }}
            >
              {display}
            </ReactMarkdown>
          </div>
        )}
        {isStreaming && (
          <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current opacity-70" />
        )}
      </div>
    </div>
  );
}
