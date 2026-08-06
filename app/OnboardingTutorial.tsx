"use client";

import { translate, type Language, type TranslationKey } from "./i18n";

const steps: { icon: string; title: TranslationKey; text: TranslationKey }[] = [
  { icon: "W", title: "tutorial.welcomeTitle", text: "tutorial.welcomeText" },
  { icon: "⌁", title: "tutorial.structureTitle", text: "tutorial.structureText" },
  { icon: "✦", title: "tutorial.questTitle", text: "tutorial.questText" },
  { icon: "+XP", title: "tutorial.progressTitle", text: "tutorial.progressText" },
  { icon: "⬡", title: "tutorial.bossTitle", text: "tutorial.bossText" },
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
  const current = steps[Math.min(Math.max(step, 0), steps.length - 1)];
  const isLast = step === steps.length - 1;

  return <div className="modal-backdrop tutorial-backdrop">
    <section aria-labelledby="tutorial-title" aria-modal="true" className="modal tutorial-modal" role="dialog">
      <header>
        <p>{t("tutorial.eyebrow")}</p>
        <button aria-label={t("common.close")} onClick={onFinish} type="button">×</button>
      </header>
      <div className="tutorial-track" aria-hidden="true">
        {steps.map((_, index) => <i className={index <= step ? "active" : ""} key={index} />)}
      </div>
      <div className="tutorial-body">
        <div className="tutorial-icon"><span>{current.icon}</span></div>
        <small>{t("tutorial.step", { current: step + 1, total: steps.length })}</small>
        <h2 id="tutorial-title">{t(current.title)}</h2>
        <p>{t(current.text)}</p>
      </div>
      <footer>
        <button className="tutorial-skip" onClick={onFinish} type="button">{t("tutorial.skip")}</button>
        <div>
          {step > 0 && <button onClick={() => onStepChange(step - 1)} type="button">{t("tutorial.back")}</button>}
          <button autoFocus className="primary" onClick={() => isLast ? onFinish() : onStepChange(step + 1)} type="button">{isLast ? t("tutorial.finish") : t("tutorial.next")}</button>
        </div>
      </footer>
    </section>
  </div>;
}
