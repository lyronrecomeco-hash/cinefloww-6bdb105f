import { Skeleton } from "@/components/ui/skeleton";

const MovieCardSkeleton = () => (
  <div className="flex-shrink-0 w-full">
    <div className="relative aspect-[2/3] rounded-xl sm:rounded-2xl overflow-hidden mb-2 sm:mb-3">
      <Skeleton className="w-full h-full" />
    </div>
    <Skeleton className="h-3 sm:h-4 w-3/4 mb-1" />
    <Skeleton className="h-2.5 sm:h-3 w-1/3" />
  </div>
);

export default MovieCardSkeleton;
