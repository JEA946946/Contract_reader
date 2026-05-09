import { useEffect, useState } from "react";
import { getStats } from "../api/client";
import type { Stats } from "../types";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
  }, []);

  if (!stats) return <p>Loading...</p>;

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 12,
    padding: "1.5rem",
    flex: 1,
    minWidth: 200,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#1a1a2e" }}>
            {stats.total_documents}
          </div>
          <div style={{ color: "#888" }}>Documents</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#1a1a2e" }}>
            {stats.total_hotels}
          </div>
          <div style={{ color: "#888" }}>Hotels</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#1a1a2e" }}>
            {stats.total_prices}
          </div>
          <div style={{ color: "#888" }}>Price Rows</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#1a1a2e" }}>
            {stats.cities.length}
          </div>
          <div style={{ color: "#888" }}>Cities</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#1a1a2e" }}>
            {stats.total_restaurants}
          </div>
          <div style={{ color: "#888" }}>Restaurants</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#1a1a2e" }}>
            {stats.total_menu_prices}
          </div>
          <div style={{ color: "#888" }}>Menu Prices</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#1a1a2e" }}>
            {stats.total_transport_companies}
          </div>
          <div style={{ color: "#888" }}>Transport Companies</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#1a1a2e" }}>
            {stats.total_transport_prices}
          </div>
          <div style={{ color: "#888" }}>Transport Prices</div>
        </div>
      </div>

      {stats.cities.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>Cities</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {stats.cities.map((city) => (
              <Link
                key={city}
                to={`/prices?city=${encodeURIComponent(city)}`}
                style={{
                  padding: "0.3rem 0.8rem",
                  background: "#e8eaf6",
                  borderRadius: 16,
                  fontSize: "0.85rem",
                  textDecoration: "none",
                  color: "#1a1a2e",
                }}
              >
                {city}
              </Link>
            ))}
          </div>
        </div>
      )}

      {stats.recent_uploads.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Recent Uploads</h3>
          {stats.recent_uploads.map((doc) => (
            <div
              key={doc.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.5rem 0",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <div>
                <strong>{doc.filename}</strong>
                <span style={{ marginLeft: 8, color: "#888", fontSize: "0.85rem" }}>
                  {doc.file_type.toUpperCase()}
                </span>
              </div>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "#888" }}>
                  {new Date(doc.upload_date).toLocaleDateString()}
                </span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: "0.8rem",
                    background: doc.status === "completed" ? "#e8f5e9" : "#ffebee",
                    color: doc.status === "completed" ? "#2e7d32" : "#c62828",
                  }}
                >
                  {doc.row_count ?? 0} rows
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {stats.total_documents === 0 && (
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", color: "#888" }}>
            No documents uploaded yet.
          </p>
          <Link
            to="/upload"
            style={{
              display: "inline-block",
              padding: "0.6rem 1.5rem",
              background: "#e94560",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Upload your first document
          </Link>
        </div>
      )}
    </div>
  );
}
