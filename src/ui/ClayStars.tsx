import star from "./lesson-art/reward-star.webp";

/** One baked clay silhouette makes earned and unearned rewards easy to compare. */
export function ClayStars({ count }: { readonly count: number }) {
  return (
    <span className="clay-stars" aria-hidden="true">
      {[1, 2, 3].map((value) => (
        <span key={value} data-earned={value <= count}>
          <img src={star} alt="" draggable={false} width={64} height={64} />
        </span>
      ))}
    </span>
  );
}
