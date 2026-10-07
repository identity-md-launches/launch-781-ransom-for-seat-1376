import { useEffect, useRef, useState } from "react";

let startedThisVisit = false;
export function Testament({ text }: { text: string }) {
  const [visible, setVisible] = useState(() =>
    startedThisVisit ? text.length : 0,
  );
  const paragraph = useRef<HTMLParagraphElement>(null);
  const finishRef = useRef<() => void>(() => {});
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let observer: IntersectionObserver | undefined;
    const finish = () => {
      startedThisVisit = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      setVisible(text.length);
    };
    finishRef.current = finish;
    const change = () => {
      if (motion.matches) finish();
    };
    motion.addEventListener("change", change);
    if (
      startedThisVisit ||
      motion.matches ||
      !("IntersectionObserver" in window)
    )
      finish();
    else {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        startedThisVisit = true;
        const start = performance.now();
        const type = (now: number) => {
          const count = Math.min(text.length, Math.floor((now - start) * 0.12));
          setVisible(count);
          if (count < text.length) frame = requestAnimationFrame(type);
        };
        frame = requestAnimationFrame(type);
      });
      if (paragraph.current) observer.observe(paragraph.current);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      motion.removeEventListener("change", change);
    };
  }, [text]);
  const typing = visible < text.length;
  return (
    <p
      ref={paragraph}
      className="manifesto testament-typing"
      tabIndex={typing ? 0 : undefined}
      onClick={() => finishRef.current()}
      onFocus={() => finishRef.current()}
      onCopy={() => finishRef.current()}
    >
      <span className={typing ? "testament-full typing" : "testament-full"}>
        {text}
      </span>
      {typing && (
        <span className="testament-reveal" aria-hidden="true">
          {text.slice(0, visible)}
        </span>
      )}
    </p>
  );
}
