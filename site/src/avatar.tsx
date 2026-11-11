/** Profile pictures and tier badges, shared by the header, profiles, posts and moderation. */

export type Tier = "member" | "moderator" | "admin";

function initials(name: string): string {
  const words = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => [...word][0]!.toUpperCase()).join("") || "?";
}

/** A circle: the picture if there is one, otherwise the name's initials. */
export function Avatar({ src, name, size = "sm" }: { src: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  return src ? (
    <img className={`pf-avatar pf-avatar-${size}`} src={src} alt="" loading="lazy" />
  ) : (
    <span className={`pf-avatar pf-avatar-${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Shown for moderators and admins only: members carry no badge. */
export function TierBadge({ tier }: { tier: Tier | string }) {
  if (tier !== "moderator" && tier !== "admin") return null;
  return (
    <span className={`pf-tier pf-tier-${tier}`} title={tier === "admin" ? "Site admin" : "Site moderator"}>
      {tier === "admin" ? "Admin" : "Moderator"}
    </span>
  );
}

/**
 * Crops an image file to a centred square and redraws it at 256 px as PNG, before upload.
 * The server screens the result like any post image; this only keeps uploads small and round-ready.
 */
export async function squareAvatar(file: File, size = 256): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser can't prepare the image.");
  return new File([blob], "avatar.png", { type: "image/png" });
}
