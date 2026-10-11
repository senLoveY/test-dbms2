import { useState } from "react";
import { shareResultCard } from "../lib/resultCard.js";
import Button from "./Button.jsx";
import { useFeedback } from "./Feedback.jsx";

/** card: { kind, title, score, total, stamp?, caption? } — see lib/resultCard.js */
export default function ShareResultButton({ card, variant = "ghost", children = "Поделиться результатом" }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const result = await shareResultCard(card);
      if (result === "downloaded") toast("Картинка с результатом сохранена");
    } catch {
      toast("Не получилось сделать картинку", { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} onClick={share} loading={busy}>
      {children}
    </Button>
  );
}
