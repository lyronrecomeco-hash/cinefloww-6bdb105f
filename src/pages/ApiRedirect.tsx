import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const ApiRedirect = () => {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect /api/:type/:id directly to /player/:type/:id
    const playerType = type === "movie" ? "movie" : "series";
    navigate(`/player/${playerType}/${id}`, { replace: true });
  }, [type, id, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
};

export default ApiRedirect;
