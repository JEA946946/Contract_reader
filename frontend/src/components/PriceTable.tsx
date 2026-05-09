import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Price, Hotel } from "../types";
import { getDocumentFileUrl } from "../api/client";

interface PriceTableProps {
  prices: Price[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  selectedHotelIds: Set<number>;
  onToggleHotel: (hotelId: number) => void;
  onToggleAll: () => void;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

const SEASON_DISPLAY: Record<string, { label: string; color: string }> = {
  "Low":      { label: "Low Season",    color: "#4caf50" },
  "Medium":   { label: "Medium Season", color: "#2196f3" },
  "High":     { label: "High Season",   color: "#ff9800" },
  "Peak":     { label: "Peak Season",   color: "#e94560" },
  "All Year": { label: "All Year",      color: "#78909c" },
};

function HotelModal({ hotel, onClose, onEdit }: { hotel: Hotel; onClose: () => void; onEdit: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "2rem",
          minWidth: 360,
          maxWidth: 500,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 style={{ margin: 0, fontSize: "1rem", color: "#1a1a2e" }}>{hotel.name}</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1rem",
              cursor: "pointer",
              color: "#888",
              padding: 0,
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>

        {hotel.stars && (
          <div style={{ color: "#f59e0b", fontSize: "0.75rem", marginTop: "0.3rem" }}>
            {"★".repeat(hotel.stars)}
          </div>
        )}

        <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <InfoRow label="City" value={hotel.city} />
          <InfoRow label="Type" value={hotel.type} />
          <InfoRow label="Address" value={hotel.address} />
          <InfoRow label="Phone" value={hotel.phone} />
          <InfoRow
            label="Email"
            value={
              hotel.email ? (
                <a href={`mailto:${hotel.email}`} style={{ color: "#1976d2" }}>
                  {hotel.email}
                </a>
              ) : null
            }
          />
        </div>

        <button
          onClick={() => { onClose(); onEdit(); }}
          style={{
            marginTop: "1.5rem",
            background: "#1a1a2e",
            color: "#fff",
            border: "none",
            padding: "0.5rem 1.2rem",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.65rem",
            width: "100%",
          }}
        >
          Edit Hotel
        </button>
      </div>
    </div>
  );
}

function ContractModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "90vw",
          height: "90vh",
          maxWidth: 1100,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid #eee",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "0.8rem", color: "#1a1a2e" }}>Contract</span>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <a
              href={url}
              download
              style={{
                fontSize: "0.65rem",
                color: "#1976d2",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Download
            </a>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.1rem",
                cursor: "pointer",
                color: "#888",
                padding: 0,
                lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
        </div>
        <iframe
          src={url}
          title="Contract"
          style={{ flex: 1, border: "none", width: "100%" }}
        />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: "0.6rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </div>
      <div style={{ fontSize: "0.75rem", color: "#333", marginTop: "0.15rem" }}>{value}</div>
    </div>
  );
}

export default function PriceTable({
  prices,
  total,
  page,
  pageSize,
  onPageChange,
  selectedHotelIds,
  onToggleHotel,
  onToggleAll,
}: PriceTableProps) {
  const totalPages = Math.ceil(total / pageSize);
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [contractUrl, setContractUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  // Unique hotel IDs on current page
  const pageHotelIds = [...new Set(prices.map((p) => p.hotel.id))];
  const allPageSelected = pageHotelIds.length > 0 && pageHotelIds.every((id) => selectedHotelIds.has(id));

  const thStyle: React.CSSProperties = {
    padding: "0.6rem 0.75rem",
    textAlign: "left",
    background: "#1a1a2e",
    color: "#fff",
    fontSize: "0.6rem",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
  };

  const tdStyle: React.CSSProperties = {
    padding: "0.5rem 0.75rem",
    borderBottom: "1px solid #eee",
    fontSize: "0.65rem",
  };

  return (
    <div>
      {selectedHotel && (
        <HotelModal
          hotel={selectedHotel}
          onClose={() => setSelectedHotel(null)}
          onEdit={() => navigate(`/edit-hotel/${selectedHotel.id}`)}
        />
      )}
      {contractUrl && (
        <ContractModal url={contractUrl} onClose={() => setContractUrl(null)} />
      )}

      <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #ddd" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 36, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={onToggleAll}
                  style={{ cursor: "pointer" }}
                />
              </th>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Hotel</th>
              <th style={thStyle}>City</th>
              <th style={thStyle}>Room</th>
              <th style={thStyle}>Meal</th>
              <th style={thStyle}>Stars</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Double</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Single</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Twin</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Trp</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Quad</th>
              <th style={thStyle}>FIT/GIT</th>
              <th style={thStyle}>Season</th>
              <th style={thStyle}>Dates</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {prices.length === 0 ? (
              <tr>
                <td colSpan={16} style={{ ...tdStyle, textAlign: "center", color: "#888" }}>
                  No prices found
                </td>
              </tr>
            ) : (
              prices.map((p) => (
                <tr key={p.id} style={{ transition: "background 0.15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedHotelIds.has(p.hotel.id)}
                      onChange={() => onToggleHotel(p.hotel.id)}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ ...tdStyle, color: "#888", fontSize: "0.6rem" }}>
                    {p.hotel.id}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => setSelectedHotel(p.hotel)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "#1976d2",
                        cursor: "pointer",
                        fontWeight: 500,
                        fontSize: "0.65rem",
                        textAlign: "left",
                        textDecoration: "underline",
                        textDecorationColor: "transparent",
                        transition: "text-decoration-color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "#1976d2")}
                      onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
                    >
                      {p.hotel.name}
                    </button>
                  </td>
                  <td style={tdStyle}>{p.hotel.city}</td>
                  <td style={tdStyle}>{p.room_desc || "-"}</td>
                  <td style={tdStyle}>
                    {p.meal_plan ? (
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: "0.6rem",
                          fontWeight: 600,
                          background: "#f3e8ff",
                          color: "#7c3aed",
                        }}
                      >
                        {p.meal_plan}
                      </span>
                    ) : "-"}
                  </td>
                  <td style={tdStyle}>
                    {p.hotel.stars ? `${p.hotel.stars}*` : "-"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                    {p.double_price ?? "-"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {p.single_price ?? "-"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {p.twin_price ?? "-"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {p.triple_price ?? "-"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {p.quadruple_price ?? "-"}
                  </td>
                  <td style={tdStyle}>{p.fit_git || "-"}</td>
                  <td style={tdStyle}>
                    {p.season_code ? (() => {
                      const info = SEASON_DISPLAY[p.season_code];
                      const label = info?.label || p.season_code;
                      const bg = info?.color || "#78909c";
                      return (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: "0.6rem",
                            background: bg,
                            color: "#fff",
                          }}
                        >
                          {label}
                        </span>
                      );
                    })() : (
                      "-"
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: "0.6rem", whiteSpace: "nowrap" }}>
                    {p.season_dates.length > 0
                      ? p.season_dates.map((sd, i) => (
                          <div key={i}>
                            {fmtDate(sd.date_from)} ~ {fmtDate(sd.date_to)}
                          </div>
                        ))
                      : "-"}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <button
                        onClick={() => navigate(`/edit-hotel/${p.hotel.id}`)}
                        style={{
                          background: "#e8f4fd",
                          color: "#1976d2",
                          border: "none",
                          padding: "0.25rem 0.6rem",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: "0.6rem",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Edit
                      </button>
                      {(p.hotel.source_document_id || p.document_id) && (
                        <button
                          onClick={() => setContractUrl(getDocumentFileUrl((p.hotel.source_document_id || p.document_id)!))}
                          style={{
                            background: "#f0fdf4",
                            color: "#16a34a",
                            border: "none",
                            padding: "0.25rem 0.6rem",
                            borderRadius: 4,
                            cursor: "pointer",
                            fontSize: "0.6rem",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          View
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: 4,
              border: "1px solid #ddd",
              background: page <= 1 ? "#f5f5f5" : "#fff",
              cursor: page <= 1 ? "default" : "pointer",
            }}
          >
            Previous
          </button>
          <span style={{ padding: "0.4rem 0.8rem", color: "#666" }}>
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: 4,
              border: "1px solid #ddd",
              background: page >= totalPages ? "#f5f5f5" : "#fff",
              cursor: page >= totalPages ? "default" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
