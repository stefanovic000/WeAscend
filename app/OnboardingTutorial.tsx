"use client";

import { useEffect, useState } from "react";
import { translate, type Language, type TranslationKey } from "./i18n";

type TourStep = { title: TranslationKey; text: TranslationKey; target: string; interactive?: boolean };
type TargetRect = { top: number; left: number; width: number; height: number };

const steps: TourStep[] = [
  { title: "tutorial.welcomeTitle", text: "tutorial.welcomeText", target: "[data-tour='dashboard-next']" },
  { title: "tutorial.attributeTitle", text: "tutorial.attributeText", target: "[data-tour='growth-add-attribute']" },
  { title: "tutorial.skillTitle", text: "tutorial.skillText", target: "[data-tour='growth-grid']" },
  { title: "tutorial.plannerTitle", text: "tutorial.plannerText", target: "[data-tour='quest-planner']" },
  { title: "tutorial.addQuestTitle", text: "tutorial.addQuestText", target: "[data-tour='quest-add']" },
  { title: "tutorial.questBasicsTitle", text: "tutorial.questBasicsText", target: "[data-tour='quest-basics']", interactive: true },
  { title: "tutorial.questPathTitle", text: "tutorial.questPathText", target: "[data-tour='quest-path']", interactive: true },
  { title: "tutorial.xpTitle", text: "tutorial.xpText", target: "[data-tour='quest-xp']", interactive: true },
  { title: "tutorial.completionTitle", text: "tutorial.completionText", target: "[data-tour='quest-completion']", interactive: true },
  { title: "tutorial.activateTitle", text: "tutorial.activateText", target: "[data-tour='quest-activate']" },
  { title: "tutorial.bossTitle", text: "tutorial.bossText", target: "[data-tour='bosses']" },
  { title: "tutorial.historyTitle", text: "tutorial.historyText", target: "[data-tour='history']" },
  { title: "tutorial.replayTitle", text: "tutorial.replayText", target: "[data-tour='tutorial-replay']" },
];

export default function OnboardingTutorial({
  language,
  step,
  onStepChange,
  onFinish,
}: {
  language: Language;
  step: number;
  onStepChange: (step: number) => void;
  onFinish: () => void;
}) {
  const t = (key: TranslationKey, variables?: Record<string, string | number>) => translate(language, key, variables);
  const safeStep = Math.min(Math.max(step, 0), steps.length - 1);
  const current = steps[safeStep];
  const isLast = safeStep === steps.length - 1;
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    let frame = 0;
    let timer = 0;
    let observer: ResizeObserver | null = null;
    let target: HTMLElement | null = null;
    const measure = () => {
      if (!target?.isConnected) target = document.querySelector<HTMLElement>(current.target);
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    timer = window.setTimeout(() => {
      target = document.querySelector<HTMLElement>(current.target);
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      scheduleMeasure();
      if (target) {
        observer = new ResizeObserver(scheduleMeasure);
        observer.observe(target);
      }
    }, 100);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      observer?.disconnect();
    };
  }, [current.target]);

  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  const padding = 7;
  const spotlight = targetRect ? {
    top: Math.max(6, targetRect.top - padding),
    left: Math.max(6, targetRect.left - padding),
    width: Math.min(viewportWidth - 12, targetRect.width + padding * 2),
    height: Math.min(viewportHeight - 12, targetRect.height + padding * 2),
  } : null;
  const coachWidth = Math.min(370, viewportWidth - 24);
  const coachLeft = targetRect
    ? Math.min(Math.max(targetRect.left, 12), viewportWidth - coachWidth - 12)
    : Math.max(12, (viewportWidth - coachWidth) / 2);
  const placeAbove = !!targetRect && targetRect.top > viewportHeight * .55;
  const coachStyle = targetRect
    ? { left: coachLeft, top: placeAbove ? Math.max(12, targetRect.top - 14) : Math.min(viewportHeight - 12, targetRect.top + targetRect.height + 14), transform: placeAbove ? "translateY(-100%)" : undefined, width: coachWidth }
    : { left: coachLeft, top: "50%", transform: "translateY(-50%)", width: coachWidth };

  return <div className={`tour-layer ${spotlight ? "has-target" : ""} ${current.interactive ? "interactive" : ""}`}>
    {spotlight && current.interactive
      ? <>
        <div className="tour-shade" style={{ inset: `0 0 auto 0`, height: spotlight.top }} />
        <div className="tour-shade" style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height }} />
        <div className="tour-shade" style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: spotlight.height }} />
        <div className="tour-shade" style={{ top: spotlight.top + spotlight.height, right: 0, bottom: 0, left: 0 }} />
      </>
      : <div className="tour-blocker" />}
    {spotlight && <div aria-hidden="true" className="tour-spotlight" style={spotlight} />}
    <section aria-labelledby="tutorial-title" aria-live="polite" className="tour-coachmark" role="dialog" style={coachStyle}>
      <div className="tour-progress"><span>{t("tutorial.step", { current: safeStep + 1, total: steps.length })}</span><i><b style={{ width: `${(safeStep + 1) / steps.length * 100}%` }} /></i></div>
      <h2 id="tutorial-title">{t(current.title)}</h2>
      <p>{t(current.text)}</p>
      {current.interactive && <small className="tour-try">{t("tutorial.tryIt")}</small>}
      <footer>
        <button className="tour-skip" onClick={onFinish} type="button">{t("tutorial.skip")}</button>
        <div>
          {safeStep > 0 && <button onClick={() => onStepChange(safeStep - 1)} type="button">{t("tutorial.back")}</button>}
          <button autoFocus className="primary" onClick={() => isLast ? onFinish() : onStepChange(safeStep + 1)} type="button">{isLast ? t("tutorial.finish") : t("tutorial.next")}</button>
        </div>
      </footer>
    </section>
  </div>;
}
