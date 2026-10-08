import { useAuth } from "../contexts/AuthContext.jsx";
import AuthGate from "./AuthGate.jsx";
import { PageSkeleton } from "./Skeleton.jsx";

export default function RequireAuth({ children, message }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (!user) return <AuthGate message={message} />;
  return children;
}
