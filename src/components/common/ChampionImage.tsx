import { initials } from "../../utils/formatting";

const SIZE_CLASSES = {
  xs: "h-9 w-9",
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-12 w-12",
} as const;

export function ChampionImage({
  championName,
  imageUrl,
  size = "md",
}: {
  championName: string;
  imageUrl: string | undefined;
  size?: keyof typeof SIZE_CLASSES;
}) {
  const sizeClass = SIZE_CLASSES[size];

  if (imageUrl) {
    return <img alt={`${championName} icon`} className={`${sizeClass} shrink-0 rounded-md border border-zinc-200 object-cover`} src={imageUrl} />;
  }

  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-500`}>
      {initials(championName)}
    </div>
  );
}
