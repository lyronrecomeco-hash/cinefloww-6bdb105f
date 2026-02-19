import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Bookmark, Trash2 } from "lucide-react";
import { getMyList, removeFromMyList, MyListItem } from "@/lib/myList";
import { toSlug } from "@/lib/slugify";

const IMG_BASE = "https://image.tmdb.org/t/p/w342";

const MyListPage = () => {
  const [items, setItems] = useState<MyListItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setItems(getMyList());
  }, []);

  const handleRemove = (item: MyListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFromMyList(item.tmdb_id, item.content_type);
    setItems(getMyList());
  };

  const handleClick = (item: MyListItem) => {
    const route = item.content_type === "movie" ? "filme" : "serie";
    navigate(`/${route}/${toSlug(item.title, item.tmdb_id)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20 sm:pt-24 lg:pt-28 px-3 sm:px-6 lg:px-12 pb-20">
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Bookmark className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold">Minha Lista</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {items.length > 0 ? `${items.length} título${items.length > 1 ? "s" : ""} salvo${items.length > 1 ? "s" : ""}` : "Nenhum título salvo"}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Sua lista está vazia</p>
            <p className="text-sm mt-1">Adicione filmes e séries para assistir depois!</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2.5 sm:gap-4 lg:gap-5">
            {items.map((item) => (
              <button
                key={`${item.tmdb_id}-${item.content_type}`}
                onClick={() => handleClick(item)}
                className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-card/50 border border-white/5 hover:border-primary/30 transition-all duration-300 hover:scale-[1.03] text-left"
              >
                <div className="aspect-[2/3] relative overflow-hidden">
                  {item.poster_path ? (
                    <img
                      src={`${IMG_BASE}${item.poster_path}`}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Bookmark className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <button
                    onClick={(e) => handleRemove(item, e)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/70 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/80"
                    title="Remover da lista"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                  </button>
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-primary/80 text-[9px] font-bold text-primary-foreground uppercase">
                    {item.content_type === "movie" ? "Filme" : item.content_type === "dorama" ? "Dorama" : "Série"}
                  </div>
                </div>
                <div className="p-2 sm:p-2.5">
                  <p className="text-[11px] sm:text-xs font-medium text-foreground truncate">{item.title}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default MyListPage;
