"use client";

import { useCallback, useRef, useState } from "react";

import { generate, generateStream, readStream, type AIGenerateOptions } from "@/services/ai-direct";

type Message = { role: string; content: string };

export function useAIDirect() {
  const abortRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("");
  const [fallback, setFallback] = useState(false);

  const reset = useCallback(() => {
    setLoading(false);
    setContent("");
    setError("");
    setProvider("");
    setFallback(false);
  }, []);

  const loadContent = useCallback((text: string, providerLabel = "历史记录") => {
    setLoading(false);
    setContent(text);
    setError("");
    setProvider(providerLabel);
    setFallback(false);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const send = useCallback(async (messages: Message[], options?: AIGenerateOptions) => {
    setLoading(true);
    setContent("");
    setError("");
    abortRef.current = new AbortController();
    try {
      const result = await generate(messages, { ...options, signal: abortRef.current.signal });
      setContent(result.content);
      setProvider(result.provider);
      setFallback(result.fallback);
      return result;
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "请求失败");
      }
      throw err;
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  const sendStream = useCallback(async (messages: Message[], options?: AIGenerateOptions) => {
    setLoading(true);
    setContent("");
    setError("");
    abortRef.current = new AbortController();
    try {
      const result = await generateStream(messages, { ...options, signal: abortRef.current.signal });
      if (!result.stream) {
        throw new Error("无响应流");
      }
      setProvider(result.provider);
      setFallback(result.fallback);
      let finalContent = "";
      await readStream(
        result.stream,
        (token) => {
          finalContent += token;
          setContent((prev) => prev + token);
        },
        () => undefined,
      );
      return { ...result, content: finalContent };
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "请求失败");
      }
      throw err;
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  return {
    loading,
    content,
    error,
    provider,
    fallback,
    send,
    sendStream,
    cancel,
    reset,
    loadContent,
  };
}
