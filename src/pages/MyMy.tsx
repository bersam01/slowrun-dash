import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const MEMBER_TAG = "MY-MY";
export const PENDING_MEMBER_TAG_KEY = "slowrun:pending_member_tag";

const MyMy = () => {
  useEffect(() => {
    try {
      localStorage.setItem(PENDING_MEMBER_TAG_KEY, MEMBER_TAG);
    } catch {
      // ignore (private mode, etc.)
    }
  }, []);

  return (
    <>
      <Navigate to="/login" replace />
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </>
  );
};

export default MyMy;
