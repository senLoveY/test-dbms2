import { useNavigate } from "react-router-dom";
import { useFeedback } from "../components/Feedback.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";
import { apiRequest } from "../lib/api.js";

/** Confirms, deletes the account on the server and forgets it on this device. Resolves to true when deleted. */
export function useDeleteAccount() {
  const { forgetSession } = useAuth();
  const { confirm, toast } = useFeedback();
  const navigate = useNavigate();

  return async function deleteAccount() {
    const ok = await confirm({
      title: "Удалить аккаунт?",
      body: "Аккаунт, все тесты, результаты и вызовы сотрутся сразу. Восстановить их будет нельзя.",
      confirmText: "Удалить навсегда",
      tone: "danger",
    });
    if (!ok) return false;

    try {
      await apiRequest("/api/account", { method: "DELETE", body: { confirm: true } });
    } catch (err) {
      toast(err.message, { tone: "bad" });
      return false;
    }
    await forgetSession();
    toast("Аккаунт и все данные удалены");
    navigate("/", { replace: true });
    return true;
  };
}
