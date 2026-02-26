/**
 * After saving a video to video_cache, sync the content.audio_type array
 * so the public site immediately reflects available audio options.
 */
import { supabase } from "@/integrations/supabase/client";

export async function syncContentAudioType(tmdbId: number, contentType: string): Promise<void> {
  try {
    // Normalize content_type for querying video_cache (could be "tv" or "series")
    const cTypes = contentType === "movie" ? ["movie"] : ["series", "tv"];
    
    // Get all distinct audio_types for this content
    const { data } = await supabase
      .from("video_cache")
      .select("audio_type")
      .eq("tmdb_id", tmdbId)
      .in("content_type", cTypes)
      .gt("expires_at", new Date().toISOString());

    const audioTypes = [...new Set((data || []).map(d => d.audio_type))];

    // Update content table — try both content_types for series
    const contentCTypes = contentType === "movie" ? ["movie"] : ["series", "tv"];
    await supabase
      .from("content")
      .update({ audio_type: audioTypes })
      .eq("tmdb_id", tmdbId)
      .in("content_type", contentCTypes);
  } catch (err) {
    console.warn("[syncContentAudioType] failed:", err);
  }
}
