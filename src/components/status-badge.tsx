export function StatusBadge({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const className =
    tone === "warning"
      ? "pill warning"
      : tone === "danger"
        ? "pill danger"
        : tone === "success"
          ? "pill success"
          : "pill";

  return <span className={className}>{label}</span>;
}
