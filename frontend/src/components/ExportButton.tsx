import { getExportUrl } from "../api/client";

interface ExportButtonProps {
  filters: { city?: string; hotel_name?: string; season_code?: string };
}

export default function ExportButton({ filters }: ExportButtonProps) {
  const btnStyle: React.CSSProperties = {
    padding: "0.5rem 1rem",
    borderRadius: 6,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: "0.85rem",
    textDecoration: "none",
    color: "#333",
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <a href={getExportUrl("csv", filters)} download style={btnStyle}>
        Export CSV
      </a>
      <a href={getExportUrl("excel", filters)} download style={btnStyle}>
        Export Excel
      </a>
    </div>
  );
}
