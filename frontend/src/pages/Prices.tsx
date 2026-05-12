import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getPrices, deleteHotel, uploadDocument } from "../api/client";
import type { Price } from "../types";
import Filters from "../components/Filters";
import PriceTable from "../components/PriceTable";
import ExportButton from "../components/ExportButton";

export default function Prices() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedHotelIds, setSelectedHotelIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState<{
    city?: string;
    hotel_type?: string;
    price_min?: number;
    price_max?: number;
    search?: string;
    max_room_types?: number;
  }>({
    city: searchParams.get("city") || undefined,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPrices({ ...filters, page, page_size: 50 })
      .then((data) => {
        if (!cancelled) {
          setPrices(data.items);
          setTotal(data.total);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filters, page, refreshKey]);

  const handleFilterChange = useCallback(
    (newFilters: { city?: string; hotel_type?: string; price_min?: number; price_max?: number; search?: string; max_room_types?: number }) => {
      setFilters(newFilters);
      setPage(1);
    },
    []
  );

  const toggleHotel = useCallback((hotelId: number) => {
    setSelectedHotelIds((prev) => {
      const next = new Set(prev);
      if (next.has(hotelId)) next.delete(hotelId);
      else next.add(hotelId);
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback(() => {
    const pageHotelIds = [...new Set(prices.map((p) => p.hotel.id))];
    setSelectedHotelIds((prev) => {
      const allSelected = pageHotelIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        pageHotelIds.forEach((id) => next.delete(id));
      } else {
        pageHotelIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [prices]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const result = await uploadDocument(file);
      navigate(`/review/${result.id}`);
    } catch (err) {
      alert("Import failed: " + (err instanceof Error ? err.message : "Unknown error"));
      setImporting(false);
    }
  }

  async function handleDelete() {
    const ids = [...selectedHotelIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} hotel${ids.length > 1 ? "s" : ""} and all their prices?`)) return;
    setDeleting(true);
    for (const id of ids) {
      try {
        await deleteHotel(id);
      } catch {
        // skip failed
      }
    }
    setSelectedHotelIds(new Set());
    setDeleting(false);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <h2 style={{ margin: 0 }}>Hotel Prices</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {selectedHotelIds.size > 0 && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                background: "#e53935",
                color: "#fff",
                border: "none",
                padding: "0.45rem 1rem",
                borderRadius: 6,
                cursor: deleting ? "default" : "pointer",
                fontWeight: 600,
                fontSize: "0.65rem",
                opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? "Deleting..." : `Delete ${selectedHotelIds.size} hotel${selectedHotelIds.size > 1 ? "s" : ""}`}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={handleImport}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{
              background: "#1976d2",
              color: "#fff",
              border: "none",
              padding: "0.45rem 1rem",
              borderRadius: 6,
              cursor: importing ? "default" : "pointer",
              fontWeight: 600,
              fontSize: "0.65rem",
              opacity: importing ? 0.6 : 1,
            }}
          >
            {importing ? "Importing..." : "Import"}
          </button>
          <ExportButton filters={{ city: filters.city }} />
        </div>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <Filters onFilterChange={handleFilterChange} />
      </div>

      {loading ? (
        <p style={{ color: "#888" }}>Loading prices...</p>
      ) : (
        <PriceTable
          prices={prices}
          total={total}
          page={page}
          pageSize={50}
          onPageChange={setPage}
          selectedHotelIds={selectedHotelIds}
          onToggleHotel={toggleHotel}
          onToggleAll={toggleAllOnPage}
        />
      )}
    </div>
  );
}
