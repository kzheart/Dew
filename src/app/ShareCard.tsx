import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CARD_BACKGROUNDS, cardSwatch, drawShareCard, renderCard, type CardContent } from "../export/card";
import { baseName } from "../export/standalone";
import { host, type CardBackground, type Prefs } from "../platform";
import { useTransient } from "./hooks";

/** Matches the length Go keeps. */
const MAX_WATERMARK = 40;
const FEEDBACK_MS = 1800;

type Feedback = "copied" | "saved" | "failed";

const NOTE: Record<Feedback, string> = { copied: "", saved: "已保存", failed: "操作失败，请重试" };

interface Props {
  content: CardContent;
  prefs: Prefs;
  fileName: string;
  leaving: boolean;
  onPrefs(p: Partial<Prefs>): void;
  onClose(): void;
}

const backgrounds = Object.keys(CARD_BACKGROUNDS) as CardBackground[];

/** The share card dialog: a live preview of the card, its background and watermark, and copy or save. */
export function ShareCard({ content, prefs, fileName, leaving, onPrefs, onClose }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const copyBtn = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [feedback, setFeedback] = useTransient<Feedback>(FEEDBACK_MS);
  const options = { background: prefs.cardBg, watermark: prefs.watermark };

  useLayoutEffect(() => {
    const c = canvas.current;
    const s = stage.current;
    if (!c || !s) return;
    const layout = renderCard(c, content, options);
    const fit = Math.min(1, (s.clientWidth - 36) / layout.width, (s.clientHeight - 36) / layout.height);
    c.style.width = `${layout.width * fit}px`;
    c.style.height = `${layout.height * fit}px`;
    setSize({ width: c.width, height: c.height });
  }, [content, prefs.cardBg, prefs.watermark]);

  useEffect(() => {
    copyBtn.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const copy = () =>
    host.exports
      .copyImage(drawShareCard(content, options))
      .then(() => setFeedback("copied"))
      .catch(() => setFeedback("failed"));
  const save = () =>
    host.exports
      .saveImage(drawShareCard(content, options), `${baseName(fileName)}-分享卡片`)
      .then((path) => path && setFeedback("saved"))
      .catch(() => setFeedback("failed"));

  const what = content.kind === "code" ? "代码" : "文字";
  return (
    <div className={leaving ? "share out" : "share"} role="dialog" aria-modal="true" aria-label="生成分享卡片" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="share-panel">
        <div className="share-stage" ref={stage}>
          <canvas ref={canvas} className="share-card" role="img" aria-label={`${what}分享卡片预览`} />
        </div>
        <div className="share-side">
          <div className="share-head">
            <b>分享卡片</b>
            <button className="gbtn share-x" onClick={onClose} aria-label="关闭" title="关闭 Esc">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="field">
            <div className="field-top"><span>背景</span></div>
            <div className="share-sws" role="group" aria-label="背景">
              {backgrounds.map((bg) => (
                <button
                  key={bg}
                  className={prefs.cardBg === bg ? "share-sw on" : "share-sw"}
                  style={{ background: cardSwatch(bg) }}
                  aria-label={CARD_BACKGROUNDS[bg].label}
                  title={CARD_BACKGROUNDS[bg].label}
                  aria-pressed={prefs.cardBg === bg}
                  onClick={() => onPrefs({ cardBg: bg })}
                />
              ))}
            </div>
          </div>
          <div className="field">
            <div className="field-top"><label htmlFor="share-wm">水印</label></div>
            <input
              id="share-wm"
              className="share-wm"
              type="text"
              placeholder="@你的名字"
              maxLength={MAX_WATERMARK}
              value={prefs.watermark}
              spellCheck={false}
              onChange={(e) => onPrefs({ watermark: e.target.value })}
            />
          </div>
          <div className="share-acts">
            <span className="share-meta">{size.width > 0 && `2× PNG · ${size.width} × ${size.height}`}</span>
            <button ref={copyBtn} className="share-copy" onClick={copy} aria-live="polite">
              {feedback === "copied" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
              )}
              {feedback === "copied" ? "已复制" : "复制图片"}
            </button>
            <button className="share-save" onClick={save}>保存…</button>
            <span className={feedback === "failed" ? "share-note warn" : "share-note"} role="status">{feedback ? NOTE[feedback] : ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
