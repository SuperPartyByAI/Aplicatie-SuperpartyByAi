function SkeletonCard() {
  return <div className="skeleton-card skeleton"></div>;
}

export function SkeletonList({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <SkeletonCard key={idx} />
      ))}
    </>
  );
}

export default SkeletonCard;
