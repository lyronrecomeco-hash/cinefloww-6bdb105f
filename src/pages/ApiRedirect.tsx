import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const ApiRedirect = () => {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const redirect = async () => {
      const cType = type === "movie" ? "movie" : "series";
      const { data } = await supabase
        .from("content")
        .select("title, imdb_id")
        .eq("tmdb_id", Number(id))
        .eq("content_type", cType)
        .maybeSingle();

      const routeType = type === "movie" ? "movie" : "tv";
      const params = new URLSearchParams({ audio: "legendado" });
      if (data?.title) params.set("title", data.title);
      if (data?.imdb_id) params.set("imdb", data.imdb_id);

      navigate(`/assistir/${routeType}/${id}?${params.toString()}`, { replace: true });
    };
    redirect();
  }, [type, id, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
};

export default ApiRedirect;
