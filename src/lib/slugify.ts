/**
 * Converts a title + TMDB ID into a URL-friendly slug.
 * e.g. "Vingadores: Ultimato" + 299536 => "vingadores-ultimato-299536"
 * 
 * The ID is always the last segment after the last dash.
 */
export function toSlug(title: string, id: number): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove special chars
    .trim()
    .replace(/\s+/g, "-") // spaces to dashes
    .replace(/-+/g, "-") // collapse multiple dashes
    .substring(0, 80); // limit length
  return `${slug}-${id}`;
}

/**
 * Extracts the TMDB ID from a slug.
 * e.g. "vingadores-ultimato-299536" => 299536
 */
export function fromSlug(slug: string): number {
  const parts = slug.split("-");
  const id = Number(parts[parts.length - 1]);
  return isNaN(id) ? 0 : id;
}
