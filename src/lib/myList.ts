const STORAGE_KEY = "lyneflix_my_list";

export interface MyListItem {
  tmdb_id: number;
  content_type: "movie" | "tv" | "dorama";
  title: string;
  poster_path: string | null;
  added_at: string;
}

function getList(): MyListItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveList(list: MyListItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addToMyList(item: Omit<MyListItem, "added_at">) {
  const list = getList();
  if (list.some((i) => i.tmdb_id === item.tmdb_id && i.content_type === item.content_type)) return;
  list.unshift({ ...item, added_at: new Date().toISOString() });
  saveList(list);
}

export function removeFromMyList(tmdb_id: number, content_type: string) {
  const list = getList().filter((i) => !(i.tmdb_id === tmdb_id && i.content_type === content_type));
  saveList(list);
}

export function isInMyList(tmdb_id: number, content_type: string): boolean {
  return getList().some((i) => i.tmdb_id === tmdb_id && i.content_type === content_type);
}

export function getMyList(): MyListItem[] {
  return getList();
}
