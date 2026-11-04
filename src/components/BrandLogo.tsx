/** The church logo on a white tile, so the plum artwork stays visible in dark mode. */
export function BrandLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const name = process.env.NEXT_PUBLIC_CHURCH_NAME || "The Triumphant Family";
  return (
    <span className={`logo-tile ${size}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt={`${name} logo`} />
    </span>
  );
}
